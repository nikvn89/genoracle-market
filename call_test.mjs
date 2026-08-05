import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const client = createClient({ chain: studionet });

async function test() {
  const address = '0x8c3AdF53782552d769D9149C3DF094544431a994';
  
  console.log("Testing DDG...");
  try {
    const res1 = await client.readContract({
      address,
      functionName: 'test_ddg',
      args: ['bitcoin']
    });
    console.log("DDG Result:", res1);
  } catch(e) {
    console.error("DDG Error:", e.message);
  }

  console.log("\nTesting Bing...");
  try {
    const res2 = await client.readContract({
      address,
      functionName: 'test_bing',
      args: ['bitcoin']
    });
    console.log("Bing Result:", res2);
  } catch(e) {
    console.error("Bing Error:", e.message);
  }
}
test();
