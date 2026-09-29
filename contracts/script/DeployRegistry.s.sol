// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {Registry} from "../src/Registry.sol";

/// @notice Deploys the Registry and writes deployments/<chainId>.json (address, deploy block, roles, RP IDs), which
///         the app reads for REGISTRY_ADDRESS and REGISTRY_DEPLOY_BLOCK.
///
///   EXPECTED_CHAIN_ID=10143 REGISTRY_ADMIN=0x… REGISTRY_RELAYER=0x… REGISTRY_RP_IDS=proofshot.app \
///   forge script script/DeployRegistry.s.sol --rpc-url monad_testnet --broadcast --private-key $DEPLOYER_PRIVATE_KEY
///
/// Verification (Monad explorers run Sourcify):
///   forge verify-contract <address> src/Registry.sol:Registry --chain <chainId> --verifier sourcify
contract DeployRegistry is Script {
    error WrongChain(uint256 expected, uint256 actual);

    function run() external returns (Registry registry) {
        // Guards against broadcasting a testnet configuration to mainnet or vice versa.
        uint256 expected = vm.envUint("EXPECTED_CHAIN_ID");
        if (block.chainid != expected) revert WrongChain(expected, block.chainid);

        address admin = vm.envAddress("REGISTRY_ADMIN");
        address relayer = vm.envAddress("REGISTRY_RELAYER");
        string[] memory rpIds = vm.envString("REGISTRY_RP_IDS", ",");

        bytes32[] memory rpIdHashes = new bytes32[](rpIds.length);
        for (uint256 i; i < rpIds.length; i++) rpIdHashes[i] = sha256(bytes(rpIds[i]));

        uint256 deployBlock = block.number;
        vm.startBroadcast();
        registry = new Registry(admin, relayer, rpIdHashes);
        vm.stopBroadcast();

        // Only a real broadcast produces a deployment record; simulations and dry runs must not leave a fake one.
        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            console.log("Simulation only: deployments/<chainId>.json not written");
            console.log("Registry (simulated)", address(registry));
            return registry;
        }

        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "deployBlock", deployBlock);
        vm.serializeAddress(key, "admin", admin);
        vm.serializeAddress(key, "relayer", relayer);
        vm.serializeString(key, "rpIds", rpIds);
        string memory json = vm.serializeAddress(key, "registry", address(registry));
        vm.writeJson(json, string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json"));

        console.log("Registry", address(registry));
        console.log("chainId", block.chainid);
        console.log("deployBlock", deployBlock);
    }
}
