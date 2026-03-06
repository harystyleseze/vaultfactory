// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./TokenVault.sol";

contract VaultNFT is ERC721 {

    struct VaultMeta {
        address vault;
        address token;
        string  tokenName;
        string  tokenSymbol;
        uint8   tokenDecimals;
        uint256 mintedAt;
    }

    address public factory;
    uint256 private _nextId;

    mapping(uint256 => VaultMeta) private _meta;
    mapping(address => uint256) public tokenToNftId;

    constructor() ERC721("Token Vault", "TVLT") {
        factory = msg.sender;
    }

    function mint(
        address vault,
        address token,
        string calldata tokenName,
        string calldata tokenSymbol,
        uint8 tokenDecimals
    ) external returns (uint256 id) {
        require(msg.sender == factory, "only factory");
        require(tokenToNftId[token] == 0, "vault exists");

        id = ++_nextId;
        _meta[id] = VaultMeta({
            vault:         vault,
            token:         token,
            tokenName:     tokenName,
            tokenSymbol:   tokenSymbol,
            tokenDecimals: tokenDecimals,
            mintedAt:      block.timestamp
        });
        tokenToNftId[token] = id;

        _mint(vault, id);
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        VaultMeta memory m = _meta[id];

        uint256 total = TokenVault(m.vault).totalDeposited();
        string memory svg  = _buildSVG(id, m, total);
        string memory json = _buildJSON(id, m, total, svg);

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _buildSVG(uint256 id, VaultMeta memory m, uint256 total) internal pure returns (string memory) {
        string memory amountStr  = _formatAmount(total, m.tokenDecimals);
        string memory vaultShort = _shortAddr(m.vault);
        string memory tokenShort = _shortAddr(m.token);
        string memory nftId      = string.concat("#", _padLeft(Strings.toString(id), 3));

        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 420">',
            _svgDefs(),
            _svgBackground(),
            _svgHeader(m.tokenSymbol, m.tokenName),
            _svgBody(vaultShort, tokenShort, amountStr, m.tokenSymbol),
            _svgFooter(nftId),
            "</svg>"
        );
    }

    function _svgDefs() internal pure returns (string memory) {
        return string.concat(
            "<defs>",
            '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">',
            '<stop offset="0%" stop-color="#070503"/>',
            '<stop offset="100%" stop-color="#110C06"/>',
            "</linearGradient>",
            '<linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">',
            '<stop offset="0%" stop-color="#B8760F"/>',
            '<stop offset="100%" stop-color="#E8A828"/>',
            "</linearGradient>",
            '<linearGradient id="glow" x1="0" y1="0" x2="0" y2="1">',
            '<stop offset="0%" stop-color="#C88A1A" stop-opacity="0.2"/>',
            '<stop offset="100%" stop-color="#C88A1A" stop-opacity="0"/>',
            "</linearGradient>",
            "<style>",
            ".mono{font-family:'Courier New',Courier,monospace}",
            ".label{fill:#5C4525;font-size:10px}",
            ".value{fill:#C4A882;font-size:12px}",
            ".dim{fill:#4A3520;font-size:10px}",
            "</style>",
            "</defs>"
        );
    }

    function _svgBackground() internal pure returns (string memory) {
        return string.concat(
            '<rect width="360" height="420" fill="url(#bg)" rx="20"/>',
            '<rect x="14" y="14" width="332" height="392" fill="none" stroke="#2C1F0A" stroke-width="1" rx="14"/>',
            '<rect x="14" y="14" width="332" height="5" fill="url(#accent)" rx="2"/>',
            '<ellipse cx="180" cy="115" rx="60" ry="40" fill="url(#glow)"/>'
        );
    }

    function _svgHeader(string memory symbol, string memory name) internal pure returns (string memory) {
        return string.concat(
            '<text x="180" y="108" text-anchor="middle" class="mono" font-size="44" fill="#D4AF37">&#x2B21;</text>',
            '<text x="180" y="140" text-anchor="middle" class="mono" font-size="11" fill="#7A5C30" letter-spacing="4">TOKEN VAULT</text>',
            '<line x1="40" y1="152" x2="320" y2="152" stroke="#1C1308" stroke-width="1"/>',
            '<text x="180" y="197" text-anchor="middle" class="mono" font-size="38" fill="#F5C518" font-weight="bold">',
            symbol,
            "</text>",
            '<text x="180" y="218" text-anchor="middle" class="mono" font-size="11" fill="#9A7040">',
            name,
            "</text>"
        );
    }

    function _svgBody(
        string memory vaultShort,
        string memory tokenShort,
        string memory amountStr,
        string memory symbol
    ) internal pure returns (string memory) {
        return string.concat(
            '<line x1="40" y1="233" x2="320" y2="233" stroke="#1C1308" stroke-width="1"/>',
            '<text x="40" y="254" class="mono label">VAULT ADDRESS</text>',
            '<text x="40" y="272" class="mono value">', vaultShort, "</text>",
            '<text x="40" y="298" class="mono label">TOKEN ADDRESS</text>',
            '<text x="40" y="316" class="mono value">', tokenShort, "</text>",
            '<line x1="40" y1="331" x2="320" y2="331" stroke="#1C1308" stroke-width="1"/>',
            '<text x="40" y="352" class="mono label">TOTAL DEPOSITED</text>',
            '<text x="40" y="376" class="mono" font-size="20" fill="#FF9800" font-weight="bold">',
            amountStr, " ", symbol,
            "</text>"
        );
    }

    function _svgFooter(string memory nftId) internal pure returns (string memory) {
        return string.concat(
            '<line x1="40" y1="392" x2="320" y2="392" stroke="#2C1F0A" stroke-width="1"/>',
            '<text x="320" y="410" text-anchor="end" class="mono dim">', nftId, "</text>",
            '<text x="40" y="410" class="mono dim">VAULT FACTORY</text>'
        );
    }

    function _buildJSON(uint256 id, VaultMeta memory m, uint256 total, string memory svg) internal pure returns (string memory) {
        return string.concat(
            '{"name":"Token Vault #', Strings.toString(id), ' (', m.tokenSymbol, ')",',
            '"description":"On-chain vault for ', m.tokenName, ' (', m.tokenSymbol, ').",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '",',
            '"attributes":[',
            '{"trait_type":"Token Symbol","value":"', m.tokenSymbol, '"},',
            '{"trait_type":"Token Name","value":"', m.tokenName, '"},',
            '{"trait_type":"Token Address","value":"', Strings.toHexString(uint160(m.token), 20), '"},',
            '{"trait_type":"Vault Address","value":"', Strings.toHexString(uint160(m.vault), 20), '"},',
            '{"display_type":"number","trait_type":"Total Deposited (raw)","value":', Strings.toString(total), '}',
            "]}"
        );
    }

    function _shortAddr(address addr) internal pure returns (string memory) {
        string memory full = Strings.toHexString(uint160(addr), 20);
        bytes memory b = bytes(full);
        bytes memory out = new bytes(13);
        for (uint i = 0; i < 6; i++) out[i] = b[i];
        out[6] = 0xE2; out[7] = 0x80; out[8] = 0xA6;
        for (uint i = 0; i < 4; i++) out[9 + i] = b[38 + i];
        return string(out);
    }

    function _padLeft(string memory s, uint256 width) internal pure returns (string memory) {
        bytes memory sb = bytes(s);
        if (sb.length >= width) return s;
        uint256 pad = width - sb.length;
        bytes memory out = new bytes(width);
        for (uint i = 0; i < pad; i++) out[i] = "0";
        for (uint i = 0; i < sb.length; i++) out[pad + i] = sb[i];
        return string(out);
    }

    function _formatAmount(uint256 amount, uint8 decimals) internal pure returns (string memory) {
        if (decimals == 0) return Strings.toString(amount);
        uint8 displayDecimals = decimals > 4 ? 4 : decimals;
        uint256 factor = 10 ** decimals;
        uint256 displayFactor = 10 ** displayDecimals;
        uint256 scaled = amount * displayFactor / factor;
        uint256 intPart  = scaled / displayFactor;
        uint256 fracPart = scaled % displayFactor;
        return string.concat(Strings.toString(intPart), ".", _padLeft(Strings.toString(fracPart), displayDecimals));
    }
}
