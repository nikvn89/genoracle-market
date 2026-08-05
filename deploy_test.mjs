import { createClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'fs';

const privateKey = '0x0000000000000000000000000000000000000000000000000000000000000001';
const account = privateKeyToAccount(privateKey);

const client = createClient({
  account,
  transport: http('https://studio.genlayer.com/api/rpc'),
});

async function main() {
  const code = fs.readFileSync('contracts/test_search.py', 'utf8');
  
  const txHash = await client.request({
    method: 'gen_sendTransaction',
    params: [{
      from: account.address,
      data: code,
      value: 0,
      args: []
    }]
  });
  
  console.log('Tx Hash:', txHash);
  
  let receipt = null;
  while (!receipt) {
    await new Promise(r => setTimeout(r, 2000));
    receipt = await client.request({
      method: 'gen_getTransactionReceipt',
      params: [txHash]
    });
  }
  
  console.log('Contract Address:', receipt.contractAddress);
}

main().catch(console.error);
