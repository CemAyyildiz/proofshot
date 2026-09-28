// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";

/// @title Proofshot Registry
/// @notice Public, shared registry of Capture Records (device-signed Seals) and Imported Records (unsigned
///         fingerprints a Carrier imports). Stores hashes, commitments and identifiers only — never image bytes,
///         names, contacts or precise locations (NFR-5). Fingerprints live in events; state holds only what the
///         write paths must enforce (SM-C3).
/// @dev Writes are relayer-only in v1: the relayer sponsors fees (FR-7) and attests that `carrierId`/`claimRef`
///      come from a valid Claim Link. Capturer authorship is still proven onchain by the Device Key's WebAuthn
///      signature over the whole record.
contract Registry is AccessControl {
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

    /// @notice Maximum blocks between the referenced block and inclusion (~30 s at 300 ms blocks).
    uint256 public constant MAX_LAG = 100;

    mapping(bytes32 keyId => DeviceKey) private _deviceKeys;
    mapping(bytes32 exactHash => bool) public isSealed;
    mapping(bytes32 exactHash => bool) public isImported;
    /// @notice WebAuthn RP ID hashes (sha256 of the RP ID) whose assertions are accepted.
    mapping(bytes32 rpIdHash => bool) public allowedRpIdHash;

    event DeviceKeyRegistered(bytes32 indexed keyId, bytes32 qx, bytes32 qy);
    event DeviceKeyRevoked(bytes32 indexed keyId, uint64 atBlock);
    event RpIdHashAllowed(bytes32 indexed rpIdHash, bool allowed);
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

    constructor(address admin, address relayer, bytes32[] memory rpIdHashes) {
        if (admin == address(0) || relayer == address(0)) revert ZeroValue();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RELAYER_ROLE, relayer);
        for (uint256 i; i < rpIdHashes.length; i++) _setRpIdHash(rpIdHashes[i], true);
    }

    // ─── Admin ─────────────────────────────────────────────────────────────────────────────────────────────

    function setRpIdHash(bytes32 rpIdHash, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRpIdHash(rpIdHash, allowed);
    }

    // ─── Device Keys ───────────────────────────────────────────────────────────────────────────────────────

    /// @notice Registers a passkey public key. Keys are immutable once registered; a new device gets a new key.
    function registerDeviceKey(bytes32 keyId, bytes32 qx, bytes32 qy) external onlyRole(RELAYER_ROLE) {
        if (keyId == 0 || (qx == 0 && qy == 0)) revert ZeroValue();
        if (_deviceKeys[keyId].qx != 0 || _deviceKeys[keyId].qy != 0) revert DeviceKeyExists(keyId);
        _deviceKeys[keyId] = DeviceKey(qx, qy, 0);
        emit DeviceKeyRegistered(keyId, qx, qy);
    }

    /// @notice Stops a key from sealing from this block on. Earlier Seals stay valid for their Signing Window (T-7).
    function revokeDeviceKey(bytes32 keyId) external onlyRole(RELAYER_ROLE) {
        DeviceKey storage key = _deviceKeys[keyId];
        if (key.qx == 0 && key.qy == 0) revert UnknownDeviceKey(keyId);
        if (key.revokedAtBlock == 0) {
            key.revokedAtBlock = uint64(block.number);
            emit DeviceKeyRevoked(keyId, uint64(block.number));
        }
    }

    function deviceKey(bytes32 keyId) external view returns (DeviceKey memory) {
        return _deviceKeys[keyId];
    }

    // ─── Seal ──────────────────────────────────────────────────────────────────────────────────────────────

    /// @notice Writes a Capture Record after verifying the Device Key's WebAuthn assertion over
    ///         `sha256(abi.encode(r))`, with user verification required.
    function seal(bytes32 keyId, CaptureRecord calldata r, WebAuthn.WebAuthnAuth calldata auth)
        external
        onlyRole(RELAYER_ROLE)
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
    /// @return imported Number of records actually written.
    function importRecords(bytes32 carrierId, ImportRecord[] calldata records)
        external
        onlyRole(RELAYER_ROLE)
        returns (uint256 imported)
    {
        if (carrierId == 0) revert ZeroValue();
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
