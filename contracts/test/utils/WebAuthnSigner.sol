// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Vm} from "forge-std/Vm.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";

/// @notice Produces WebAuthn assertions inside Foundry with `vm.signP256`, byte-compatible with a platform
///         authenticator (UP|UV flags, low-s signature), so tests can seal arbitrary records.
library WebAuthnSigner {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 private constant N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551;

    function assertion(uint256 privateKey, bytes32 challenge, string memory rpId)
        internal
        pure
        returns (WebAuthn.WebAuthnAuth memory a)
    {
        a.authenticatorData = abi.encodePacked(sha256(bytes(rpId)), bytes1(0x05), uint32(0));
        a.clientDataJSON = string.concat(
            '{"type":"webauthn.get","challenge":"', Base64.encodeURL(abi.encodePacked(challenge)), '","origin":"https://',
            rpId, '"}'
        );
        a.typeIndex = 1;
        a.challengeIndex = 23;
        bytes32 digest = sha256(abi.encodePacked(a.authenticatorData, sha256(bytes(a.clientDataJSON))));
        (bytes32 r, bytes32 s) = vm.signP256(privateKey, digest);
        if (uint256(s) > N / 2) s = bytes32(N - uint256(s));
        (a.r, a.s) = (r, s);
    }
}
