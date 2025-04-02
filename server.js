require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const { Connection, PublicKey, Keypair, Transaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createTransferInstruction } = require('@solana/spl-token');
const cron = require('node-cron');
const cors = require('cors');

// Initialize
const app = express();
app.use(cors());
app.use(express.json());

// ======== CONFIG ======== //
const SOLANA_RPC = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
const TOKEN_MINT = process.env.TOKEN_MINT || "YOUR_DEVNET_TOKEN_MINT";
const TREASURY_WALLET = process.env.TREASURY_WALLET || "YOUR_TREASURY_PUBKEY";
const DAILY_REWARD = 100;
const TOKEN_DECIMALS = 9;

// ======== DB SETUP ======== //
let db;
async function connectDB() {
  try {
    const client = await MongoClient.connect(process.env.MONGODB_URI);
    db = client.db('game');
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  }
}

// ======== SOLANA SETUP ======== //
const connection = new Connection(SOLANA_RPC);
const treasuryKeypair = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(process.env.TREASURY_PRIVATE_KEY))
);

// ======== ROUTES ======== //
app.get('/test-db', async (req, res) => {
  try {
    const collections = await db.listCollections().toArray();
    res.json({ status: "Connected", collections });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await connectDB();
  console.log(`Server running on port ${PORT}`);
});
