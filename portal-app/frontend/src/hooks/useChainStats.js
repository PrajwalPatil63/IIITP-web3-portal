import { useEffect, useState } from "react";
import { JsonRpcProvider, Contract, formatUnits } from "ethers";
import { ADDRESSES, CONTRACTS } from "../contracts/config";

// Public read-only Sepolia RPC (no wallet required — works even for unauthenticated visitors).
const PUBLIC_RPC_URLS = [
    "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161", // Public Infura key fallback
    "https://ethereum-sepolia.blockpi.network/v1/rpc/public",
    "https://gateway.tenderly.co/public/sepolia",
    "https://rpc.sepolia.org",
    "https://ethereum-sepolia-rpc.publicnode.com",
];

async function firstWorkingProvider() {
    for (const url of PUBLIC_RPC_URLS) {
        try {
            const p = new JsonRpcProvider(url);
            await p.getBlockNumber();
            return p;
        } catch {
            // try next
        }
    }
    return null;
}

const EMPTY = {
    loading: true,
    block: 0,
    tokenSupply: 0,
    tokenHolders: 0,
    totalStaked: 0,
    pool: { eth: 0, token: 0, tvlEth: 0 },
    activeNodes: 0,
    nodeStake: 0,
    proposalCount: 0,
    activeProposals: 0,
    badgeTypes: 0,
    badgesMinted: 0,
    nftsMinted: 0,
    nftsListed: 0,
    diceRolls: 0,
    diceWagered: 0,
    diceHouse: 0,
};

/**
 * Reads live aggregate stats from all 9 deployed contracts on Sepolia.
 * Returns empty/partial data until chain responds — never throws.
 * Designed for both landing page (no wallet) and dashboard (wallet connected).
 */
export function useChainStats(refreshMs = 25000) {
    const [stats, setStats] = useState(EMPTY);

    useEffect(() => {
        let cancelled = false;

        const safe = async (fn, fallback) => {
            try {
                return await fn();
            } catch {
                return fallback;
            }
        };

        const load = async () => {
            const provider = await firstWorkingProvider();
            if (!provider || cancelled) return;

            const token = new Contract(ADDRESSES.IIITPToken, CONTRACTS.IIITPToken.abi, provider);
            const staking = new Contract(ADDRESSES.IIITPStaking, CONTRACTS.IIITPStaking.abi, provider);
            const lp = new Contract(ADDRESSES.LiquidityPool, CONTRACTS.LiquidityPool.abi, provider);
            const nr = new Contract(ADDRESSES.NodeRegistry, CONTRACTS.NodeRegistry.abi, provider);
            const voting = new Contract(ADDRESSES.Voting, CONTRACTS.Voting.abi, provider);
            const badge = new Contract(ADDRESSES.IIITPBadge, CONTRACTS.IIITPBadge.abi, provider);
            const market = new Contract(ADDRESSES.IIITPMarket, CONTRACTS.IIITPMarket.abi, provider);
            const dice = new Contract(ADDRESSES.IIITPDice, CONTRACTS.IIITPDice.abi, provider);

            const [
                block,
                supply,
                ts,
                reserves,
                activeNodeCount,
                nodeStake,
                proposalCount,
                activeProps,
                badgeTypeCount,
                badgesMinted,
                nftsMinted,
                allListings,
                diceStats,
                diceHouse,
            ] = await Promise.all([
                safe(() => provider.getBlockNumber(), 0),
                safe(() => token.totalSupply(), 0n),
                safe(() => staking.totalStaked(), 0n),
                safe(() => lp.getReserves(), [0n, 0n]),
                safe(() => nr.activeNodeCount(), 0n),
                safe(() => nr.nodeStakeRequired(), 0n),
                safe(() => voting.proposalCount(), 0n),
                safe(() => voting.getActiveProposals(), []),
                safe(() => badge.getBadgeTypeCount(), 0n),
                safe(() => badge.totalMinted(), 0n),
                safe(() => market.totalMinted(), 0n),
                safe(() => market.getAllListings(), [[], [], [], [], []]),
                safe(() => dice.getStats(), [0n, 0n, 0n, 0n]),
                safe(() => dice.houseBalance(), 0n),
            ]);

            if (cancelled) return;

            const rt = reserves[0] ?? 0n;
            const re = reserves[1] ?? 0n;

            setStats({
                loading: false,
                block: Number(block),
                tokenSupply: Number(formatUnits(supply, 18)),
                totalStaked: Number(formatUnits(ts, 18)),
                pool: {
                    eth: Number(formatUnits(re, 18)),
                    token: Number(formatUnits(rt, 18)),
                    tvlEth: Number(formatUnits(re, 18)) * 2, // pool TVL = 2 * eth side
                },
                activeNodes: Number(activeNodeCount),
                nodeStake: Number(formatUnits(nodeStake, 18)),
                proposalCount: Number(proposalCount),
                activeProposals: (activeProps || []).length,
                badgeTypes: Number(badgeTypeCount),
                badgesMinted: Number(badgesMinted),
                nftsMinted: Number(nftsMinted),
                nftsListed: (allListings?.[0] || []).length,
                diceRolls: Number(diceStats?.[0] || 0n),
                diceWagered: Number(formatUnits(diceStats?.[1] || 0n, 18)),
                diceHouse: Number(formatUnits(diceHouse, 18)),
            });
        };

        load();
        const int = setInterval(load, refreshMs);
        return () => {
            cancelled = true;
            clearInterval(int);
        };
    }, [refreshMs]);

    return stats;
}
