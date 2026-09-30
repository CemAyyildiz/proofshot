// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";

/// @title Spike B: onchain passkey verification for a full-size Seal
/// @notice Throwaway contract that mirrors the planned Registry `seal()` shape closely enough to measure gas and
///         latency on Monad. Not the production Registry (Story 3.1).
contract PasskeySpike {
    struct CaptureRecord {
        bytes32 exactHash;
        bytes32 pHash;
        bytes32[16] tiles;
        uint32 width;
        uint32 height;
        bytes32 locCommit;
        uint64 deviceTime;
        bytes32 claimRef;
        bytes32 carrierId;
        uint64 refBlock;
    }

    struct DeviceKey {
        bytes32 qx;
        bytes32 qy;
    }

    uint256 public constant MAX_LAG = 100;

    mapping(bytes32 keyId => DeviceKey) public deviceKeys;
    mapping(bytes32 exactHash => bool) public isSealed;

    event DeviceKeyRegistered(bytes32 indexed keyId, bytes32 qx, bytes32 qy);
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

    error UnknownDeviceKey(bytes32 keyId);
    error AlreadySealed(bytes32 exactHash);
    error SigningWindowExpired(uint64 refBlock, uint256 currentBlock);
    error InvalidSignature();

    function registerDeviceKey(bytes32 keyId, bytes32 qx, bytes32 qy) external {
        deviceKeys[keyId] = DeviceKey(qx, qy);
        emit DeviceKeyRegistered(keyId, qx, qy);
    }

    function seal(bytes32 keyId, CaptureRecord calldata r, WebAuthn.WebAuthnAuth calldata auth) external {
        DeviceKey memory key = deviceKeys[keyId];
        if (key.qx == 0 && key.qy == 0) revert UnknownDeviceKey(keyId);
        if (isSealed[r.exactHash]) revert AlreadySealed(r.exactHash);
        if (r.refBlock > block.number || block.number - r.refBlock > MAX_LAG) {
            revert SigningWindowExpired(r.refBlock, block.number);
        }
        bytes memory challenge = abi.encodePacked(sha256(abi.encode(r)));
        if (!WebAuthn.verify(challenge, auth, key.qx, key.qy, true)) revert InvalidSignature();

        isSealed[r.exactHash] = true;
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
}
