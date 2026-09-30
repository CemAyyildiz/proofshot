// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControlDefaultAdminRules} from "@openzeppelin/contracts/access/extensions/AccessControlDefaultAdminRules.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";

/// @title Proofshot Registry
/// @notice Public, shared registry of Capture Records (device-signed Seals) and Imported Records (unsigned
///         fingerprints a Carrier imports). Stores hashes, commitments and identifiers only — never image bytes,
///         names, contacts or precise locations (NFR-5). Fingerprints live in events; state holds only what the
///         write paths must enforce (SM-C3).
/// @dev Writes are relayer-only in v1: the relayer sponsors fees (FR-7) and attests that `carrierId`/`claimRef`
///      come from a valid Claim Link. Capturer authorship is still proven onchain by the Device Key's WebAuthn
///      signature over the whole record.
///
///      Incident response for a compromised relayer key: the admin (a separate, cold key) pauses all writes, revokes
///      the relayer role and any Device Keys it registered, grants the role to a fresh relayer, and unpauses.
///      Records already written stay in the event log; their `keyId` and block let verifiers discount them.
///
///      Roles: exactly one admin (OpenZeppelin DefaultAdminRules), moved only by a two-step transfer that the new
///      admin must accept after `ADMIN_TRANSFER_DELAY`, so the Registry can't be orphaned by a stray `renounceRole` or
///      handed to a mistyped address. No account may ever hold both the admin and the relayer role.
contract Registry is AccessControlDefaultAdminRules, Pausable {
    struct CaptureRecord {
        bytes32 exactHash; // SHA-256 of the original image bytes
        bytes32 pHash; // PDQ of the whole image
        bytes32[16] tiles; // PDQ of a 4x4 grid, row-major
        uint32 width;
        uint32 height;
        bytes32 locCommit; // salted location commitment, or zero
        uint64 deviceTime; // capture time claimed by the device (unix seconds)
        bytes32 claimRef; // keccak256 of the Claim File id; opaque
        bytes32 carrierId; // pseudonymous Carrier ID
        uint64 refBlock; // lower bound of the Signing Window
    }

    struct ImportRecord {
        bytes32 exactHash;
        bytes32 pHash;
        bytes32[16] tiles;
        uint32 width;
        uint32 height;
    }

    struct DeviceKey {
        bytes32 qx;
        bytes32 qy;
        uint64 revokedAtBlock; // 0 = active
    }

    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    /// @notice Wait between starting and accepting an admin transfer (including a renounce, i.e. a transfer to zero).
    uint48 public constant ADMIN_TRANSFER_DELAY = 1 days;

    /// @notice Maximum blocks between the referenced block and inclusion (~30 s at 300 ms blocks).
    uint256 public constant MAX_LAG = 100;

    /// @notice Largest `importRecords` batch. Each record costs ~35k execution gas plus ~11k calldata gas, so 200
    ///         records (~9.3M) stay well under the 2^24 per-transaction gas cap (EIP-7825) instead of reverting late.
    uint256 public constant MAX_IMPORT_BATCH = 200;

    mapping(bytes32 keyId => DeviceKey) private _deviceKeys;
    mapping(bytes32 exactHash => bool) public isSealed;
    mapping(bytes32 exactHash => bool) public isImported;
    /// @notice WebAuthn RP ID hashes (sha256 of the RP ID) whose assertions are accepted.
    mapping(bytes32 rpIdHash => bool) public allowedRpIdHash;

    /// @notice A passkey public key (P-256 point `qx`, `qy`) became usable for Seals under `keyId`.
    event DeviceKeyRegistered(bytes32 indexed keyId, bytes32 qx, bytes32 qy);
    /// @notice `keyId` can no longer seal from block `atBlock` on. Earlier Seals are unaffected.
    event DeviceKeyRevoked(bytes32 indexed keyId, uint64 atBlock);
    /// @notice Assertions whose authenticator data starts with `rpIdHash` (sha256 of an RP ID) are accepted or not.
    event RpIdHashAllowed(bytes32 indexed rpIdHash, bool allowed);
    /// @notice A Capture Record was sealed. This event *is* the public record: verifiers read every field from it.
    ///         `claimRef` is not indexed because only three topics are available; index it offchain.
    event CaptureSealed(
        bytes32 indexed exactHash,
        bytes32 indexed keyId,
        bytes32 indexed carrierId,
        bytes32 pHash,
        bytes32[16] tiles,
        uint32 width,
        uint32 height,
        bytes32 locCommit,
        bytes32 claimRef,
        uint64 deviceTime,
        uint64 refBlock
    );
    /// @notice A Carrier imported fingerprints of a photo received outside Proofshot. Unsigned by design.
    event RecordImported(
        bytes32 indexed exactHash, bytes32 indexed carrierId, bytes32 pHash, bytes32[16] tiles, uint32 width, uint32 height
    );

    error ZeroValue();
    error DeviceKeyExists(bytes32 keyId);
    error UnknownDeviceKey(bytes32 keyId);
    error DeviceKeyIsRevoked(bytes32 keyId);
    error AlreadySealed(bytes32 exactHash);
    error SigningWindowExpired(uint64 refBlock, uint256 currentBlock);
    error RpIdNotAllowed(bytes32 rpIdHash);
    error InvalidSignature();
    error AdminIsRelayer();
    error NotAuthorized();
    error BatchTooLarge(uint256 size, uint256 max);

    constructor(address admin, address relayer, bytes32[] memory rpIdHashes)
        AccessControlDefaultAdminRules(ADMIN_TRANSFER_DELAY, admin)
    {
        if (relayer == address(0)) revert ZeroValue();
        _grantRole(RELAYER_ROLE, relayer);
        for (uint256 i; i < rpIdHashes.length; i++) _setRpIdHash(rpIdHashes[i], true);
    }

    /// @dev The relayer is a hot key on a server; the admin is a separate cold key that can stop it. Enforced on every
    ///      grant (deploy, `grantRole`, accepting an admin transfer), not only at deploy.
    function _grantRole(bytes32 role, address account) internal override returns (bool) {
        if (role == RELAYER_ROLE && hasRole(DEFAULT_ADMIN_ROLE, account)) revert AdminIsRelayer();
        if (role == DEFAULT_ADMIN_ROLE && hasRole(RELAYER_ROLE, account)) revert AdminIsRelayer();
        return super._grantRole(role, account);
    }

    // ─── Admin ─────────────────────────────────────────────────────────────────────────────────────────────

    /// @notice Allows or disallows passkeys created for an RP ID (e.g. a new production or preview hostname).
    /// @param rpIdHash sha256 of the RP ID string.
    function setRpIdHash(bytes32 rpIdHash, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRpIdHash(rpIdHash, allowed);
    }

    /// @notice Stops every write (Seals, imports, key registration). Reads and past records are unaffected.
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ─── Device Keys ───────────────────────────────────────────────────────────────────────────────────────

    /// @notice Registers a passkey public key. Keys are immutable once registered; a new device gets a new key.
    /// @param keyId keccak256 of the WebAuthn credential ID.
    /// @param qx P-256 public key x coordinate.
    /// @param qy P-256 public key y coordinate.
    function registerDeviceKey(bytes32 keyId, bytes32 qx, bytes32 qy) external onlyRole(RELAYER_ROLE) whenNotPaused {
        if (keyId == 0 || (qx == 0 && qy == 0)) revert ZeroValue();
        if (_deviceKeys[keyId].qx != 0 || _deviceKeys[keyId].qy != 0) revert DeviceKeyExists(keyId);
        _deviceKeys[keyId] = DeviceKey(qx, qy, 0);
        emit DeviceKeyRegistered(keyId, qx, qy);
    }

    /// @notice Stops a key from sealing from this block on. Earlier Seals stay valid for their Signing Window (T-7).
    ///         The admin can revoke too, so keys registered by a compromised relayer can be cut off while paused.
    function revokeDeviceKey(bytes32 keyId) external {
        if (!hasRole(RELAYER_ROLE, msg.sender) && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert NotAuthorized();
        DeviceKey storage key = _deviceKeys[keyId];
        if (key.qx == 0 && key.qy == 0) revert UnknownDeviceKey(keyId);
        if (key.revokedAtBlock == 0) {
            key.revokedAtBlock = uint64(block.number);
            emit DeviceKeyRevoked(keyId, uint64(block.number));
        }
    }

    /// @return The registered public key and its revocation block (0 if active); all zero if unknown.
    function deviceKey(bytes32 keyId) external view returns (DeviceKey memory) {
        return _deviceKeys[keyId];
    }

    // ─── Seal ──────────────────────────────────────────────────────────────────────────────────────────────

    /// @notice Writes a Capture Record after verifying the Device Key's WebAuthn assertion over
    ///         `sha256(abi.encode(r))`, with user verification required.
    /// @dev Checks, in order: key registered and not revoked, Exact Hash not yet sealed, `refBlock` within
    ///      `MAX_LAG` blocks (the Signing Window), RP ID allowed, then the P-256 signature via the precompile.
    ///      `r.deviceTime` is the device's own clock and is recorded as claimed, not enforced: the Signing Window,
    ///      bounded by block numbers, is the trustworthy time.
    /// @param keyId Device Key that signed.
    /// @param r The Capture Record exactly as signed.
    /// @param auth The WebAuthn assertion (authenticator data, client data JSON, low-s signature).
    function seal(bytes32 keyId, CaptureRecord calldata r, WebAuthn.WebAuthnAuth calldata auth)
        external
        onlyRole(RELAYER_ROLE)
        whenNotPaused
    {
        DeviceKey memory key = _deviceKeys[keyId];
        if (key.qx == 0 && key.qy == 0) revert UnknownDeviceKey(keyId);
        if (key.revokedAtBlock != 0) revert DeviceKeyIsRevoked(keyId);
        if (isSealed[r.exactHash]) revert AlreadySealed(r.exactHash);
        if (r.refBlock > block.number || block.number - r.refBlock > MAX_LAG) {
            revert SigningWindowExpired(r.refBlock, block.number);
        }
        bytes32 rpIdHash = auth.authenticatorData.length >= 32 ? bytes32(auth.authenticatorData[0:32]) : bytes32(0);
        if (!allowedRpIdHash[rpIdHash]) revert RpIdNotAllowed(rpIdHash);

        bytes memory challenge = abi.encodePacked(sha256(abi.encode(r)));
        if (!WebAuthn.verify(challenge, auth, key.qx, key.qy, true)) revert InvalidSignature();

        isSealed[r.exactHash] = true;
        _emitSealed(keyId, r);
    }

    // ─── Imported Records ──────────────────────────────────────────────────────────────────────────────────

    /// @notice Registers fingerprints of photos a Carrier received outside Proofshot (FR-13). Unsigned by design.
    ///         Already-imported or already-sealed Exact Hashes are skipped so a retried batch never reverts.
    /// @param carrierId Pseudonymous ID of the importing Carrier.
    /// @param records Fingerprints only; never image bytes.
    /// @return imported Number of records actually written.
    function importRecords(bytes32 carrierId, ImportRecord[] calldata records)
        external
        onlyRole(RELAYER_ROLE)
        whenNotPaused
        returns (uint256 imported)
    {
        if (carrierId == 0) revert ZeroValue();
        if (records.length > MAX_IMPORT_BATCH) revert BatchTooLarge(records.length, MAX_IMPORT_BATCH);
        for (uint256 i; i < records.length; i++) {
            ImportRecord calldata rec = records[i];
            if (isImported[rec.exactHash] || isSealed[rec.exactHash]) continue;
            isImported[rec.exactHash] = true;
            imported++;
            emit RecordImported(rec.exactHash, carrierId, rec.pHash, rec.tiles, rec.width, rec.height);
        }
    }

    function _emitSealed(bytes32 keyId, CaptureRecord calldata r) private {
        emit CaptureSealed(
            r.exactHash,
            keyId,
            r.carrierId,
            r.pHash,
            r.tiles,
            r.width,
            r.height,
            r.locCommit,
            r.claimRef,
            r.deviceTime,
            r.refBlock
        );
    }

    function _setRpIdHash(bytes32 rpIdHash, bool allowed) private {
        if (rpIdHash == 0) revert ZeroValue();
        allowedRpIdHash[rpIdHash] = allowed;
        emit RpIdHashAllowed(rpIdHash, allowed);
    }
}
