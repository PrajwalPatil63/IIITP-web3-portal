import React from "react";
import "@/index.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { Web3Provider } from "@/contexts/Web3Context";
import Layout from "@/components/Layout";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Faucet from "@/pages/Faucet";
import Staking from "@/pages/Staking";
import Swap from "@/pages/Swap";
import Liquidity from "@/pages/Liquidity";
import Voting from "@/pages/Voting";
import Nodes from "@/pages/Nodes";
import NFT from "@/pages/NFT";
import Games from "@/pages/Games";
import Profile from "@/pages/Profile";
import Admin from "@/pages/Admin";
import Badges from "@/pages/Badges";
import GettingStarted from "@/pages/GettingStarted";

function App() {
    return (
        <Web3Provider>
            <div className="App font-display text-white">
                <BrowserRouter>
                    <Routes>
                        <Route path="/" element={<Landing />} />
                        <Route path="/getting-started" element={<GettingStarted publicMode={true} />} />
                        <Route path="/app" element={<Layout />}>
                            <Route index element={<Dashboard />} />
                            <Route path="faucet" element={<Faucet />} />
                            <Route path="staking" element={<Staking />} />
                            <Route path="swap" element={<Swap />} />
                            <Route path="liquidity" element={<Liquidity />} />
                            <Route path="voting" element={<Voting />} />
                            <Route path="nodes" element={<Nodes />} />
                            <Route path="nft" element={<NFT />} />
                            <Route path="badges" element={<Badges />} />
                            <Route path="games" element={<Games />} />
                            <Route path="profile" element={<Profile />} />
                            <Route path="admin" element={<Admin />} />
                            <Route path="help" element={<GettingStarted />} />
                        </Route>
                    </Routes>
                </BrowserRouter>
                <Toaster
                    theme="dark"
                    position="top-right"
                    toastOptions={{
                        className:
                            "!bg-black/80 !border !border-cyan-400/30 !text-white !font-mono !backdrop-blur-xl",
                    }}
                />
            </div>
        </Web3Provider>
    );
}

export default App;
