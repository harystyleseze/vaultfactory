// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./IERC20.sol";

contract TokenVault {
    address public immutable token;
    address public immutable factory;
    uint256 public immutable createdAt;

    mapping(address => uint256) public balances;
    uint256 public totalDeposited;

    event Deposited(address indexed user, uint256 amount, uint256 newTotal);
    event Withdrawn(address indexed user, uint256 amount, uint256 newTotal);

    constructor(address _token, address _factory) {
        token = _token;
        factory = _factory;
        createdAt = block.timestamp;
    }

    modifier onlyFactory() {
        require(msg.sender == factory, "only factory");
        _;
    }

    function recordDeposit(address user, uint256 amount) external onlyFactory {
        require(amount > 0, "zero amount");
        balances[user] += amount;
        totalDeposited += amount;
        emit Deposited(user, amount, totalDeposited);
    }

    function withdraw(uint256 amount) external {
        require(amount > 0, "zero amount");
        require(amount <= balances[msg.sender], "insufficient balance");
        balances[msg.sender] -= amount;
        totalDeposited -= amount;
        IERC20(token).transfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount, totalDeposited);
    }

    function balanceOf(address user) external view returns (uint256) {
        return balances[user];
    }
}
