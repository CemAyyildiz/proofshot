// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {DeployRegistry} from "../script/DeployRegistry.s.sol";
import {Registry} from "../src/Registry.sol";

contract DeployRegistryTest is Test {
    DeployRegistry script = new DeployRegistry();
    address admin = makeAddr("admin");
    address relayer = makeAddr("relayer");

    function _rpIds() internal pure returns (string[] memory ids) {
        ids = new string[](2);
        ids[0] = "proofshot.app";
        ids[1] = "preview.proofshot.app";
    }

    function test_RefusesTheWrongChain() public {
        vm.expectRevert(abi.encodeWithSelector(DeployRegistry.WrongChain.selector, 143, block.chainid));
        script.deploy(143, admin, relayer, _rpIds()); // a mainnet config on this chain
    }

    function test_DeploysWithRolesAndRpIdsOnTheExpectedChain() public {
        Registry registry = script.deploy(block.chainid, admin, relayer, _rpIds());
        assertTrue(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(registry.hasRole(registry.RELAYER_ROLE(), relayer));
        assertFalse(registry.hasRole(registry.RELAYER_ROLE(), admin));
        assertTrue(registry.allowedRpIdHash(sha256("proofshot.app")));
        assertTrue(registry.allowedRpIdHash(sha256("preview.proofshot.app")));
        assertFalse(registry.allowedRpIdHash(sha256("localhost")));
    }
}
