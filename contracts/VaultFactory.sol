// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./IERC20.sol";
import "./TokenVault.sol";
import "./VaultNFT.sol";

contract VaultFactory {
    VaultNFT public immutable nft;

    mapping(address => address) public vaults;
    address[] private _allVaults;

    event VaultDeployed(address indexed token, address indexed vault, uint256 nftId);
    event Deposited(address indexed token, address indexed vault, address indexed depositor, uint256 amount);

    constructor() {
        nft = new VaultNFT();
    }

    function createVault(address token) external returns (address vault) {
        require(vaults[token] == address(0), "vault exists");

        bytes32 salt = keccak256(abi.encodePacked(token));
        vault = address(new TokenVault{salt: salt}(token, address(this)));

        vaults[token] = vault;
        _allVaults.push(vault);

        string memory tokenName;
        string memory tokenSymbol;
        uint8 tokenDecimals;

        try IERC20Metadata(token).name()     returns (string memory n) { tokenName     = n; } catch { tokenName     = "Unknown"; }
        try IERC20Metadata(token).symbol()   returns (string memory s) { tokenSymbol   = s; } catch { tokenSymbol   = "???";     }
        try IERC20Metadata(token).decimals() returns (uint8 d)         { tokenDecimals = d; } catch { tokenDecimals = 18;        }

        uint256 nftId = nft.mint(vault, token, tokenName, tokenSymbol, tokenDecimals);

        emit VaultDeployed(token, vault, nftId);
    }

    function deposit(address token, uint256 amount) external {
        require(amount > 0, "zero amount");
        address vault = vaults[token];
        require(vault != address(0), "no vault");

        IERC20(token).transferFrom(msg.sender, vault, amount);
        TokenVault(vault).recordDeposit(msg.sender, amount);

        emit Deposited(token, vault, msg.sender, amount);
    }

    function previewVaultAddress(address token) external view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(token));
        bytes32 initHash = keccak256(
            abi.encodePacked(
                type(TokenVault).creationCode,
                abi.encode(token, address(this))
            )
        );
        return address(uint160(uint256(keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, initHash)
        ))));
    }

    function getVault(address token) external view returns (address) {
        return vaults[token];
    }

    function allVaults() external view returns (address[] memory) {
        return _allVaults;
    }
}
