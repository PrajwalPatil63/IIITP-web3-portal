// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

interface I_IIITPToken {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title IIITPMarket
 * @notice Open NFT marketplace for IIIT Pune blockchain portal.
 *
 * - Any user can mint an NFT by providing an IPFS image URI.
 * - Students pay a mint fee in IITP tokens; teachers mint free.
 * - Owners can list their NFT for sale at any IITP price.
 * - Anyone can buy a listed NFT; payment goes to seller minus platform fee.
 * - Admin manages teacher status, mint fee, and platform fee.
 */
contract IIITPMarket is ERC721, ERC721URIStorage, ERC721Enumerable, AccessControl, Pausable, ReentrancyGuard {
    using Counters for Counters.Counter;

    // ── Roles ─────────────────────────────────────────────────────
    bytes32 public constant TEACHER_ROLE = keccak256("TEACHER_ROLE");
    bytes32 public constant PAUSER_ROLE  = keccak256("PAUSER_ROLE");

    // ── State ─────────────────────────────────────────────────────
    Counters.Counter private _tokenIds;

    I_IIITPToken public immutable token;
    address    public treasury;

    uint256 public mintFee       = 10 ether;   // IITP tokens (18 dec); teachers pay 0
    uint256 public platformFeeBps = 250;        // 2.5% of sale price goes to treasury

    struct NFTInfo {
        address creator;
        uint256 mintedAt;
        string  imageURI;   // IPFS URI provided by user e.g. ipfs://Qm...
        string  name;
    }

    struct Listing {
        address seller;
        uint256 price;      // in IITP tokens
        bool    active;
    }

    mapping(uint256 => NFTInfo) public nftInfo;
    mapping(uint256 => Listing) public listings;

    // ── Events ────────────────────────────────────────────────────
    event Minted(uint256 indexed tokenId, address indexed creator, string imageURI, string name, bool teacherMint);
    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event Delisted(uint256 indexed tokenId, address indexed seller);
    event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price);
    event MintFeeUpdated(uint256 newFee);
    event PlatformFeeUpdated(uint256 newBps);
    event TreasuryUpdated(address newTreasury);
    event TeacherSet(address indexed account, bool status);

