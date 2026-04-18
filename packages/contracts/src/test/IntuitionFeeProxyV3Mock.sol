// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {IntuitionFeeProxyV2} from "../IntuitionFeeProxyV2.sol";

/// @notice Test-only upgrade target: same storage layout as V2 plus a `version()` marker.
///         Used to prove that UUPS upgrades preserve state and expose the new ABI.
contract IntuitionFeeProxyV3Mock is IntuitionFeeProxyV2 {
    function version() external pure returns (string memory) {
        return "v3-mock";
    }
}
