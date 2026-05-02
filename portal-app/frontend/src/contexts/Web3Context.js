import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BrowserProvider, Contract, formatUnits, parseUnits } from "ethers";
import { toast } from "sonner";
import {
    ADDRESSES,
    CHAIN_ID,
    CHAIN_ID_HEX,
    CONTRACTS,
    EXPLORER_URL,
    ADMIN_WALLETS,
} from "../contracts/config";

const Web3Context = createContext(null);

export const useWeb3 = () => {
    const ctx = useContext(Web3Context);
    if (!ctx) throw new Error("useWeb3 must be used within Web3Provider");
    return ctx;
};

const SEPOLIA_PARAMS = {
    chainId: CHAIN_ID_HEX,
    chainName: "Sepolia Testnet",
    nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://rpc.sepolia.org", "https://ethereum-sepolia-rpc.publicnode.com"],
    blockExplorerUrls: [EXPLORER_URL],
};

export const Web3Provider = ({ children }) => {
    const [account, setAccount] = useState(null);
    const [chainId, setChainId] = useState(null);
    const [provider, setProvider] = useState(null);
    const [signer, setSigner] = useState(null);
    const [connecting, setConnecting] = useState(false);
    const [ethBalance, setEthBalance] = useState("0");
    const [tokenBalance, setTokenBalance] = useState("0");
    const [tokenSymbol, setTokenSymbol] = useState("IITP");
    const [tokenDecimals, setTokenDecimals] = useState(18);

    const initialized = useRef(false);

    const hasMetaMask = typeof window !== "undefined" && !!window.ethereum;
    const isCorrectNetwork = chainId === CHAIN_ID;
    const isAdmin = !!account && ADMIN_WALLETS.map((a) => a.toLowerCase()).includes(account.toLowerCase());

    const refreshBalances = useCallback(async (acc, prov) => {
        if (!acc || !prov) return;
        try {
            const eth = await prov.getBalance(acc);
            setEthBalance(formatUnits(eth, 18));
        } catch (e) {
            console.warn("refreshBalances: getBalance failed", e?.message);
        }
        try {
            const token = new Contract(ADDRESSES.IIITPToken, CONTRACTS.IIITPToken.abi, prov);
            const [bal, sym, dec] = await Promise.all([
                token.balanceOf(acc),
                token.symbol().catch(() => "IITP"),
                token.decimals().catch(() => 18),
            ]);
            setTokenSymbol(sym);
            setTokenDecimals(Number(dec));
            setTokenBalance(formatUnits(bal, Number(dec)));
        } catch (e) {
            console.warn("refreshBalances: token read failed (likely wrong network)", e?.message);
        }
    }, []);

    const setupConnection = useCallback(async () => {
        if (!hasMetaMask) return;
        const ethProvider = new BrowserProvider(window.ethereum);
        const accounts = await window.ethereum.request({ method: "eth_accounts" });
        const network = await ethProvider.getNetwork();
        setChainId(Number(network.chainId));
        if (accounts && accounts.length > 0) {
            const ethSigner = await ethProvider.getSigner();
            setProvider(ethProvider);
            setSigner(ethSigner);
            setAccount(accounts[0]);
            await refreshBalances(accounts[0], ethProvider);
        }
    }, [hasMetaMask, refreshBalances]);

    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;
        if (!hasMetaMask) return;

        setupConnection();

        const onAccounts = async (accs) => {
            if (!accs || accs.length === 0) {
                setAccount(null);
                setSigner(null);
                setEthBalance("0");
                setTokenBalance("0");
                toast.info("Wallet disconnected");
            } else {
                setAccount(accs[0]);
                if (provider) {
                    const s = await provider.getSigner();
                    setSigner(s);
                    refreshBalances(accs[0], provider);
                }
            }
        };
        const onChain = async (cid) => {
            setChainId(parseInt(cid, 16));
            // Recreate provider AND signer for new network
            const p = new BrowserProvider(window.ethereum);
            setProvider(p);
            try {
                const s = await p.getSigner();
                setSigner(s);
            } catch {
                setSigner(null);
            }
        };

        window.ethereum.on("accountsChanged", onAccounts);
        window.ethereum.on("chainChanged", onChain);

        return () => {
            try {
                window.ethereum.removeListener("accountsChanged", onAccounts);
                window.ethereum.removeListener("chainChanged", onChain);
            } catch (e) {
                console.warn("Failed to remove ethereum listeners", e?.message);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const connect = useCallback(async () => {
        if (!hasMetaMask) {
            toast.error("MetaMask not detected", {
                description: "Install MetaMask from metamask.io and refresh.",
            });
            return null;
        }
        try {
            setConnecting(true);
            const ethProvider = new BrowserProvider(window.ethereum);
            const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
            const network = await ethProvider.getNetwork();
            const ethSigner = await ethProvider.getSigner();
            setProvider(ethProvider);
            setSigner(ethSigner);
            setAccount(accounts[0]);
            setChainId(Number(network.chainId));
            await refreshBalances(accounts[0], ethProvider);
            toast.success("Wallet connected", {
                description: `${accounts[0].slice(0, 6)}…${accounts[0].slice(-4)}`,
            });
            return accounts[0];
        } catch (e) {
            toast.error(e?.shortMessage || e?.message || "Connection failed");
            return null;
        } finally {
            setConnecting(false);
        }
    }, [hasMetaMask, refreshBalances]);

    const switchNetwork = useCallback(async () => {
        if (!hasMetaMask) return;
        try {
            await window.ethereum.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: CHAIN_ID_HEX }],
            });
            toast.success("Switched to Sepolia");
        } catch (e) {
            if (e?.code === 4902 || e?.error?.code === 4902) {
                try {
                    await window.ethereum.request({
                        method: "wallet_addEthereumChain",
                        params: [SEPOLIA_PARAMS],
                    });
                } catch (addErr) {
                    toast.error("Could not add Sepolia to MetaMask");
                }
            } else {
                toast.error(e?.shortMessage || "Network switch failed");
            }
        }
    }, [hasMetaMask]);

    const disconnect = useCallback(() => {
        setAccount(null);
        setSigner(null);
        setEthBalance("0");
        setTokenBalance("0");
        toast.info("Disconnected (locally). MetaMask will remember the site.");
    }, []);

    const getContract = useCallback(
        (key, withSigner = false) => {
            const def = CONTRACTS[key];
            if (!def) throw new Error(`Unknown contract ${key}`);
            const target = withSigner ? signer : provider;
            if (!target) throw new Error("Wallet not connected");
            return new Contract(def.address, def.abi, target);
        },
        [provider, signer]
    );

    // ── Infinite-approval helper ──
    // Checks current IITP allowance and approves max uint256 if insufficient.
    // Prevents RPC-lag "insufficient allowance" bugs and is standard Uniswap/OpenSea UX.
    const ensureTokenApproval = useCallback(
        async (spender, requiredAmount) => {
            if (!signer || !account) {
                toast.error("Connect wallet first");
                return false;
            }

            try {
                const tokenRead = getContract("IIITPToken");
                const tokenWrite = getContract("IIITPToken", true);

                const current = await tokenRead.allowance(account, spender).catch(() => 0n);

                if (current >= requiredAmount) return true;

                const MAX = 2n ** 256n - 1n;

                const tId = toast.loading("Approving IITP spend (one-time)…");

                const tx = await tokenWrite.approve(spender, MAX);
                toast.loading(`Approval tx: ${tx.hash.slice(0, 10)}…`, { id: tId });

                await tx.wait();

                const fresh = await tokenRead.allowance(account, spender).catch(() => 0n);

                if (fresh >= requiredAmount) {
                    toast.success("Token approved", { id: tId });
                    return true;
                } else {
                    toast.error("Approval not registered", { id: tId });
                    return false;
                }
            } catch (e) {
                toast.error(e?.shortMessage || e?.reason || e?.message || "Approval failed");
                return false;
            }
        },
        [signer, account, getContract]
    );
    // Generic safe-call wrapper for write transactions with toasts
    const sendTx = useCallback(
        async (label, contractKey, fnName, args = [], options = {}) => {
            if (!signer) {
                toast.error("Connect your wallet first");
                return null;
            }
            if (!isCorrectNetwork) {
                toast.error(`Switch to ${SEPOLIA_PARAMS.chainName}`);
                return null;
            }
            const tId = toast.loading(`${label}: awaiting signature…`);
            try {
                const c = getContract(contractKey, true);
                const tx = await c[fnName](...args, options);
                toast.loading(`${label}: tx ${tx.hash.slice(0, 10)}…`, { id: tId });
                const receipt = await tx.wait();
                if (receipt?.status === 1) {
                    toast.success(`${label} confirmed`, {
                        id: tId,
                        description: tx.hash,
                        action: {
                            label: "View",
                            onClick: () => window.open(`${EXPLORER_URL}/tx/${tx.hash}`, "_blank"),
                        },
                    });
                    if (account && provider) refreshBalances(account, provider);
                    return { tx, receipt };
                }
                toast.error(`${label} reverted`, { id: tId });
                return null;
            } catch (e) {
                const msg = e?.shortMessage || e?.reason || e?.message || "Transaction failed";
                toast.error(`${label} failed`, { id: tId, description: msg.slice(0, 160) });
                return null;
            }
        },
        [signer, isCorrectNetwork, getContract, account, provider, refreshBalances]
    );

    const value = useMemo(
        () => ({
            hasMetaMask,
            account,
            chainId,
            provider,
            signer,
            connect,
            disconnect,
            switchNetwork,
            connecting,
            isCorrectNetwork,
            isAdmin,
            ethBalance,
            tokenBalance,
            tokenSymbol,
            tokenDecimals,
            getContract,
            sendTx,
            ensureTokenApproval,
            refreshBalances: () => account && provider && refreshBalances(account, provider),
            CHAIN_ID,
            EXPLORER_URL,
            ADDRESSES,
            parseUnits,
            formatUnits,
        }),
        [
            hasMetaMask,
            account,
            chainId,
            provider,
            signer,
            connect,
            disconnect,
            switchNetwork,
            connecting,
            isCorrectNetwork,
            isAdmin,
            ethBalance,
            tokenBalance,
            tokenSymbol,
            tokenDecimals,
            getContract,
            sendTx,
            ensureTokenApproval,
            refreshBalances,
        ]
    );

    return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
};
