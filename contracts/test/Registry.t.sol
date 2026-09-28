// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {Registry} from "../src/Registry.sol";

contract RegistryTest is Test {
    function test_Deploys() public {
        Registry registry = new Registry();
        assertEq(registry.VERSION(), "0.0.0");
    }
}
