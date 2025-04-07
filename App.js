// Initialize connector
const connector = new TonConnect.TonConnect({
  manifestUrl: 'https://your-github-username.github.io/your-repo-name/tonconnect-manifest.json'
});

// Connect Wallet Function
async function connectTON() {
  const wallets = await connector.getWallets();
  const walletConnectionSource = {
    jsBridgeKey: 'tonconnect'
  };
  
  await connector.connect(wallets[0], walletConnectionSource);
  
  connector.onStatusChange((wallet) => {
    if (wallet) {
      document.getElementById('ton-status').textContent = 
        `Connected: ${wallet.account.address.slice(0, 6)}...${wallet.account.address.slice(-4)}`;
    }
  });
}

// Disconnect Function
function disconnectTON() {
  connector.disconnect();
}
