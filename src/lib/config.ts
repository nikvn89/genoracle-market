export const CONTRACT_ADDRESS =
  (import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}` | undefined) ??
  '0xbA515C7c4DA2A0Ce54Dc37ae71587D8cC1981571'

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
