import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const client = createClient({ chain: studionet });
const CONTRACT_ADDRESS = "0x6b391115D9D05EEb634363A36f0EDaE6D1bB6dD9";

// Admin account
const admin = createAccount('0x72bf6e67319555b11f47754b6eba01ce6d67fa377ce6c62437bb8677d346fd28');

async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function waitTx(txHash) {
    for (let i=0; i<10; i++) {
        await sleep(2000);
        try {
            const receipt = await client.getTransactionReceipt({ hash: txHash });
            if (receipt && receipt.status === 'success') {
                await sleep(5000);
                return receipt;
            }
        } catch(e) {}
    }
    throw new Error(`Timeout waiting for tx: ${txHash}`);
}

async function runSeed() {
    console.log("Seeding professional markets to contract:", CONTRACT_ADDRESS);

    const markets = [
        {
            id: "world_cup_2022",
            question: "Did Argentina win the 2022 FIFA World Cup?",
            domain: "wikipedia.org",
            deadline: "2022-12-31" // Past
        },
        {
            id: "trump_survive_2024",
            question: "Did Donald Trump survive an assassination attempt in July 2024?",
            domain: "foxnews.com",
            deadline: "2024-07-31" // Past
        },
        {
            id: "btc_100k_2026",
            question: "Will Bitcoin price exceed $100,000 before Dec 31, 2026?",
            domain: "coinmarketcap.com",
            deadline: "2026-12-31" // Future
        }
    ];

    for (let m of markets) {
        console.log(`Creating market: ${m.id}...`);
        try {
            let tx = await client.writeContract({ 
                account: admin, 
                address: CONTRACT_ADDRESS, 
                functionName: 'create_market', 
                args: [m.id, m.question, m.domain, m.deadline] 
            });
            await waitTx(tx);
            console.log(`✅ Seeded: ${m.question}`);
        } catch(e) {
            console.log(`❌ Failed: ${m.question}`, e.message);
        }
    }
    console.log("Done!");
}

runSeed();
