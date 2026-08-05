import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const client = createClient({ chain: studionet });

async function test() {
  const address = '0x306d65DE960BBe584fC79D0745091CeDcD2Fe190';
  
  try {
    const res = await client.readContract({
      address: address,
      functionName: 'get_time',
      args: []
    });
    console.log("Result:", res);
  } catch (e) {
    console.log("Error:", e);
  }
}

test();
