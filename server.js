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

// ======== CONFIG (using YOUR env vars) ======== //
const SOLANA_RPC = process.env.SOLANA_RPC;
const TOKEN_MINT = new PublicKey(process.env.TOKEN_MINT); // h5eXaXRXyh8nzmPKxuRhySQkQxtSXECZmzBSKXfpump
const TREASURY_WALLET = new PublicKey(process.env.TREASURY_WALLET); // 4Zk9uyZc6KKm1CeVFZmbZod9CjEJR3RtGNuZEGPcmFpX
const DAILY_REWARD = 100;
const TOKEN_DECIMALS = 9;

// ======== DB SETUP (using YOUR URI) ======== //
let db;
async function connectDB() {
  try {
    const client = new MongoClient(process.env.MONGODB_URI, {
      connectTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000
    });
    await client.connect();
    db = client.db('game');
    console.log("✅ MongoDB connected to collection 'game'");
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

// ======== CORE FUNCTIONS ======== //
async function sendPayout(winnerWallet) {
  try {
    const fromTokenAccount = await getAssociatedTokenAddress(TOKEN_MINT, treasuryKeypair.publicKey);
    const toTokenAccount = await getAssociatedTokenAddress(TOKEN_MINT, winnerWallet);

    const tx = new Transaction().add(
      createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        treasuryKeypair.publicKey,
        DAILY_REWARD * (10 ** TOKEN_DECIMALS),
        [],
        splToken.TOKEN_PROGRAM_ID
      )
    );

    const txid = await connection.sendTransaction(tx, [treasuryKeypair]);
    console.log(`✅ Sent ${DAILY_REWARD} SAINTS to ${winnerWallet.toString()}`);
    console.log(`TX: https://solscan.io/tx/${txid}`);
    return txid;
  } catch (err) {
    console.error("❌ Payout failed:", err.message);
    throw err;
  }
}

// ======== ROUTES ======== //
// Health check
app.get('/', (req, res) => res.json({ status: "TSWS API Online" }));

// Test MongoDB
app.get('/test-db', async (req, res) => {
  try {
    const collections = await db.listCollections().toArray();
    res.json({ 
      status: "Operational",
      collections: collections.map(c => c.name) 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Leaderboard submission
app.post('/submit-score', async (req, res) => {
  try {
    const { wallet, score } = req.body;
    await db.collection('scores').updateOne(
      { wallet },
      { $set: { score, lastUpdated: new Date() }},
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Daily payout (8PM CT / 1AM UTC)
cron.schedule('0 1 * * *', async () => {
  try {
    const winner = await db.collection('scores')
      .find()
      .sort({ score: -1 })
      .limit(1)
      .next();
    
    if (winner) {
      await sendPayout(new PublicKey(winner.wallet));
      await db.collection('scores').deleteMany({});
    }
  } catch (err) {
    console.error("❌ Cron job failed:", err);
  }
});

// ======== START SERVER ======== //
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await connectDB();
  console.log(`
  🚀 Server running on port ${PORT}
  📊 MongoDB: ${process.env.MONGODB_URI?.split('@')[1]?.split('/')[0] || 'Not configured'}
  💰 Treasury: ${TREASURY_WALLET.toString()}
  ⏰ Next payout: 8PM CT daily
  `);
});
