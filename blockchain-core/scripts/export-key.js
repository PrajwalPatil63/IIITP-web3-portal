const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

async function main() {
    const keystorePath = path.join(
        __dirname,
        "../chain/data/keystore/UTC--2026-04-10T18-53-37.799447000Z--0c6589a14035de262c1f1efb187375067df37d94"
    );

    const password = fs.readFileSync(
        path.join(__dirname, "../chain/password.txt"),
        "utf8"
    ).trim();

    const keystore = fs.readFileSync(keystorePath, "utf8");

    console.log("Decrypting keystore (this may take a moment)...");
    const wallet = await ethers.Wallet.fromEncryptedJson(keystore, password);

    console.log("\n✅ Account:", wallet.address);
    console.log("🔑 Private Key:", wallet.privateKey);
    console.log("\n👉 Copy the private key above and import it into MetaMask.");
}

main().catch(console.error);
