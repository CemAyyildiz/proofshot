// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {Registry} from "../src/Registry.sol";

/// @notice Deploys the Registry.
///
///   REGISTRY_ADMIN=0x… REGISTRY_RELAYER=0x… REGISTRY_RP_IDS=localhost,proofshot.app \
///   forge script script/DeployRegistry.s.sol --rpc-url monad_testnet --broadcast --private-key $DEPLOYER_KEY
///
/// Verification (Monad explorers run Sourcify):
///   forge verify-contract <address> src/Registry.sol:Registry --chain <chainId> --verifier sourcify
contract DeployRegistry is Script {
    function run() external returns (Registry registry) {
        address admin = vm.envAddress("REGISTRY_ADMIN");
        address relayer = vm.envAddress("REGISTRY_RELAYER");
        string[] memory rpIds = vm.envString("REGISTRY_RP_IDS", ",");

        bytes32[] memory rpIdHashes = new bytes32[](rpIds.length);
        for (uint256 i; i < rpIds.length; i++) rpIdHashes[i] = sha256(bytes(rpIds[i]));

        vm.startBroadcast();
        registry = new Registry(admin, relayer, rpIdHashes);
        vm.stopBroadcast();

        console.log("Registry", address(registry));
        console.log("chainId", block.chainid);
        console.log("deployBlock", block.number);
    }
}
