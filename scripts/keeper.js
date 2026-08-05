import { createClient, createAccount } from 'genlayer-js';

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '0x3C9B69F85E2CD0c980343aA02CA5754eD57c3F51';
const RPC_URL = process.env.RPC_URL || 'https://studio.genlayer.com/api';
// Use Wallet A as the Keeper Bot operator
const PRIVATE_KEY = process.env.PRIVATE_KEY || '0x72bf6e67319555b11f47754b6eba01ce6d67fa377ce6c62437bb8677d346fd28'; 

const client = createClient({ endpoint: RPC_URL });
const account = createAccount(PRIVATE_KEY);

async function runKeeper() {
    console.log(`🤖 Starting GenOracle Keeper Bot at ${new Date().toISOString()}`);
    console.log(`🔗 Target Contract: ${CONTRACT_ADDRESS}`);
    console.log(`💼 Keeper Address: ${account.address}`);
    
    try {
        console.log("Fetching all markets...");
        const res = await client.readContract({
            address: CONTRACT_ADDRESS,
            functionName: 'get_all_markets',
            args: []
        });

        const data = typeof res === 'string' ? JSON.parse(res) : (res.result ? JSON.parse(res.result) : {});
        if (!data || Object.keys(data).length === 0) {
            console.log("No markets found.");
            return;
        }

        const now = new Date();
        
        for (const [id, market] of Object.entries(data)) {
            const marketDeadline = new Date(market.deadline);
            // If the deadline is today or in the past
            if (now >= marketDeadline) {
                if (market.status === 'OPEN') {
                    console.log(`🔒 Market ${id} deadline passed (${market.deadline}). Closing betting...`);
                    try {
                        await client.writeContract({
                            account,
                            address: CONTRACT_ADDRESS,
                            functionName: 'close_betting',
                            args: [id]
                        });
                        console.log(`✅ Closed betting for market ${id}.`);
                    } catch (e) {
                        console.error(`❌ Failed to close betting for market ${id}:`, e.message);
                    }
                } 
                else if (market.status === 'CLOSED_FOR_BETTING') {
                    console.log(`🤖 Market ${id} is ready for resolution. Summoning AI Tribunal...`);
                    try {
                        await client.writeContract({
                            account,
                            address: CONTRACT_ADDRESS,
                            functionName: 'resolve_market',
                            args: [id]
                        });
                        console.log(`✅ Tribunal summoned for market ${id}. Resolution in progress.`);
                    } catch (e) {
                        console.error(`❌ Failed to resolve market ${id}:`, e.message);
                    }
                }
            } else {
                console.log(`⏳ Market ${id} is still active until ${market.deadline}.`);
            }
        }
        
        console.log("🤖 Keeper run completed successfully.");
    } catch (e) {
        console.error("❌ Fatal Keeper Error:", e);
    }
}

runKeeper();
