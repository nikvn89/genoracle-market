import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import fs from 'fs';

const client = createClient({ chain: studionet });
const account = createAccount(); 

async function deploy() {
  const code = fs.readFileSync('./contracts/market.py', 'utf-8');
  try {
    const hash = await client.deployContract({
      account,
      code,
      args: [] 
    });
    console.log("Tx Hash:", hash);
    // Wait for receipt
    await new Promise(r => setTimeout(r, 5000));
    try {
      const receipt = await client.getTransactionReceipt({hash});
      console.log("Receipt:", receipt);
    } catch(e) {
      console.log("Get receipt failed:", e);
    }
  } catch (e) {
    console.error("Deploy Error:", e);
  }
}
deploy();
