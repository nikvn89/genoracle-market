export const CONTRACT_ADDRESS =
  (import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}` | undefined) ??
  '0xfB95876f2537df9ecD95D41cCc29bD1465691D4E'

// Same-origin app RPC. Vercel/Vite forwards this to Studionet.
export const STUDIO_RPC =
  (import.meta.env.VITE_STUDIO_RPC as string | undefined) ??
  '/api/rpc'

// MetaMask requires an absolute RPC URL when adding a custom network.
export const STUDIO_WALLET_RPC =
  (import.meta.env.VITE_STUDIO_WALLET_RPC as string | undefined) ??
  'https://studio.genlayer.com/api'

export const EXPLORER_BASE =
  'https://explorer-studio.genlayer.com'
