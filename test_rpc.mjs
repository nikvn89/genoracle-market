import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const client = createClient({ chain: studionet });

async function test() {
  try {
    const res = await client.readContract({
      address: '0xAF6d04CbcF8E25046ac6118f5Ea9148D9E4D1Ed5',
      functionName: 'get_market',
      args: ['1']
    });
    console.log("Success:", res);
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