    // ── Constructor ───────────────────────────────────────────────
    constructor(address tokenAddress, address _treasury) ERC721("IIITPMarket", "IITPNFT") {
        token    = I_IIITPToken(tokenAddress);
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE,        msg.sender);
    }

    // ── Admin ─────────────────────────────────────────────────────

    function setTeacher(address account, bool status) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (status) _grantRole(TEACHER_ROLE, account);
        else        _revokeRole(TEACHER_ROLE, account);
        emit TeacherSet(account, status);
    }

    function setTeacherBatch(address[] calldata accounts, bool status) external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < accounts.length; i++) {
            if (status) _grantRole(TEACHER_ROLE, accounts[i]);
            else        _revokeRole(TEACHER_ROLE, accounts[i]);
            emit TeacherSet(accounts[i], status);
        }
    }

    function setMintFee(uint256 fee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        mintFee = fee;
        emit MintFeeUpdated(fee);
    }

    function setPlatformFee(uint256 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(bps <= 1000, "Max 10%");
        platformFeeBps = bps;
        emit PlatformFeeUpdated(bps);
    }

    function setTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_treasury != address(0), "Zero address");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function pause()   external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // ── Mint ──────────────────────────────────────────────────────

    /**
     * @param imageURI  IPFS URI of the image e.g. "ipfs://QmXyz..."
     * @param name      Display name of the NFT
     *
     * Teachers mint free. Students pay `mintFee` IITP tokens.
     * Token approval required before calling if student.
     */
    function mint(
        string calldata imageURI,
        string calldata name
    ) external whenNotPaused nonReentrant returns (uint256) {
        require(bytes(imageURI).length > 0, "URI required");
        require(bytes(name).length > 0,     "Name required");

        bool isTeacherAccount = hasRole(TEACHER_ROLE, msg.sender);

        // Charge mint fee for non-teachers
        if (!isTeacherAccount && mintFee > 0) {
            require(
                token.transferFrom(msg.sender, treasury, mintFee),
                "Mint fee payment failed"
            );
        }

        _tokenIds.increment();
        uint256 newId = _tokenIds.current();

        _safeMint(msg.sender, newId);

        // Build tokenURI as JSON data URI pointing to image
        // Format: data:application/json;utf8,{...}
        string memory json = string(abi.encodePacked(
            '{"name":"', name,
            '","image":"', imageURI,
            '","creator":"', _toHexString(msg.sender),
            '"}'
        ));
        _setTokenURI(newId, string(abi.encodePacked("data:application/json;utf8,", json)));

        nftInfo[newId] = NFTInfo({
            creator:   msg.sender,
            mintedAt:  block.timestamp,
            imageURI:  imageURI,
            name:      name
        });

        emit Minted(newId, msg.sender, imageURI, name, isTeacherAccount);
        return newId;
    }

    // ── Marketplace ───────────────────────────────────────────────

    /**
     * @notice List your NFT for sale at a given IITP price.
     *         You must still own the NFT; it stays in your wallet until sold.
     *         Approve this contract as operator before listing.
     */
    function list(uint256 tokenId, uint256 price) external whenNotPaused {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        require(price > 0,                       "Price must be > 0");
        require(
            getApproved(tokenId) == address(this) || isApprovedForAll(msg.sender, address(this)),
            "Approve contract first"
        );

        listings[tokenId] = Listing({ seller: msg.sender, price: price, active: true });
        emit Listed(tokenId, msg.sender, price);
    }

    /**
     * @notice Remove your listing.
     */
    function delist(uint256 tokenId) external {
        require(listings[tokenId].seller == msg.sender, "Not seller");
        listings[tokenId].active = false;
        emit Delisted(tokenId, msg.sender);
    }

    /**
     * @notice Buy a listed NFT. Buyer must approve IITP spend before calling.
     *         Platform fee goes to treasury; remainder to seller.
     */
    function buy(uint256 tokenId) external whenNotPaused nonReentrant {
        Listing storage l = listings[tokenId];
        require(l.active,                          "Not listed");
        require(ownerOf(tokenId) == l.seller,      "Seller no longer owns");
        require(msg.sender != l.seller,            "Cannot buy own NFT");

        uint256 price      = l.price;
        uint256 fee        = (price * platformFeeBps) / 10000;
        uint256 sellerCut  = price - fee;
        address seller     = l.seller;

        // Deactivate listing before transfers (reentrancy safety)
        l.active = false;

        // Collect payment from buyer
        require(token.transferFrom(msg.sender, address(this), price), "Payment failed");

        // Pay seller
        require(token.transfer(seller, sellerCut), "Seller payment failed");

        // Pay platform fee
        if (fee > 0) {
            require(token.transfer(treasury, fee), "Fee transfer failed");
        }

        // Transfer NFT
        _transfer(seller, msg.sender, tokenId);

        emit Sold(tokenId, seller, msg.sender, price);
    }

    // ── Views ─────────────────────────────────────────────────────

    function getOwnedTokens(address owner) external view returns (uint256[] memory) {
        uint256 bal = balanceOf(owner);
        uint256[] memory ids = new uint256[](bal);
        for (uint256 i = 0; i < bal; i++) {
            ids[i] = tokenOfOwnerByIndex(owner, i);
        }
        return ids;
    }

    function getAllListings() external view returns (
        uint256[] memory tokenIds,
        address[] memory sellers,
        uint256[] memory prices,
        string[]  memory imageURIs,
        string[]  memory names
    ) {
        uint256 total = _tokenIds.current();
        uint256 count = 0;

        // Count active listings
        for (uint256 i = 1; i <= total; i++) {
            if (listings[i].active && ownerOf(i) == listings[i].seller) count++;
        }

        tokenIds  = new uint256[](count);
        sellers   = new address[](count);
        prices    = new uint256[](count);
        imageURIs = new string[](count);
        names     = new string[](count);

        uint256 idx = 0;
        for (uint256 i = 1; i <= total; i++) {
            if (listings[i].active && ownerOf(i) == listings[i].seller) {
                tokenIds[idx]  = i;
                sellers[idx]   = listings[i].seller;
                prices[idx]    = listings[i].price;
                imageURIs[idx] = nftInfo[i].imageURI;
                names[idx]     = nftInfo[i].name;
                idx++;
            }
        }
    }

    function totalMinted() external view returns (uint256) {
        return _tokenIds.current();
    }

    function isTeacher(address account) external view returns (bool) {
        return hasRole(TEACHER_ROLE, account);
    }

    // ── Internal helpers ──────────────────────────────────────────

    function _toHexString(address addr) internal pure returns (string memory) {
        bytes memory buffer = new bytes(42);
        buffer[0] = '0'; buffer[1] = 'x';
        bytes16 hex_chars = "0123456789abcdef";
        for (uint256 i = 0; i < 20; i++) {
            uint8 b = uint8(uint160(addr) >> (8 * (19 - i)));
            buffer[2 + i * 2]     = hex_chars[b >> 4];
            buffer[2 + i * 2 + 1] = hex_chars[b & 0x0f];
        }
        return string(buffer);
    }

    // ── ERC721 overrides ──────────────────────────────────────────

    function _beforeTokenTransfer(address from, address to, uint256 tokenId, uint256 batchSize)
        internal override(ERC721, ERC721Enumerable)
    {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
        // Auto-delist if token is transferred (not a mint)
        if (from != address(0) && listings[tokenId].active) {
            listings[tokenId].active = false;
            emit Delisted(tokenId, listings[tokenId].seller);
        }
    }

    function _burn(uint256 tokenId) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId)
        public view override(ERC721, ERC721URIStorage) returns (string memory)
    { return super.tokenURI(tokenId); }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, ERC721URIStorage, ERC721Enumerable, AccessControl) returns (bool)
    { return super.supportsInterface(interfaceId); }
}
