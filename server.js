const solanaWeb3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const cron = require('node-cron');

// CONFIG (Replace with your actual values)
const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const TOKEN_MINT = "h5eXaXRXyh8nzmPKxuRhySQkQxtSXECZmzBSKXfpump";
const TREASURY_WALLET = "A9pn3nqqoPEvw316py3WW7oPrub9iPYfCQQ24ub9xKY8";
const DAILY_REWARD = 100; // SAINTS tokens
const TOKEN_DECIMALS = 9;

// Initialize connection
const connection = new solanaWeb3.Connection(SOLANA_RPC);

// Load treasury keypair (from .env)
const treasuryKeypair = solanaWeb3.Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(process.env.TREASURY_PRIVATE_KEY))
);

// Daily Payout Job (8PM CT / 1AM UTC)
cron.schedule('0 1 * * *', async () => {
  try {
    // 1. Get top player
    const winner = leaderboard[0];
    if (!winner) throw new Error("No players to reward");

    // 2. Prepare transfer
    const mint = new solanaWeb3.PublicKey(TOKEN_MINT);
    const winnerPubkey = new solanaWeb3.PublicKey(winner.wallet);
    
    const fromTokenAccount = await splToken.getAssociatedTokenAddress(
      mint,
      treasuryKeypair.publicKey
    );
    
    const toTokenAccount = await splToken.getAssociatedTokenAddress(
      mint,
      winnerPubkey
    );

    // 3. Create and send transaction
    const tx = new solanaWeb3.Transaction().add(
      splToken.createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        treasuryKeypair.publicKey,
        DAILY_REWARD * (10 ** TOKEN_DECIMALS),
        [],
        splToken.TOKEN_PROGRAM_ID
      )
    );

    const txid = await solanaWeb3.sendAndConfirmTransaction(
      connection,
      tx,
      [treasuryKeypair]
    );

    console.log(`✅ Sent ${DAILY_REWARD} SAINTS to ${winner.wallet}`);
    console.log(`TX: https://solscan.io/tx/${txid}`);

    // 4. Reset leaderboard
    leaderboard = [];

  } catch (err) {
    console.error("❌ Payout failed:", err.message);
  }
});
const express = require('express');
const storage = require('@glitchdotcom/storage'); // Add to package.json first
const app = express();

// Initialize leaderboard
let leaderboard = [];

// Load saved data on startup
async function initializeStorage() {
  try {
    leaderboard = await storage.get('leaderboard') || [];
    console.log(`Loaded ${leaderboard.length} player scores`);
  } catch (err) {
    console.error("Storage load error:", err);
  }
}

// Call initialize on startup
initializeStorage();

// Auto-save every 30 seconds
setInterval(async () => {
  try {
    await storage.set('leaderboard', leaderboard);
    console.log(`Saved ${leaderboard.length} scores`);
  } catch (err) {
    console.error("Storage save error:", err);
  }
}, 30000);

// Score submission endpoint
app.post('/api/submit-score', (req, res) => {
  const { wallet, score } = req.body;
  
  const existing = leaderboard.find(p => p.wallet === wallet);
  if (existing) {
    existing.score = score;
    existing.lastUpdated = new Date();
  } else {
    leaderboard.push({ 
      wallet, 
      score, 
      lastUpdated: new Date() 
    });
  }

  leaderboard.sort((a, b) => b.score - a.score);
  res.json({ success: true });
});

// Leaderboard endpoint
app.get('/api/leaderboard', (req, res) => {
  res.json(leaderboard.slice(0, 100)); // Top 100
});

app.listen(3000, () => console.log("Server running"));
const { Connection, PublicKey, Transaction, Keypair } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountInstruction } = require('@solana/spl-token');
const bs58 = require('bs58');
require('dotenv').config();


// Initialize treasury PublicKey
const treasury = new PublicKey(TREASURY_WALLET);
// ======== PHANTOM WALLET SETUP ======== //
const phantomWallet = Keypair.fromSecretKey(
  bs58.decode(process.env.PHANTOM_PRIVATE_KEY) // Load from .env
);

// ======== SERVER SETUP ======== //
app.use(express.static('public'));
app.use(express.json());

