import { createClient, createAccount } from 'genlayer-js';
import fs from 'fs';

const studionet = {
    id: 43114,
    name: 'Studio',
    nativeCurrency: { name: 'GL', symbol: 'GL', decimals: 18 },
    rpcUrls: { default: { http: ['http://localhost:8545'] } },
};

const client = createClient({ chain: studionet });
const account = createAccount('0x72bf6e67319555b11f47754b6eba01ce6d67fa377ce6c62437bb8677d346fd28');

async function deploy() {
  const code = fs.readFileSync('contracts/test_time.py', 'utf8');
  try {
    const tx = await client.deployContract({
      account,
      code,
      args: []
    });
    console.log("Tx Hash:", tx);
    
    // Wait for receipt
    await new Promise(resolve => setTimeout(resolve, 5000));
    const receipt = await client.getRunReceipt({ hash: tx });
    console.log("Receipt to address:", receipt.to);
    
    const res = await client.readContract({
      address: receipt.to,
      functionName: 'get_time',
      args: []
    });
    console.log("Result:", res);
  } catch(e) {
    console.error(e);
  }
}

deploy();
