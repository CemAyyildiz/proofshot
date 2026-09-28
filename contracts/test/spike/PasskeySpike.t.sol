// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";
import {PasskeySpike} from "../../src/spike/PasskeySpike.sol";

contract PasskeySpikeTest is Test {
    PasskeySpike spike;
    string json;
    bytes32 keyId;

    function setUp() public {
        json = vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/webauthn-software.json"));
        keyId = vm.parseJsonBytes32(json, ".keyId");
        spike = new PasskeySpike();
        spike.registerDeviceKey(keyId, vm.parseJsonBytes32(json, ".qx"), vm.parseJsonBytes32(json, ".qy"));
        vm.roll(vm.parseJsonUint(json, ".record.refBlock") + 5);
    }

    function _record() internal view returns (PasskeySpike.CaptureRecord memory r) {
        r.exactHash = vm.parseJsonBytes32(json, ".record.exactHash");
        r.pHash = vm.parseJsonBytes32(json, ".record.pHash");
        bytes32[] memory tiles = vm.parseJsonBytes32Array(json, ".record.tiles");
        for (uint256 i; i < 16; i++) r.tiles[i] = tiles[i];
        r.width = uint32(vm.parseJsonUint(json, ".record.width"));
        r.height = uint32(vm.parseJsonUint(json, ".record.height"));
        r.locCommit = vm.parseJsonBytes32(json, ".record.locCommit");
        r.deviceTime = uint64(vm.parseJsonUint(json, ".record.deviceTime"));
        r.claimRef = vm.parseJsonBytes32(json, ".record.claimRef");
        r.carrierId = vm.parseJsonBytes32(json, ".record.carrierId");
        r.refBlock = uint64(vm.parseJsonUint(json, ".record.refBlock"));
    }

    function _auth(string memory key) internal view returns (WebAuthn.WebAuthnAuth memory a) {
        a.r = vm.parseJsonBytes32(json, string.concat(key, ".r"));
        a.s = vm.parseJsonBytes32(json, string.concat(key, ".s"));
        a.challengeIndex = vm.parseJsonUint(json, string.concat(key, ".challengeIndex"));
        a.typeIndex = vm.parseJsonUint(json, string.concat(key, ".typeIndex"));
        a.authenticatorData = vm.parseJsonBytes(json, string.concat(key, ".authenticatorData"));
        a.clientDataJSON = vm.parseJsonString(json, string.concat(key, ".clientDataJSON"));
    }

    function test_ChallengeEncodingMatchesTypeScript() public view {
        assertEq(sha256(abi.encode(_record())), vm.parseJsonBytes32(json, ".challenge"));
    }

    function test_SealsWithValidAssertion() public {
        PasskeySpike.CaptureRecord memory r = _record();
        vm.expectEmit(true, true, true, false);
        emit PasskeySpike.CaptureSealed(r.exactHash, keyId, r.carrierId, 0, r.tiles, 0, 0, 0, 0, 0, 0);
        spike.seal(keyId, r, _auth(".auth"));
        assertTrue(spike.isSealed(r.exactHash));
    }

    function test_RevertsOnTamperedRecord() public {
        PasskeySpike.CaptureRecord memory r = _record();
        r.tiles[7] = bytes32(uint256(r.tiles[7]) ^ 1);
        vm.expectRevert(PasskeySpike.InvalidSignature.selector);
        spike.seal(keyId, r, _auth(".auth"));
    }

    function test_RevertsOnTamperedSignature() public {
        WebAuthn.WebAuthnAuth memory a = _auth(".auth");
        a.s = bytes32(uint256(a.s) ^ 1);
        vm.expectRevert(PasskeySpike.InvalidSignature.selector);
        spike.seal(keyId, _record(), a);
    }

    function test_RevertsWithoutUserVerification() public {
        vm.expectRevert(PasskeySpike.InvalidSignature.selector);
        spike.seal(keyId, _record(), _auth(".authNoUV"));
    }

    function test_RevertsOnWrongKey() public {
        bytes32 other = keccak256("other");
        spike.registerDeviceKey(other, keccak256("x"), keccak256("y"));
        vm.expectRevert(PasskeySpike.InvalidSignature.selector);
        spike.seal(other, _record(), _auth(".auth"));
    }

    function test_RevertsOnUnknownKey() public {
        vm.expectRevert(abi.encodeWithSelector(PasskeySpike.UnknownDeviceKey.selector, bytes32(0)));
        spike.seal(bytes32(0), _record(), _auth(".auth"));
    }

    function test_RevertsOnReplay() public {
        PasskeySpike.CaptureRecord memory r = _record();
        spike.seal(keyId, r, _auth(".auth"));
        vm.expectRevert(abi.encodeWithSelector(PasskeySpike.AlreadySealed.selector, r.exactHash));
        spike.seal(keyId, r, _auth(".auth"));
    }

    function test_RevertsOutsideSigningWindow() public {
        PasskeySpike.CaptureRecord memory r = _record();
        vm.roll(r.refBlock + spike.MAX_LAG() + 1);
        vm.expectRevert(abi.encodeWithSelector(PasskeySpike.SigningWindowExpired.selector, r.refBlock, block.number));
        spike.seal(keyId, r, _auth(".auth"));
    }

    function testFuzz_RevertsOnAnyRecordBitFlip(uint8 field, uint8 bit) public {
        PasskeySpike.CaptureRecord memory r = _record();
        uint256 mask = 1 << bit;
        field = field % 5;
        if (field == 0) r.pHash ^= bytes32(mask);
        else if (field == 1) r.tiles[bit % 16] ^= bytes32(mask);
        else if (field == 2) r.locCommit ^= bytes32(mask);
        else if (field == 3) r.claimRef ^= bytes32(mask);
        else r.width ^= uint32(1 << (bit % 32));
        vm.expectRevert(PasskeySpike.InvalidSignature.selector);
        spike.seal(keyId, r, _auth(".auth"));
    }
}
