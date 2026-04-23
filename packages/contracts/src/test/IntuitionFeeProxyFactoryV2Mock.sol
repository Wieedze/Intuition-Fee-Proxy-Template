// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IntuitionFeeProxyFactory} from "../IntuitionFeeProxyFactory.sol";

/// @notice Test-only upgrade target for `IntuitionFeeProxyFactory`. Same
///         storage layout plus a `version()` marker — used to prove that
///         UUPS upgrades preserve state.
contract IntuitionFeeProxyFactoryV2Mock is IntuitionFeeProxyFactory {
    function version() external pure returns (string memory) {
        return "factory-v2-mock";
    }
}
