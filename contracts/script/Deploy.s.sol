// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {FlowPool} from "../src/FlowPool.sol";

/**
 * Deploy FlowPool to Base Sepolia.
 *
 *   forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast \
 *     --private-key $DEPLOYER_KEY
 *
 * Env:
 *   USDC          - optional; defaults to Base Sepolia USDC
 *   TERMS_SIGNER  - optional if FLOWPOOL_SIGNER_KEY is set
 *   FLOWPOOL_SIGNER_KEY - backend term authorizer private key
 *   TREASURY      - optional if DEPLOYER_KEY is set
 *   DEPLOYER_KEY  - deployer private key, also default treasury recipient
 *   FEE_BPS       - fee on interest (e.g. 1000 = 10%)
 */
contract Deploy is Script {
    address private constant BASE_SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    function run() external {
        address usdc = vm.envOr("USDC", BASE_SEPOLIA_USDC);
        address termsSigner = vm.envOr("TERMS_SIGNER", address(0));
        if (termsSigner == address(0)) {
            termsSigner = vm.addr(vm.envUint("FLOWPOOL_SIGNER_KEY"));
        }
        address treasury = vm.envOr("TREASURY", address(0));
        if (treasury == address(0)) {
            treasury = vm.addr(vm.envUint("DEPLOYER_KEY"));
        }
        uint256 rawFeeBps = vm.envOr("FEE_BPS", uint256(1000));
        require(rawFeeBps <= type(uint16).max, "FEE_BPS overflows uint16");
        // casting to uint16 is safe because the value is bounded above.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint16 feeBps = uint16(rawFeeBps);

        console.log("USDC:", usdc);
        console.log("Terms signer:", termsSigner);
        console.log("Treasury:", treasury);
        console.log("Fee bps:", feeBps);

        vm.startBroadcast();
        FlowPool pool = new FlowPool(usdc, termsSigner, treasury, feeBps);
        vm.stopBroadcast();

        console.log("FlowPool deployed:", address(pool));
    }
}