// In-memory leaderboard (replace with DB in production)

// ======== TOKEN DISTRIBUTION ======== //
async function sendTokensToWinner(winnerAddress) {
  const connection = new Connection(SOLANA_RPC);
  const mint = new PublicKey(TOKEN_MINT);

  // Get token accounts
  const treasuryTokenAccount = await splToken.getAssociatedTokenAddress(mint, treasury);
  const winnerTokenAccount = await getAssociatedTokenAddress(mint, winnerAddress);

  // Check if winner has token account
  const transaction = new Transaction();
  const winnerAccountInfo = await connection.getAccountInfo(winnerTokenAccount);

  if (!winnerAccountInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        phantomWallet.publicKey,
        winnerTokenAccount,
        winnerAddress,
        mint
      )
    );
  }

  // Add transfer instruction
  transaction.add(
    createTransferInstruction(
      treasuryTokenAccount,
      winnerTokenAccount,
      phantomWallet.publicKey,
      DAILY_REWARD * (10 ** TOKEN_DECIMALS),
      [],
      splToken.TOKEN_PROGRAM_ID
    )
  );

  // Sign and send
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = phantomWallet.publicKey;
  transaction.sign(phantomWallet);

  const txid = await connection.sendRawTransaction(transaction.serialize());
  await connection.confirmTransaction(txid);
  return txid;
}

// ======== API ENDPOINTS ======== //
app.get('/api/check-balance', async (req, res) => {
  try {
    const treasuryWallet = new PublicKey(process.env.TREASURY_WALLET);
    const connection = new Connection(process.env.SOLANA_RPC);
    const saintsMint = new PublicKey(process.env.TOKEN_MINT);

    // Get balances
    const [solBalance, tokenAccount, tokenBalance] = await Promise.all([
      connection.getBalance(treasuryWallet),
      splToken.getAssociatedTokenAddress(saintsMint, treasuryWallet),
      connection.getTokenAccountBalance(
        await splToken.getAssociatedTokenAddress(saintsMint, treasuryWallet)
      )
    ]);

    res.json({
      success: true,
      solBalance: solBalance / 1e9, // Convert to SOL
      saintsBalance: tokenBalance.value.uiAmount,
      tokenAccount: tokenAccount.toString()
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});
app.post('/submit-score', (req, res) => {
  const { wallet, score } = req.body;
  
  // Update leaderboard
  const existing = leaderboard.find(p => p.wallet === wallet);
  if (existing) {
    existing.score = score;
  } else {
    leaderboard.push({ wallet, score });
    app.get('/test-db', async (req, res) => {
  try {
    const client = await MongoClient.connect(process.env.MONGODB_URI);
    const collections = await client.db('game').listCollections().toArray();
    res.json({ status: "Connected!", collections });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
  
  
  // Sort and keep top 5
  leaderboard.sort((a, b) => b.score - a.score);
  leaderboard = leaderboard.slice(0, 5);
  
  res.json({ success: true, leaderboard });
});

// Manual payout trigger (for testing)
app.get('/trigger-payout', async (req, res) => {
  try {
    if (leaderboard.length === 0) {
      return res.status(400).json({ error: "No players to reward" });
    }
    
    const winner = leaderboard[0];
    const txid = await sendTokensToWinner(new PublicKey(winner.wallet));
    
    leaderboard = []; // Reset leaderboard
    res.json({ success: true, txid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======== CRON JOB ======== //
// Runs daily at 8PM CT (1AM UTC)
cron.schedule('0 1 * * *', async () => {
  console.log("Running daily payout...");
  if (leaderboard.length > 0) {
    const winner = leaderboard[0];
    try {
      const txid = await sendTokensToWinner(new PublicKey(winner.wallet));
      console.log(`Sent ${DAILY_REWARD} tokens to ${winner.wallet}. TX: ${txid}`);
      leaderboard = [];
    } catch (err) {
      console.error("Payout failed:", err);
    }
  }
});

// ======== START SERVER ======== //
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
  🚀 Server running on port ${PORT}
  💰 Treasury Wallet: ${phantomWallet.publicKey}
  ⏰ Payouts scheduled for 8PM CT daily
  `);