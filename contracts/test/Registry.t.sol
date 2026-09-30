// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IAccessControlDefaultAdminRules} from
    "@openzeppelin/contracts/access/extensions/IAccessControlDefaultAdminRules.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";
import {Registry} from "../src/Registry.sol";

contract RegistryTest is Test {
    Registry registry;
    string json;
    bytes32 keyId;
    bytes32 qx;
    bytes32 qy;
    address admin = makeAddr("admin");
    address relayer = makeAddr("relayer");
    address stranger = makeAddr("stranger");
    bytes32 constant LOCALHOST = sha256("localhost");

    function setUp() public {
        json = vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/webauthn-software.json"));
        keyId = vm.parseJsonBytes32(json, ".keyId");
        qx = vm.parseJsonBytes32(json, ".qx");
        qy = vm.parseJsonBytes32(json, ".qy");
        bytes32[] memory rp = new bytes32[](1);
        rp[0] = LOCALHOST;
        registry = new Registry(admin, relayer, rp);
        vm.prank(relayer);
        registry.registerDeviceKey(keyId, qx, qy);
        vm.roll(vm.parseJsonUint(json, ".record.refBlock") + 5);
    }

    // ─── fixtures ──────────────────────────────────────────────────────────────────────────────────────────

    function _record() internal view returns (Registry.CaptureRecord memory r) {
        r.exactHash = vm.parseJsonBytes32(json, ".record.exactHash");
        r.pHash = vm.parseJsonBytes32(json, ".record.pHash");
        bytes32[] memory tiles = vm.parseJsonBytes32Array(json, ".record.tiles");
        for (uint256 i; i < 16; i++) {
            r.tiles[i] = tiles[i];
        }
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

    function _seal(Registry.CaptureRecord memory r, WebAuthn.WebAuthnAuth memory a) internal {
        vm.prank(relayer);
        registry.seal(keyId, r, a);
    }

    function _expectSealRevert(Registry.CaptureRecord memory r, WebAuthn.WebAuthnAuth memory a, bytes memory err)
        internal
    {
        vm.expectRevert(err);
        _seal(r, a);
    }

    // ─── construction & admin ──────────────────────────────────────────────────────────────────────────────

    function test_ConstructorRejectsZeroAddresses() public {
        bytes32[] memory rp = new bytes32[](0);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControlDefaultAdminRules.AccessControlInvalidDefaultAdmin.selector, address(0)
            )
        );
        new Registry(address(0), relayer, rp);
        vm.expectRevert(Registry.ZeroValue.selector);
        new Registry(admin, address(0), rp);
    }

    function test_RelayerAndAdminRolesNeverShareAnAccount() public {
        bytes32 relayerRole = registry.RELAYER_ROLE();
        // The admin can't make itself (or any admin) a relayer…
        vm.expectRevert(Registry.AdminIsRelayer.selector);
        vm.prank(admin);
        registry.grantRole(relayerRole, admin);
        // …and can't hand the admin role to the hot relayer key: the transfer can't be accepted.
        vm.prank(admin);
        registry.beginDefaultAdminTransfer(relayer);
        vm.warp(block.timestamp + registry.ADMIN_TRANSFER_DELAY() + 1);
        vm.expectRevert(Registry.AdminIsRelayer.selector);
        vm.prank(relayer);
        registry.acceptDefaultAdminTransfer();
        assertEq(registry.defaultAdmin(), admin);
    }

    function test_AdminCannotBeOrphanedOrMovedInOneStep() public {
        bytes32 adminRole = registry.DEFAULT_ADMIN_ROLE();
        address next = makeAddr("next-admin");
        // No direct grant of the admin role, and no instant renounce.
        vm.expectRevert(IAccessControlDefaultAdminRules.AccessControlEnforcedDefaultAdminRules.selector);
        vm.prank(admin);
        registry.grantRole(adminRole, next);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControlDefaultAdminRules.AccessControlEnforcedDefaultAdminDelay.selector, uint48(0)
            )
        );
        vm.prank(admin);
        registry.renounceRole(adminRole, admin);
        assertTrue(registry.hasRole(adminRole, admin));

        // A transfer takes two steps and the delay; the new admin must accept.
        vm.prank(admin);
        registry.beginDefaultAdminTransfer(next);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControlDefaultAdminRules.AccessControlEnforcedDefaultAdminDelay.selector,
                uint48(block.timestamp + 1 days)
            )
        );
        vm.prank(next);
        registry.acceptDefaultAdminTransfer();
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(next);
        registry.acceptDefaultAdminTransfer();
        assertEq(registry.defaultAdmin(), next);
        assertFalse(registry.hasRole(adminRole, admin));
    }

    function test_ConstructorRejectsAdminAsRelayer() public {
        bytes32[] memory rp = new bytes32[](0);
        vm.expectRevert(Registry.AdminIsRelayer.selector);
        new Registry(relayer, relayer, rp);
    }

    function test_IncidentResponse_PauseRevokeRotate() public {
        Registry.CaptureRecord memory r = _record();
        address attacker = relayer; // the compromised hot key
        address fresh = makeAddr("fresh-relayer");

        // Only the admin can pause.
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, bytes32(0))
        );
        vm.prank(attacker);
        registry.pause();

        vm.startPrank(admin);
        registry.pause();
        registry.revokeRole(registry.RELAYER_ROLE(), attacker);
        registry.revokeDeviceKey(keyId); // a key the compromised relayer registered
        registry.grantRole(registry.RELAYER_ROLE(), fresh);
        vm.stopPrank();

        // Paused: no writes by anyone.
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(fresh);
        registry.seal(keyId, r, _auth(".auth"));
        Registry.ImportRecord[] memory batch = new Registry.ImportRecord[](0);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(fresh);
        registry.importRecords(keccak256("c"), batch);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(fresh);
        registry.registerDeviceKey(keccak256("k2"), qx, qy);

        vm.prank(admin);
        registry.unpause();

        // The old relayer is out; the revoked key can't seal even through the new relayer.
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, registry.RELAYER_ROLE()
            )
        );
        vm.prank(attacker);
        registry.seal(keyId, r, _auth(".auth"));
        vm.expectRevert(abi.encodeWithSelector(Registry.DeviceKeyIsRevoked.selector, keyId));
        vm.prank(fresh);
        registry.seal(keyId, r, _auth(".auth"));
    }

    function test_RevokeEdgeCases() public {
        vm.expectRevert(abi.encodeWithSelector(Registry.UnknownDeviceKey.selector, keccak256("nope")));
        vm.prank(relayer);
        registry.revokeDeviceKey(keccak256("nope"));

        vm.prank(relayer);
        registry.revokeDeviceKey(keyId);
        uint64 first = registry.deviceKey(keyId).revokedAtBlock;
        vm.roll(block.number + 10);
        vm.recordLogs();
        vm.prank(admin);
        registry.revokeDeviceKey(keyId); // idempotent: keeps the original block, emits nothing
        assertEq(registry.deviceKey(keyId).revokedAtBlock, first);
        assertEq(vm.getRecordedLogs().length, 0);
    }

    function test_SetRpIdHashRejectsZero() public {
        vm.expectRevert(Registry.ZeroValue.selector);
        vm.prank(admin);
        registry.setRpIdHash(bytes32(0), true);
    }

    function test_RevokeDeviceKeyNeedsRelayerOrAdmin() public {
        vm.expectRevert(Registry.NotAuthorized.selector);
        vm.prank(stranger);
        registry.revokeDeviceKey(keyId);
    }

    function test_AdminManagesRpIds() public {
        bytes32 prod = sha256("proofshot.app");
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, relayer, bytes32(0))
        );
        vm.prank(relayer);
        registry.setRpIdHash(prod, true);

        vm.prank(admin);
        registry.setRpIdHash(prod, true);
        assertTrue(registry.allowedRpIdHash(prod));
    }

    // ─── device keys ───────────────────────────────────────────────────────────────────────────────────────

    function test_RegisterDeviceKeyIsRelayerOnlyAndImmutable() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, registry.RELAYER_ROLE()
            )
        );
        vm.prank(stranger);
        registry.registerDeviceKey(keccak256("k"), qx, qy);

        vm.expectRevert(abi.encodeWithSelector(Registry.DeviceKeyExists.selector, keyId));
        vm.prank(relayer);
        registry.registerDeviceKey(keyId, keccak256("x"), keccak256("y"));

        vm.expectRevert(Registry.ZeroValue.selector);
        vm.prank(relayer);
        registry.registerDeviceKey(keccak256("k"), 0, 0);

        Registry.DeviceKey memory k = registry.deviceKey(keyId);
        assertEq(k.qx, qx);
        assertEq(k.qy, qy);
    }

    function test_RevokedKeyCannotSealButEarlierSealsStand() public {
        Registry.CaptureRecord memory r = _record();
        _seal(r, _auth(".auth"));

        vm.prank(relayer);
        registry.revokeDeviceKey(keyId);
        assertEq(registry.deviceKey(keyId).revokedAtBlock, block.number);
        assertTrue(registry.isSealed(r.exactHash));

        r.exactHash = keccak256("another");
        _expectSealRevert(r, _auth(".auth"), abi.encodeWithSelector(Registry.DeviceKeyIsRevoked.selector, keyId));
    }

    // ─── seal: happy path ──────────────────────────────────────────────────────────────────────────────────

    function test_ChallengeEncodingMatchesTypeScript() public view {
        assertEq(sha256(abi.encode(_record())), vm.parseJsonBytes32(json, ".challenge"));
    }

    function test_SealEmitsFullRecord() public {
        Registry.CaptureRecord memory r = _record();
        vm.expectEmit(address(registry));
        emit Registry.CaptureSealed(
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
        _seal(r, _auth(".auth"));
        assertTrue(registry.isSealed(r.exactHash));
    }

    function test_SealAcceptsFullSigningWindow() public {
        Registry.CaptureRecord memory r = _record();
        vm.roll(r.refBlock + registry.MAX_LAG());
        _seal(r, _auth(".auth"));
    }

    // ─── seal: rejections (FR-4, NFR-6) ────────────────────────────────────────────────────────────────────

    function test_SealIsRelayerOnly() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, registry.RELAYER_ROLE()
            )
        );
        vm.prank(stranger);
        registry.seal(keyId, _record(), _auth(".auth"));
    }

    function test_RejectsTamperedRecord() public {
        Registry.CaptureRecord memory r = _record();
        r.tiles[7] = bytes32(uint256(r.tiles[7]) ^ 1);
        _expectSealRevert(r, _auth(".auth"), abi.encodeWithSelector(Registry.InvalidSignature.selector));
    }

    function test_RejectsTamperedSignature() public {
        WebAuthn.WebAuthnAuth memory a = _auth(".auth");
        a.s = bytes32(uint256(a.s) ^ 1);
        _expectSealRevert(_record(), a, abi.encodeWithSelector(Registry.InvalidSignature.selector));
    }

    function test_RejectsMissingUserVerification() public {
        _expectSealRevert(_record(), _auth(".authNoUV"), abi.encodeWithSelector(Registry.InvalidSignature.selector));
    }

    function test_RejectsWrongKey() public {
        bytes32 other = keccak256("other");
        vm.prank(relayer);
        registry.registerDeviceKey(other, keccak256("x"), keccak256("y"));
        vm.expectRevert(Registry.InvalidSignature.selector);
        vm.prank(relayer);
        registry.seal(other, _record(), _auth(".auth"));
    }

    function test_RejectsUnknownKey() public {
        vm.expectRevert(abi.encodeWithSelector(Registry.UnknownDeviceKey.selector, bytes32(0)));
        vm.prank(relayer);
        registry.seal(bytes32(0), _record(), _auth(".auth"));
    }

    function test_RejectsReplay() public {
        Registry.CaptureRecord memory r = _record();
        _seal(r, _auth(".auth"));
        _expectSealRevert(r, _auth(".auth"), abi.encodeWithSelector(Registry.AlreadySealed.selector, r.exactHash));
    }

    function test_RejectsExpiredOrFutureSigningWindow() public {
        Registry.CaptureRecord memory r = _record();
        vm.roll(r.refBlock + registry.MAX_LAG() + 1);
        _expectSealRevert(
            r, _auth(".auth"), abi.encodeWithSelector(Registry.SigningWindowExpired.selector, r.refBlock, block.number)
        );
        vm.roll(r.refBlock - 1);
        _expectSealRevert(
            r, _auth(".auth"), abi.encodeWithSelector(Registry.SigningWindowExpired.selector, r.refBlock, block.number)
        );
    }

    function test_RejectsAssertionFromOtherRpId() public {
        bytes32 localhost = LOCALHOST; // evaluating the constant calls the sha256 precompile, which would eat the prank
        vm.prank(admin);
        registry.setRpIdHash(localhost, false);
        _expectSealRevert(
            _record(), _auth(".auth"), abi.encodeWithSelector(Registry.RpIdNotAllowed.selector, localhost)
        );
    }

    function test_RejectsShortAuthenticatorData() public {
        WebAuthn.WebAuthnAuth memory a = _auth(".auth");
        a.authenticatorData = hex"01";
        _expectSealRevert(_record(), a, abi.encodeWithSelector(Registry.RpIdNotAllowed.selector, bytes32(0)));
    }

    function testFuzz_RejectsAnyRecordBitFlip(uint8 field, uint8 bit) public {
        Registry.CaptureRecord memory r = _record();
        uint256 mask = 1 << bit;
        field = field % 8;
        if (field == 0) r.pHash ^= bytes32(mask);
        else if (field == 1) r.tiles[bit % 16] ^= bytes32(mask);
        else if (field == 2) r.locCommit ^= bytes32(mask);
        else if (field == 3) r.claimRef ^= bytes32(mask);
        else if (field == 4) r.carrierId ^= bytes32(mask);
        else if (field == 5) r.width ^= uint32(1 << (bit % 32));
        else if (field == 6) r.deviceTime ^= uint64(1 << (bit % 64));
        else r.exactHash ^= bytes32(mask);
        _expectSealRevert(r, _auth(".auth"), abi.encodeWithSelector(Registry.InvalidSignature.selector));
    }

    // ─── imports (FR-13) ───────────────────────────────────────────────────────────────────────────────────

    function _import(bytes32 exactHash) internal pure returns (Registry.ImportRecord memory rec) {
        rec.exactHash = exactHash;
        rec.pHash = keccak256(abi.encode(exactHash, "p"));
        rec.width = 1600;
        rec.height = 1200;
    }

    function test_ImportRecordsSkipsDuplicatesAndSealed() public {
        Registry.CaptureRecord memory r = _record();
        _seal(r, _auth(".auth"));

        Registry.ImportRecord[] memory batch = new Registry.ImportRecord[](3);
        batch[0] = _import(keccak256("a"));
        batch[1] = _import(keccak256("a")); // duplicate in batch
        batch[2] = _import(r.exactHash); // already sealed
        bytes32 carrier = keccak256("carrier");

        vm.expectEmit(address(registry));
        emit Registry.RecordImported(batch[0].exactHash, carrier, batch[0].pHash, batch[0].tiles, 1600, 1200);
        vm.prank(relayer);
        assertEq(registry.importRecords(carrier, batch), 1);
        assertTrue(registry.isImported(batch[0].exactHash));
        assertFalse(registry.isImported(r.exactHash));

        vm.prank(relayer);
        assertEq(registry.importRecords(carrier, batch), 0); // retried batch is a no-op
    }

    function _batch(uint256 n, uint256 salt) internal pure returns (Registry.ImportRecord[] memory b) {
        b = new Registry.ImportRecord[](n);
        for (uint256 i; i < n; i++) {
            b[i] = _import(keccak256(abi.encode(salt, i)));
            for (uint256 t; t < 16; t++) {
                b[i].tiles[t] = keccak256(abi.encode(salt, i, t));
            }
        }
    }

    function test_ImportBatchIsCappedAndTheCapFitsOneTransaction() public {
        uint256 max = registry.MAX_IMPORT_BATCH();
        Registry.ImportRecord[] memory tooBig = _batch(max + 1, 1);
        vm.expectRevert(abi.encodeWithSelector(Registry.BatchTooLarge.selector, max + 1, max));
        vm.prank(relayer);
        registry.importRecords(keccak256("c"), tooBig);

        Registry.ImportRecord[] memory full = _batch(max, 2);
        // Calldata floor for the full batch (EIP-7623: 40 gas per non-zero byte, the worst case) + execution must fit
        // the 2^24 per-transaction cap with room to spare.
        uint256 calldataGas = abi.encodeCall(Registry.importRecords, (keccak256("c"), full)).length * 40;
        vm.prank(relayer);
        uint256 g = gasleft();
        assertEq(registry.importRecords(keccak256("c"), full), max);
        uint256 execution = g - gasleft();
        assertLt(21_000 + calldataGas + execution, 16_777_216);
    }

    function test_ImportIsRelayerOnlyAndNeedsCarrier() public {
        Registry.ImportRecord[] memory batch = new Registry.ImportRecord[](0);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, registry.RELAYER_ROLE()
            )
        );
        vm.prank(stranger);
        registry.importRecords(keccak256("c"), batch);

        vm.expectRevert(Registry.ZeroValue.selector);
        vm.prank(relayer);
        registry.importRecords(0, batch);
    }

    function test_ImportDoesNotBlockLaterSealOfSameHash() public {
        Registry.CaptureRecord memory r = _record();
        Registry.ImportRecord[] memory batch = new Registry.ImportRecord[](1);
        batch[0] = _import(r.exactHash);
        vm.prank(relayer);
        registry.importRecords(keccak256("c"), batch);
        _seal(r, _auth(".auth"));
        assertTrue(registry.isSealed(r.exactHash));
    }
}
