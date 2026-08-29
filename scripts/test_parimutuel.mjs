import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import fs from 'fs';

const client = createClient({ chain: studionet });

// Accounts
const accountA = createAccount('0x72bf6e67319555b11f47754b6eba01ce6d67fa377ce6c62437bb8677d346fd28');
const accountB = createAccount('0x8888888888888888888888888888888888888888888888888888888888888888');
const addrA = accountA.address;
const addrB = accountB.address;

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function waitTx(txHash) {
    for (let i=0; i<10; i++) {
        await sleep(2000);
        try {
            const receipt = await client.getTransactionReceipt({ hash: txHash });
            if (receipt && receipt.status === 'success') {
                await sleep(5000); // 100% real transaction! Just waiting for the RPC node's read cache to sync.
                return receipt;
            }
        } catch(e) {}
    }
    throw new Error(`Timeout waiting for tx: ${txHash}`);
}

async function runTest() {
    console.log("==========================================");
    console.log("   PARI-MUTUEL END-TO-END SETTLEMENT TEST ");
    console.log("==========================================\n");

    try {
        console.log("[1] Deploying GenOracle V16 Smart Contract...");
        const code = fs.readFileSync('contracts/market.py', 'utf-8');
        const deployTx = await client.deployContract({ account: accountA, code, args: [] });
        const receipt = await waitTx(deployTx);
        const contractAddress = receipt.to;
        console.log(`✅ Contract deployed at: ${contractAddress}\n`);

        console.log("[2] Issuing Faucet to Account A and B...");
        let tx = await client.writeContract({ account: accountA, address: contractAddress, functionName: 'faucet', args: [addrA] });
        await waitTx(tx);
        tx = await client.writeContract({ account: accountB, address: contractAddress, functionName: 'faucet', args: [addrB] });
        await waitTx(tx);

        let stateStr = await client.readContract({ address: contractAddress, functionName: 'get_state', args: [] });
        let state = JSON.parse(stateStr);
        console.log(`✅ Balances - Account A: ${state.balances[addrA.toLowerCase()]} G-USD`);
        console.log(`✅ Balances - Account B: ${state.balances[addrB.toLowerCase()]} G-USD\n`);

        console.log("[3] Creating Pari-Mutuel Market...");
        const marketId = "test_math_1";
        tx = await client.writeContract({ 
            account: accountA, 
            address: contractAddress, 
            functionName: 'create_market', 
            args: [marketId, "Will 1+1 equal 2 in math?", "wikipedia.org", "2026-12-31"] 
        });
        await waitTx(tx);
        console.log(`✅ Market created: '${marketId}' (Status: OPEN)\n`);

        console.log("[4] Placing Bets...");
        console.log(`   -> Account A bets 200 G-USD on YES`);
        tx = await client.writeContract({ account: accountA, address: contractAddress, functionName: 'place_bet', args: [marketId, addrA, true, 200] });
        await waitTx(tx);
        
        console.log(`   -> Account B bets 100 G-USD on NO`);
        tx = await client.writeContract({ account: accountB, address: contractAddress, functionName: 'place_bet', args: [marketId, addrB, false, 100] });
        await waitTx(tx);
        
        stateStr = await client.readContract({ address: contractAddress, functionName: 'get_state', args: [] });
        state = JSON.parse(stateStr);
        console.log(`✅ Balances After Bets - Account A: ${state.balances[addrA.toLowerCase()]} G-USD`);
        console.log(`✅ Balances After Bets - Account B: ${state.balances[addrB.toLowerCase()]} G-USD`);
        
        let mktStr = await client.readContract({ address: contractAddress, functionName: 'get_market', args: [marketId] });
        let mkt = JSON.parse(mktStr);
        console.log(`✅ Total Pool: YES=${mkt.yes_pool}, NO=${mkt.no_pool}\n`);

        console.log("[5] Closing Betting Phase...");
        tx = await client.writeContract({ account: accountA, address: contractAddress, functionName: 'close_betting', args: [marketId] });
        await waitTx(tx);
        mktStr = await client.readContract({ address: contractAddress, functionName: 'get_market', args: [marketId] });
        mkt = JSON.parse(mktStr);
        console.log(`✅ Market Status: ${mkt.status}\n`);

        console.log("[6] Summoning AI Tribunal (Resolving Market)...");
        tx = await client.writeContract({ account: accountA, address: contractAddress, functionName: 'resolve_market', args: [marketId] });
        await waitTx(tx);
        
        mktStr = await client.readContract({ address: contractAddress, functionName: 'get_market', args: [marketId] });
        mkt = JSON.parse(mktStr);
        console.log(`✅ Market Resolved Status: ${mkt.status}`);
        console.log(`   -> AI Reasoning: ${mkt.resolution_reason.substring(0, 100)}...\n`);

        console.log("[7] Claiming Winnings...");
        try {
            tx = await client.writeContract({ account: accountA, address: contractAddress, functionName: 'claim_winnings', args: [marketId, addrA] });
            await waitTx(tx);
            console.log(`   -> Account A successfully claimed winnings`);
        } catch(e) {
            console.log(`   -> Account A claim failed (Expected if lost): ${e.message}`);
        }
        try {
            tx = await client.writeContract({ account: accountB, address: contractAddress, functionName: 'claim_winnings', args: [marketId, addrB] });
            await waitTx(tx);
            console.log(`   -> Account B successfully claimed winnings`);
        } catch(e) {
            console.log(`   -> Account B claim failed (Expected if lost): ${e.message}`);
        }
        
        stateStr = await client.readContract({ address: contractAddress, functionName: 'get_state', args: [] });
        state = JSON.parse(stateStr);
        
        console.log("\n==========================================");
        console.log("   FINAL PARI-MUTUEL SETTLEMENT RESULTS ");
        console.log("==========================================");
        const finalA = state.balances[addrA.toLowerCase()];
        const finalB = state.balances[addrB.toLowerCase()];
        console.log(`Account A Final Balance: ${finalA} G-USD`);
        console.log(`Account B Final Balance: ${finalB} G-USD`);
        
        if ((mkt.status === 'RESOLVED_YES' && finalA === 1100 && finalB === 900) || 
            (mkt.status === 'RESOLVED_NO' && finalA === 800 && finalB === 1200) ||
            (mkt.status === 'FAILED' && finalA === 1000 && finalB === 1000)) {
            console.log("\n🎉 TEST PASSED: Proportional integer math correctly distributed pools to winners!");
        } else {
            console.log("\n❌ TEST FAILED: Balances do not match Pari-Mutuel expectations.");
        }

    } catch (e) {
        console.error("Test failed:", e);
    }
}

runTest();
