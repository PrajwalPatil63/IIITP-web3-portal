import React from "react";
import { Outlet, NavLink, Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
    LayoutDashboard,
    Coins,
    Layers,
    ArrowLeftRight,
    Vote,
    Server,
    Image as ImageIcon,
    Gamepad2,
    Shield,
    User,
    Droplets,
    Award,
    HelpCircle,
} from "lucide-react";
import WalletButton from "./WalletButton";
import { useWeb3 } from "../contexts/Web3Context";

const navItems = [
    { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/app/faucet", label: "Faucet", icon: Droplets },
    { to: "/app/staking", label: "Staking", icon: Coins },
    { to: "/app/swap", label: "Swap", icon: ArrowLeftRight },
    { to: "/app/liquidity", label: "Liquidity", icon: Layers },
    { to: "/app/voting", label: "Voting", icon: Vote },
    { to: "/app/nodes", label: "Node Runner", icon: Server },
    { to: "/app/nft", label: "NFT Market", icon: ImageIcon },
    { to: "/app/badges", label: "Badges", icon: Award },
    { to: "/app/games", label: "Dice", icon: Gamepad2 },
    { to: "/app/profile", label: "Profile", icon: User },
    { to: "/app/help", label: "Help", icon: HelpCircle },
];

export default function Layout() {
    const { isAdmin } = useWeb3();
    const loc = useLocation();
    return (
        <div className="min-h-screen flex flex-col" data-testid="app-layout">
            <Header />
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-[260px_1fr]">
                <aside
                    className="hidden lg:flex flex-col border-r border-white/5 px-4 py-6 sticky top-[64px] h-[calc(100vh-64px)]"
                    data-testid="sidebar"
                >
                    <nav className="flex-1 space-y-1">
                        {navItems.map((item) => (
                            <SidebarLink key={item.to} {...item} />
                        ))}
                        {isAdmin && (
                            <SidebarLink to="/app/admin" label="Admin" icon={Shield} accent />
                        )}
                    </nav>
                    <div className="glass-cyan cyberpunk-clip p-3 mt-4 text-xs font-mono text-cyan-300/80">
                        <div className="flex items-center gap-2">
                            <span className="size-2 rounded-full bg-cyber-green blink shadow-[0_0_8px_#39FF14]" />
                            <span>NETWORK: SEPOLIA</span>
                        </div>
                        <div className="mt-1 text-[10px] text-cyan-200/50">CHAIN_ID 11155111</div>
                    </div>
                </aside>
                <main className="relative scanlines">
                    <motion.div
                        key={loc.pathname}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, ease: "easeOut" }}
                        className="px-4 sm:px-8 py-6 sm:py-10 max-w-7xl mx-auto"
                    >
                        <Outlet />
                    </motion.div>
                </main>
            </div>
        </div>
    );
}

function SidebarLink({ to, label, icon: Icon, end, accent }) {
    return (
        <NavLink
            to={to}
            end={end}
            data-testid={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
            className={({ isActive }) =>
                [
                    "group flex items-center gap-3 px-3 py-2.5 transition-all duration-300 cyberpunk-clip relative font-display tracking-wide",
                    isActive
                        ? "bg-cyan-500/10 text-cyan-300 border border-cyan-400/40 glow-cyan"
                        : "text-slate-400 hover:text-white border border-transparent hover:border-white/10 hover:bg-white/[0.03]",
                    accent ? "border-pink-500/40 text-pink-400" : "",
                ].join(" ")
            }
        >
            <Icon className="size-4" />
            <span className="text-sm uppercase tracking-[0.14em]">{label}</span>
        </NavLink>
    );
}

function Header() {
    return (
        <header
            className="sticky top-0 z-40 backdrop-blur-xl bg-black/60 border-b border-white/5"
            data-testid="app-header"
        >
            <div className="px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
                <Link to="/app" className="flex items-center gap-3" data-testid="logo-home">
                    <div className="relative size-8 rounded-sm bg-cyan-400/10 border border-cyan-400/60 flex items-center justify-center glow-cyan">
                        <span className="font-mono font-bold text-cyan-300 text-sm">IP</span>
                    </div>
                    <div className="leading-tight">
                        <div className="font-display tracking-[0.18em] text-sm text-white uppercase">
                            IIIT Pune
                        </div>
                        <div className="font-mono text-[10px] text-cyan-300/70 tracking-wider">
                            // WEB3 PORTAL
                        </div>
                    </div>
                </Link>
                <div className="flex items-center gap-3">
                    <WalletButton />
                </div>
            </div>
        </header>
    );
}
