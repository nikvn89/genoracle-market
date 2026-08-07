import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const client = createClient({ chain: studionet });
const CONTRACT_ADDRESS = "0x65581AA3AB5d064571F8EF48D74451Be1cFF9a68"; // V28

// Two separate accounts for real 2-sided pools
const walletA = createAccount('0x72bf6e67319555b11f47754b6eba01ce6d67fa377ce6c62437bb8677d346fd28');
const walletB = createAccount('0x8888888888888888888888888888888888888888888888888888888888888888');

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForTx(desc) {
  console.log(`  ⏳ Waiting for consensus: ${desc}...`);
  await wait(8000);
}

async function faucetAndWait(account, name) {
  console.log(`\n💧 Faucet for ${name} (${account.address.substring(0,10)}...)...`);
  try {
    await client.writeContract({
      account,
      address: CONTRACT_ADDRESS,
      functionName: 'faucet',
      args: [account.address]
    });
    await waitForTx(`faucet ${name}`);
    console.log(`  ✅ ${name} funded with 1000 G-USD`);
  } catch(e) {
    const msg = e.message || '';
    if (msg.includes('already claimed')) {
      console.log(`  ℹ️  ${name} already claimed faucet, continuing...`);
    } else {
      throw e;
    }
  }
}

async function createMarket(account, marketId, question, domain, deadline) {
  console.log(`\n📋 Creating market: "${question.substring(0,50)}..."`);
  await client.writeContract({
    account,
    address: CONTRACT_ADDRESS,
    functionName: 'create_market',
    args: [marketId, question, domain, deadline]
  });
  await waitForTx('create market');
  console.log(`  ✅ Market created: ${marketId}`);
}

async function placeBet(account, name, marketId, isYes, amount) {
  const side = isYes ? 'YES' : 'NO';
  console.log(`  💰 ${name} bets ${amount} G-USD on ${side}...`);
  await client.writeContract({
    account,
    address: CONTRACT_ADDRESS,
    functionName: 'place_bet',
    args: [marketId, account.address.toLowerCase(), isYes, amount]
  });
  await waitForTx(`bet ${name} ${side}`);
  console.log(`  ✅ Bet placed`);
}

async function closeBetting(account, marketId) {
  console.log(`  🔒 Closing betting for market ${marketId}...`);
  await client.writeContract({
    account,
    address: CONTRACT_ADDRESS,
    functionName: 'close_betting',
    args: [marketId]
  });
  await waitForTx('close betting');
  console.log(`  ✅ Betting closed`);
}

async function main() {
  console.log('🚀 GenOracle V3 — Seeding Demo Markets');
  console.log(`📍 Contract: ${CONTRACT_ADDRESS}`);
  console.log('='.repeat(60));

  // Step 1: Fund both wallets
  await faucetAndWait(walletA, 'Wallet A');
  await faucetAndWait(walletB, 'Wallet B');

  // ─────────────────────────────────────────────────────────────
  // DEMO MARKET 1: Argentina World Cup 2022 (Past — RESOLVABLE)
  // ─────────────────────────────────────────────────────────────
  const market1Id = "demo_argentina_2022";
  await createMarket(
    walletA,
    market1Id,
    "Did Argentina win the 2022 FIFA World Cup?",
    "wikipedia.org",
    "2022-12-31"  // past deadline — AI can resolve immediately
  );
  // Both wallets bet: Wallet A = YES (200), Wallet B = NO (300)
  await placeBet(walletA, 'Wallet A', market1Id, true, 200);
  await placeBet(walletB, 'Wallet B', market1Id, false, 300);
  // Close betting so it's ready for AI resolution
  await closeBetting(walletA, market1Id);

  console.log(`\n🎯 Demo Market 1 ready! Total Pool: 500 G-USD (YES: 200 / NO: 300)`);

  // ─────────────────────────────────────────────────────────────
  // DEMO MARKET 2: Trump Assassination Attempt July 2024 (Past)
  // ─────────────────────────────────────────────────────────────
  const market2Id = "demo_trump_2024";
  await createMarket(
    walletA,
    market2Id,
    "Did Donald Trump survive an assassination attempt in July 2024?",
    "apnews.com",
    "2024-07-31"  // past deadline — AI can resolve immediately
  );
  // Both wallets bet: Wallet A = YES (150), Wallet B = NO (250)
  await placeBet(walletA, 'Wallet A', market2Id, true, 150);
  await placeBet(walletB, 'Wallet B', market2Id, false, 250);
  // Close betting so it's ready for AI resolution
  await closeBetting(walletA, market2Id);

  console.log(`\n🎯 Demo Market 2 ready! Total Pool: 400 G-USD (YES: 150 / NO: 250)`);

  console.log('\n' + '='.repeat(60));
  console.log('✅ All demo markets seeded successfully!');
  console.log('');
  console.log('📝 For judges: Both markets are CLOSED_FOR_BETTING.');
  console.log('   → Go to "AI TRIBUNAL RESOLUTION" tab');
  console.log('   → Click "Summon Autonomous Tribunal" on either market');
  console.log('   → AI will read the web and resolve YES/NO automatically');
  console.log('   → Then claim payout with Wallet A (YES position)');
}

main().catch(console.error);
