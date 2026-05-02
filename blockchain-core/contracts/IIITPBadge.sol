// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

interface I_IIITPToken {
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);

    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title IIITPBadge
 * @notice Campus collectible NFTs for IIIT Pune blockchain portal.
 *         Users pay I3TP tokens to mint badge NFTs in different tiers.
 *         Admin can airdrop special NFTs (achievements, certificates).
 */
contract IIITPBadge is
    ERC721,
    ERC721URIStorage,
    ERC721Enumerable,
    AccessControl,
    Pausable
{
    using Counters for Counters.Counter;

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // ── Badge tiers ──────────────────────────────────────────────
    enum Tier {
        COMMON,
        RARE,
        EPIC,
        LEGENDARY
    }

    struct BadgeType {
        string name;
        string category; // e.g. "achievement", "certificate", "collectible"
        Tier tier;
        uint256 mintPrice; // in I3TP (18 dec)
        uint256 maxSupply; // 0 = unlimited
        uint256 minted;
        bool active;
    }

    struct BadgeMeta {
        uint256 badgeTypeId;
        uint256 mintedAt;
        address mintedBy;
    }

    // ── State ─────────────────────────────────────────────────────
    Counters.Counter private _tokenIds;
    Counters.Counter private _badgeTypeIds;

    I_IIITPToken public immutable token;
    address public treasury;

    mapping(uint256 => BadgeType) public badgeTypes; // badgeTypeId → BadgeType
    mapping(uint256 => BadgeMeta) public badgeMeta; // tokenId     → BadgeMeta
    mapping(address => mapping(uint256 => bool)) public hasMinted; // user → badgeTypeId → bool (one per type by default)

    // ── Events ────────────────────────────────────────────────────
    event BadgeTypeCreated(
        uint256 indexed id,
        string name,
        Tier tier,
        uint256 mintPrice,
        uint256 maxSupply
    );
    event BadgeTypeUpdated(uint256 indexed id);
    event BadgeMinted(
        uint256 indexed tokenId,
        uint256 indexed badgeTypeId,
        address indexed to
    );
    event BadgeBurned(uint256 indexed tokenId, address indexed by);
    event TreasuryUpdated(address newTreasury);

    constructor(
        address tokenAddress,
        address _treasury
    ) ERC721("IIITPBadge", "I3TPNFT") {
        token = I_IIITPToken(tokenAddress);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);

        // Seed some default badge types
        _createBadgeType(
            "Genesis Member",
            "collectible",
            Tier.LEGENDARY,
            500 ether,
            100
        );
        _createBadgeType(
            "Early Adopter",
            "collectible",
            Tier.EPIC,
            200 ether,
            500
        );
        _createBadgeType("Staker Badge", "achievement", Tier.RARE, 50 ether, 0);
        _createBadgeType("Node Runner", "achievement", Tier.RARE, 50 ether, 0);
        _createBadgeType(
            "Voter Badge",
            "achievement",
            Tier.COMMON,
            20 ether,
            0
        );
        _createBadgeType(
            "Campus Certificate",
            "certificate",
            Tier.EPIC,
            100 ether,
            0
        );
    }

    // ── Admin ─────────────────────────────────────────────────────

    function createBadgeType(
        string calldata name,
        string calldata category,
        Tier tier,
        uint256 mintPrice,
        uint256 maxSupply
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256) {
        return _createBadgeType(name, category, tier, mintPrice, maxSupply);
    }

    function _createBadgeType(
        string memory name,
        string memory category,
        Tier tier,
        uint256 mintPrice,
        uint256 maxSupply
    ) internal returns (uint256) {
        uint256 id = _badgeTypeIds.current();
        _badgeTypeIds.increment();
        badgeTypes[id] = BadgeType(
            name,
            category,
            tier,
            mintPrice,
            maxSupply,
            0,
            true
        );
        emit BadgeTypeCreated(id, name, tier, mintPrice, maxSupply);
        return id;
    }

    function setBadgeTypeActive(
        uint256 id,
        bool active
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        badgeTypes[id].active = active;
        emit BadgeTypeUpdated(id);
    }

    function setBadgeTypePrice(
        uint256 id,
        uint256 price
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        badgeTypes[id].mintPrice = price;
        emit BadgeTypeUpdated(id);
    }

    function setTreasury(
        address _treasury
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ── Airdrop (free mint by MINTER_ROLE) ────────────────────────
    function airdrop(
        address to,
        uint256 badgeTypeId,
        string calldata uri
    ) external onlyRole(MINTER_ROLE) whenNotPaused returns (uint256) {
        return _mintBadge(to, badgeTypeId, uri, true);
    }

    // ── Public mint ───────────────────────────────────────────────
    function mint(
        uint256 badgeTypeId,
        string calldata uri
    ) external whenNotPaused returns (uint256) {
        BadgeType storage bt = badgeTypes[badgeTypeId];
        require(bt.active, "Badge type inactive");
        require(
            !hasMinted[msg.sender][badgeTypeId],
            "Already minted this badge"
        );
        require(
            bt.maxSupply == 0 || bt.minted < bt.maxSupply,
            "Max supply reached"
        );

        if (bt.mintPrice > 0) {
            require(
                token.transferFrom(msg.sender, treasury, bt.mintPrice),
                "Payment failed"
            );
        }
        return _mintBadge(msg.sender, badgeTypeId, uri, false);
    }

    function _mintBadge(
        address to,
        uint256 badgeTypeId,
        string memory uri,
        bool airdropped
    ) internal returns (uint256) {
        _tokenIds.increment();
        uint256 newId = _tokenIds.current();

        _safeMint(to, newId);
        _setTokenURI(newId, uri);

        badgeMeta[newId] = BadgeMeta(badgeTypeId, block.timestamp, to);
        badgeTypes[badgeTypeId].minted++;
        hasMinted[to][badgeTypeId] = true; // Always set — prevents double-mint even for airdrops

        emit BadgeMinted(newId, badgeTypeId, to);
        return newId;
    }

    function burn(uint256 tokenId) external {
        require(
            ownerOf(tokenId) == msg.sender ||
                hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "Not authorized"
        );
        _burn(tokenId);
        emit BadgeBurned(tokenId, msg.sender);
    }

    // ── Views ─────────────────────────────────────────────────────

    function getBadgeTypeCount() external view returns (uint256) {
        return _badgeTypeIds.current();
    }

    function getAllBadgeTypes() external view returns (BadgeType[] memory) {
        uint256 count = _badgeTypeIds.current();
        BadgeType[] memory result = new BadgeType[](count);
        for (uint256 i = 0; i < count; i++) result[i] = badgeTypes[i];
        return result;
    }

    function getOwnedTokens(
        address owner
    ) external view returns (uint256[] memory) {
        uint256 bal = balanceOf(owner);
        uint256[] memory ids = new uint256[](bal);
        for (uint256 i = 0; i < bal; i++)
            ids[i] = tokenOfOwnerByIndex(owner, i);
        return ids;
    }

    function totalMinted() external view returns (uint256) {
        return _tokenIds.current();
    }

    // ── Overrides ─────────────────────────────────────────────────

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    function _burn(
        uint256 tokenId
    ) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        override(ERC721, ERC721URIStorage, ERC721Enumerable, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
