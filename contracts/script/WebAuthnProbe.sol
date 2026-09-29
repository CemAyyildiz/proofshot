// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";

/// @notice Keyless live probe (never deployed): executed via `eth_call` of its creation code, the constructor runs
///         the exact OpenZeppelin WebAuthn verification the Registry uses on the target chain's own EVM and reports
///         the result and the gas it took by reverting with `Result`.
contract WebAuthnProbe {
    error Result(bool valid, uint256 gasUsed, bool precompileAccepted);

    constructor(bytes memory challenge, WebAuthn.WebAuthnAuth memory auth, bytes32 qx, bytes32 qy) {
        uint256 start = gasleft();
        bool valid = WebAuthn.verify(challenge, auth, qx, qy, true);
        uint256 used = start - gasleft();
        // Ask the precompile directly with the same inputs: 1 means the native P-256 path accepted the signature.
        bytes32 h = sha256(abi.encodePacked(auth.authenticatorData, sha256(bytes(auth.clientDataJSON))));
        (bool ok, bytes memory out) = address(0x100).staticcall(abi.encode(h, auth.r, auth.s, qx, qy));
        revert Result(valid, used, ok && out.length == 32 && abi.decode(out, (uint256)) == 1);
    }
}
