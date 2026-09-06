// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Greeter
 * @notice 最简示例合约：在 Avalanche C-Chain (Fuji) 上存一条消息。
 * 部署：npm run deploy:fuji
 */
contract Greeter {
    string public greeting;

    event GreetingChanged(address indexed changer, string newGreeting);

    constructor(string memory _greeting) {
        greeting = _greeting;
    }

    function setGreeting(string calldata _greeting) external {
        greeting = _greeting;
        emit GreetingChanged(msg.sender, _greeting);
    }
}
