// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IIITPToken.sol";

/**
 * @title IIITPLiquidityPool
 * @notice AMM liquidity pool for I3TP / ETH pair.
 *
 * Mechanics:
 *   - Constant product formula: x * y = k
 *   - LP tokens (IITP-LP) minted to liquidity providers
 *   - 0.3% swap fee, split: 0.25% to LPs, 0.05% to protocol treasury
 *   - Anyone can add/remove liquidity and swap
 */
contract IIITPLiquidityPool is ERC20, ReentrancyGuard, Ownable {

    // ── Token ─────────────────────────────────────────────
    IIITPToken public immutable token;      // I3TP
    address    public treasury;

    // ── Fee config ────────────────────────────────────────
    uint256 public constant FEE_BPS           = 30;    // 0.30% total swap fee
    uint256 public constant PROTOCOL_FEE_BPS  = 5;     // 0.05% of swap to treasury
    uint256 public constant BPS               = 10_000;

    // ── Reserves ──────────────────────────────────────────
    uint256 public reserveToken;   // I3TP reserve
    uint256 public reserveETH;     // ETH reserve

    // ── Events ───────────────────────────────────────────
    event LiquidityAdded(address indexed provider, uint256 tokenAmount, uint256 ethAmount, uint256 lpMinted);
    event LiquidityRemoved(address indexed provider, uint256 tokenAmount, uint256 ethAmount, uint256 lpBurned);
    event SwapTokenForETH(address indexed user, uint256 tokenIn, uint256 ethOut);
    event SwapETHForToken(address indexed user, uint256 ethIn, uint256 tokenOut);
    event TreasuryUpdated(address newTreasury);

    // ── Constructor ──────────────────────────────────────
    constructor(address tokenAddress, address _treasury) ERC20("IITP-LP", "IITP-LP") {
        require(tokenAddress != address(0), "LP: zero token");
        require(_treasury    != address(0), "LP: zero treasury");
        token    = IIITPToken(tokenAddress);
        treasury = _treasury;
    }

    // ── Add Liquidity ─────────────────────────────────────
    /**
     * @notice Add I3TP + ETH liquidity. Receive LP tokens.
     * @param tokenAmount Amount of I3TP to deposit
     */
    function addLiquidity(uint256 tokenAmount) external payable nonReentrant {
        require(tokenAmount > 0 && msg.value > 0, "LP: zero amounts");

        uint256 lpMinted;
        uint256 supply = totalSupply();

        if (supply == 0) {
            // First liquidity — set initial price
            lpMinted = _sqrt(tokenAmount * msg.value);
        } else {
            // Maintain ratio, take minimum to prevent dilution
            uint256 lpFromToken = tokenAmount * supply / reserveToken;
            uint256 lpFromETH   = msg.value   * supply / reserveETH;
            lpMinted = lpFromToken < lpFromETH ? lpFromToken : lpFromETH;
        }

        require(lpMinted > 0, "LP: insufficient liquidity minted");

        token.transferFrom(msg.sender, address(this), tokenAmount);
        reserveToken += tokenAmount;
        reserveETH   += msg.value;

        _mint(msg.sender, lpMinted);

        emit LiquidityAdded(msg.sender, tokenAmount, msg.value, lpMinted);
    }

    // ── Remove Liquidity ──────────────────────────────────
    /**
     * @notice Burn LP tokens, receive proportional I3TP + ETH back.
     * @param lpAmount Amount of LP tokens to burn
     */
    function removeLiquidity(uint256 lpAmount) external nonReentrant {
        require(lpAmount > 0, "LP: zero lp amount");

        uint256 supply = totalSupply();
        uint256 tokenOut = lpAmount * reserveToken / supply;
        uint256 ethOut   = lpAmount * reserveETH   / supply;

        require(tokenOut > 0 && ethOut > 0, "LP: insufficient liquidity burned");

        _burn(msg.sender, lpAmount);
        reserveToken -= tokenOut;
        reserveETH   -= ethOut;

        token.transfer(msg.sender, tokenOut);
        payable(msg.sender).transfer(ethOut);

        emit LiquidityRemoved(msg.sender, tokenOut, ethOut, lpAmount);
    }

    // ── Swap I3TP → ETH ───────────────────────────────────
    /**
     * @notice Swap exact I3TP for ETH.
     * @param tokenIn    Amount of I3TP to swap
     * @param minEthOut  Minimum ETH to receive (slippage protection)
     */
    function swapTokenForETH(uint256 tokenIn, uint256 minEthOut) external nonReentrant {
        require(tokenIn > 0, "LP: zero input");

        uint256 tokenInAfterFee = tokenIn * (BPS - FEE_BPS) / BPS;
        uint256 ethOut          = _getAmountOut(tokenInAfterFee, reserveToken, reserveETH);

        require(ethOut >= minEthOut, "LP: slippage exceeded");
        require(ethOut <= reserveETH, "LP: insufficient ETH reserve");

        // Receive tokens FIRST, then distribute fee
        require(token.transferFrom(msg.sender, address(this), tokenIn), "LP: transfer failed");

        uint256 protocolFee = tokenIn * PROTOCOL_FEE_BPS / BPS;
        if (protocolFee > 0) {
            require(token.transfer(treasury, protocolFee), "LP: fee transfer failed");
        }

        reserveToken += tokenIn - protocolFee;
        reserveETH   -= ethOut;

        payable(msg.sender).transfer(ethOut);

        emit SwapTokenForETH(msg.sender, tokenIn, ethOut);
    }

    // ── Swap ETH → I3TP ──────────────────────────────────
    /**
     * @notice Swap exact ETH for I3TP.
     * @param minTokenOut Minimum I3TP to receive (slippage protection)
     */
    function swapETHForToken(uint256 minTokenOut) external payable nonReentrant {
        require(msg.value > 0, "LP: zero ETH");

        uint256 ethInAfterFee = msg.value * (BPS - FEE_BPS) / BPS;
        uint256 tokenOut      = _getAmountOut(ethInAfterFee, reserveETH, reserveToken);

        require(tokenOut >= minTokenOut, "LP: slippage exceeded");
        require(tokenOut <= reserveToken, "LP: insufficient token reserve");

        // Protocol fee in ETH
        uint256 protocolFee = msg.value * PROTOCOL_FEE_BPS / BPS;
        payable(treasury).transfer(protocolFee);

        reserveETH   += msg.value - protocolFee;
        reserveToken -= tokenOut;

        token.transfer(msg.sender, tokenOut);

        emit SwapETHForToken(msg.sender, msg.value, tokenOut);
    }

    // ── View helpers ──────────────────────────────────────
    function getTokenPrice() external view returns (uint256 ethPerToken) {
        if (reserveToken == 0) return 0;
        return reserveETH * 1e18 / reserveToken;
    }

    function getAmountOutTokenForETH(uint256 tokenIn) external view returns (uint256) {
        uint256 tokenInAfterFee = tokenIn * (BPS - FEE_BPS) / BPS;
        return _getAmountOut(tokenInAfterFee, reserveToken, reserveETH);
    }

    function getAmountOutETHForToken(uint256 ethIn) external view returns (uint256) {
        uint256 ethInAfterFee = ethIn * (BPS - FEE_BPS) / BPS;
        return _getAmountOut(ethInAfterFee, reserveETH, reserveToken);
    }

    function getReserves() external view returns (uint256 _reserveToken, uint256 _reserveETH) {
        return (reserveToken, reserveETH);
    }

    // ── Internal ──────────────────────────────────────────
    // Constant product: dy = y * dx / (x + dx)
    function _getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        internal pure returns (uint256)
    {
        require(reserveIn > 0 && reserveOut > 0, "LP: empty reserve");
        return reserveOut * amountIn / (reserveIn + amountIn);
    }

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) { z = x; x = (y / x + x) / 2; }
        } else if (y != 0) {
            z = 1;
        }
    }

    // ── Admin ─────────────────────────────────────────────
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "LP: zero treasury");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    receive() external payable {}
}
