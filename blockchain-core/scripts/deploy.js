const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    const balance = await deployer.getBalance();

    console.log("\n══════════════════════════════════════════════");
    console.log("  IIITPChain — Full Deployment");
    console.log("══════════════════════════════════════════════");
    console.log("Deployer :", deployer.address);
    console.log("Balance  :", hre.ethers.utils.formatEther(balance), "ETH");
    console.log("Network  :", hre.network.name);
    console.log("──────────────────────────────────────────────\n");

    // ── 1. IIITPToken ─────────────────────────────────────
    console.log("1/9  Deploying IIITPToken...");
    const Token = await hre.ethers.getContractFactory("IIITPToken");
    const token = await Token.deploy(deployer.address);
    await token.deployed();
    const tokenAddr = token.address;
    console.log("     ✅ IIITPToken   :", tokenAddr);

    // ── 2. IIITPFaucet ────────────────────────────────────
    console.log("2/9  Deploying IIITPFaucet...");
    const Faucet = await hre.ethers.getContractFactory("IIITPFaucet");
    const faucet = await Faucet.deploy(tokenAddr);
    await faucet.deployed();
    const faucetAddr = faucet.address;
    console.log("     ✅ IIITPFaucet  :", faucetAddr);

    // ── 3. IIITPStaking ───────────────────────────────────
    console.log("3/9  Deploying IIITPStaking...");
    const Staking = await hre.ethers.getContractFactory("IIITPStaking");
    const staking = await Staking.deploy(tokenAddr);
    await staking.deployed();
    const stakingAddr = staking.address;
    console.log("     ✅ IIITPStaking :", stakingAddr);

    // ── 4. IIITPLiquidityPool ─────────────────────────────
    console.log("4/9  Deploying IIITPLiquidityPool...");
    const LP = await hre.ethers.getContractFactory("IIITPLiquidityPool");
    const lp = await LP.deploy(tokenAddr, deployer.address);
    await lp.deployed();
    const lpAddr = lp.address;
    console.log("     ✅ LiquidityPool:", lpAddr);

    // ── 5. IIITPNodeRegistry ──────────────────────────────
    console.log("5/9  Deploying IIITPNodeRegistry...");
    const Registry = await hre.ethers.getContractFactory("IIITPNodeRegistry");
    const registry = await Registry.deploy(tokenAddr);
    await registry.deployed();
    const registryAddr = registry.address;
    console.log("     ✅ NodeRegistry :", registryAddr);

    // ── 6. IIITPVoting ────────────────────────────────────
    console.log("6/9  Deploying IIITPVoting...");
    const Voting = await hre.ethers.getContractFactory("IIITPVoting");
    const voting = await Voting.deploy(tokenAddr, stakingAddr, registryAddr);
    await voting.deployed();
    const votingAddr = voting.address;
    console.log("     ✅ Voting       :", votingAddr);

    // ── 7. IIITPBadge ─────────────────────────────────────
    console.log("7/9  Deploying IIITPBadge...");
    const Badge = await hre.ethers.getContractFactory("IIITPBadge");
    const badge = await Badge.deploy(tokenAddr, deployer.address);
    await badge.deployed();
    const badgeAddr = badge.address;
    console.log("     ✅ IIITPBadge   :", badgeAddr);

    // ── 8. IIITPDice ──────────────────────────────────────
    console.log("8/9  Deploying IIITPDice...");
    const Dice = await hre.ethers.getContractFactory("IIITPDice");
    const dice = await Dice.deploy(tokenAddr);
    await dice.deployed();
    const diceAddr = dice.address;
    console.log("     ✅ IIITPDice    :", diceAddr);

    // ── 9. IIITPMarket ────────────────────────────────────
    console.log("9/9  Deploying IIITPMarket...");
    const Market = await hre.ethers.getContractFactory("IIITPMarket");
    const market = await Market.deploy(tokenAddr, deployer.address);
    await market.deployed();
    const marketAddr = market.address;
    console.log("     ✅ IIITPMarket  :", marketAddr);

    // ── Grant roles ───────────────────────────────────────
    console.log("\nGranting roles...");

    let tx;
    tx = await token.grantMinter(faucetAddr);      await tx.wait();
    console.log("  ✅ Faucet   → MINTER_ROLE");

    tx = await token.grantMinter(stakingAddr);     await tx.wait();
    console.log("  ✅ Staking  → MINTER_ROLE");

    tx = await token.grantMinter(registryAddr);    await tx.wait();
    console.log("  ✅ Registry → MINTER_ROLE");

    tx = await token.grantSnapshotter(votingAddr); await tx.wait();
    console.log("  ✅ Voting   → SNAPSHOT_ROLE");

    tx = await token.grantMinter(badgeAddr);       await tx.wait();
    console.log("  ✅ Badge    → MINTER_ROLE");

    // Fund Dice house with 10,000 I3TP
    console.log("\nFunding Dice house...");
    const fundAmount = hre.ethers.utils.parseEther("10000");
    tx = await token.approve(diceAddr, fundAmount); await tx.wait();
    tx = await dice.fundHouse(fundAmount);           await tx.wait();
    console.log("  ✅ Dice house funded with 10,000 I3TP");

    // ── Write addresses to frontend ───────────────────────
    // blockchain-core/scripts/ → ../../portal-app/frontend/src/contracts/
    const outDir = path.join(__dirname, "../../portal-app/frontend/src/contracts");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const addresses = {
        IIITPToken:    tokenAddr,
        IIITPFaucet:   faucetAddr,
        IIITPStaking:  stakingAddr,
        LiquidityPool: lpAddr,
        NodeRegistry:  registryAddr,
        Voting:        votingAddr,
        IIITPBadge:    badgeAddr,
        IIITPDice:     diceAddr,
        IIITPMarket:   marketAddr,
    };

    // ── Copy ABIs to portal-app/frontend/src/abis/ ───────
    const abiOutDir = path.join(__dirname, "../../portal-app/frontend/src/abis");
    if (!fs.existsSync(abiOutDir)) fs.mkdirSync(abiOutDir, { recursive: true });

    const contractNames = [
        "IIITPToken", "IIITPFaucet", "IIITPStaking",
        "IIITPLiquidityPool", "IIITPNodeRegistry",
        "IIITPVoting", "IIITPBadge", "IIITPDice", "IIITPMarket",
    ];

    const artifactsDir = path.join(__dirname, "../artifacts/contracts");
    for (const name of contractNames) {
        // IIITPLiquidityPool lives in IIITPLiquidity.sol, not IIITPLiquidityPool.sol
        const solFile = name === "IIITPLiquidityPool" ? "IIITPLiquidity" : name;
        const abiPath = path.join(artifactsDir, `${solFile}.sol/${name}.json`);
        if (fs.existsSync(abiPath)) {
            const artifact = JSON.parse(fs.readFileSync(abiPath, "utf8"));
            fs.writeFileSync(
                path.join(abiOutDir, `${name}.json`),
                JSON.stringify(artifact, null, 2)
            );
            console.log(`  ✅ ABI copied : ${name}.json`);
        } else {
            console.warn(`  ⚠️  ABI not found: ${abiPath}`);
        }
    }

    // ── Update config.js with new addresses & admin wallet ─
    const configPath = path.join(outDir, "config.js");
    let configContent = fs.readFileSync(configPath, "utf8");

    for (const [key, addr] of Object.entries(addresses)) {
        const regex = new RegExp(`(${key}:\\s*")[^"]*(")`);
        configContent = configContent.replace(regex, `$1${addr}$2`);
    }

    // Set deployer as admin
    const adminRegex = /export const ADMIN_WALLETS = \[[\s\S]*?\];/;
    configContent = configContent.replace(
        adminRegex,
        `export const ADMIN_WALLETS = [\n    "${deployer.address.toLowerCase()}",\n];`
    );

    fs.writeFileSync(configPath, configContent, "utf8");
    console.log("\n  ✅ config.js updated (addresses + ADMIN_WALLETS)");

    // ── Summary ───────────────────────────────────────────
    console.log("\n══════════════════════════════════════════════");
    console.log("  Deployment Complete!");
    console.log("══════════════════════════════════════════════");
    Object.entries(addresses).forEach(([k, v]) => console.log(`  ${k.padEnd(14)}: ${v}`));

    console.log("\nTo verify on Etherscan:");
    console.log(`  npx hardhat verify --network sepolia ${tokenAddr} "${deployer.address}"`);
    console.log(`  npx hardhat verify --network sepolia ${faucetAddr} "${tokenAddr}"`);
    console.log(`  npx hardhat verify --network sepolia ${stakingAddr} "${tokenAddr}"`);
    console.log(`  npx hardhat verify --network sepolia ${lpAddr} "${tokenAddr}" "${deployer.address}"`);
    console.log(`  npx hardhat verify --network sepolia ${registryAddr} "${tokenAddr}"`);
    console.log(`  npx hardhat verify --network sepolia ${votingAddr} "${tokenAddr}" "${stakingAddr}" "${registryAddr}"`);
    console.log(`  npx hardhat verify --network sepolia ${badgeAddr} "${tokenAddr}" "${deployer.address}"`);
    console.log(`  npx hardhat verify --network sepolia ${diceAddr} "${tokenAddr}"`);
    console.log(`  npx hardhat verify --network sepolia ${marketAddr} "${tokenAddr}" "${deployer.address}"`);
}

main().catch((err) => { console.error(err); process.exit(1); });
