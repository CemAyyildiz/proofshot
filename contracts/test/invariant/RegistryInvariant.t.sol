// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";
import {Registry} from "../../src/Registry.sol";
import {WebAuthnSigner} from "../utils/WebAuthnSigner.sol";

/// @notice Drives the Registry with random Seals, imports and block advances over a small hash space so collisions
///         (re-seals, import-after-seal, seal-after-import) actually happen.
contract RegistryHandler is Test {
    Registry public registry;
    address public relayer;
    uint256[3] internal keys = [uint256(0xA11CE), uint256(0xB0B), uint256(0xC0FFEE)];
    bytes32[3] public keyIds;

    bytes32[] public sealedHashes;
    mapping(bytes32 => bool) public ghostSealed;
    uint256 public resealAccepted; // must stay 0
    uint256 public importAfterSealAccepted; // must stay 0
    uint256 public seals;

    constructor(Registry r, address relayer_) {
        registry = r;
        relayer = relayer_;
        for (uint256 i; i < 3; i++) {
            (uint256 x, uint256 y) = vm.publicKeyP256(keys[i]);
            keyIds[i] = keccak256(abi.encode("key", i));
            vm.prank(relayer);
            registry.registerDeviceKey(keyIds[i], bytes32(x), bytes32(y));
        }
    }

    function _hash(uint256 seed) internal pure returns (bytes32) {
        return keccak256(abi.encode("photo", seed % 24));
    }

    function seal(uint256 hashSeed, uint256 keySeed, bytes32 pHash, uint32 w, uint32 h) external {
        uint256 k = keySeed % 3;
        Registry.CaptureRecord memory r;
        r.exactHash = _hash(hashSeed);
        r.pHash = pHash;
        r.width = w;
        r.height = h;
        r.carrierId = keccak256("carrier");
        r.claimRef = keccak256(abi.encode("claim", hashSeed % 5));
        r.refBlock = uint64(block.number);
        // Build the assertion before pranking: the signP256 cheatcode call would otherwise consume the prank.
        WebAuthn.WebAuthnAuth memory auth = WebAuthnSigner.assertion(keys[k], sha256(abi.encode(r)), "localhost");
        bool before = registry.isSealed(r.exactHash);
        vm.prank(relayer);
        try registry.seal(keyIds[k], r, auth) {
            if (before) resealAccepted++;
            if (!ghostSealed[r.exactHash]) sealedHashes.push(r.exactHash);
            ghostSealed[r.exactHash] = true;
            seals++;
        } catch (bytes memory err) {
            // The only acceptable failure for a valid, fresh assertion is a replay.
            assertEq(bytes4(err), Registry.AlreadySealed.selector);
            assertTrue(before);
        }
    }

    function importOne(uint256 hashSeed) external {
        bytes32 h = _hash(hashSeed);
        Registry.ImportRecord[] memory batch = new Registry.ImportRecord[](1);
        batch[0].exactHash = h;
        bool sealedBefore = registry.isSealed(h);
        bool importedBefore = registry.isImported(h);
        vm.prank(relayer);
        uint256 n = registry.importRecords(keccak256("carrier"), batch);
        if (sealedBefore && n > 0) importAfterSealAccepted++;
        if (!sealedBefore && !importedBefore) assertEq(n, 1);
    }

    function advance(uint8 blocks) external {
        vm.roll(block.number + blocks);
    }

    function sealedCount() external view returns (uint256) {
        return sealedHashes.length;
    }
}

contract RegistryInvariantTest is Test {
    Registry registry;
    RegistryHandler handler;

    function setUp() public {
        bytes32[] memory rp = new bytes32[](1);
        rp[0] = sha256("localhost");
        address admin = makeAddr("admin");
        address relayer = makeAddr("relayer");
        registry = new Registry(admin, relayer, rp);
        handler = new RegistryHandler(registry, relayer);
        vm.roll(1_000);
        targetContract(address(handler));
    }

    /// A hash can be sealed at most once.
    function invariant_NoReseal() public view {
        assertEq(handler.resealAccepted(), 0);
        assertEq(handler.seals(), handler.sealedCount());
    }

    /// Sealing is permanent.
    function invariant_SealedStaysSealed() public view {
        for (uint256 i; i < handler.sealedCount(); i++) assertTrue(registry.isSealed(handler.sealedHashes(i)));
    }

    /// A sealed photo can never be re-registered as an unsigned import.
    function invariant_NoImportAfterSeal() public view {
        assertEq(handler.importAfterSealAccepted(), 0);
    }

    function test_SolidityGeneratedAssertionSeals() public {
        handler.seal(1, 0, keccak256("p"), 4032, 3024);
        assertEq(handler.seals(), 1);
        assertTrue(registry.isSealed(keccak256(abi.encode("photo", uint256(1)))));
    }
}
