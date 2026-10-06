// Contract V8. Set VITE_CONTRACT_ADDRESS in Vercel to the V8 deployment; the
// fallback below is updated to the V8 address in the same release.
export const CONTRACT_ADDRESS =
  (import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}` | undefined) ??
  '0xf076703b8EE0b4b9feba427335Bf2D7331A0E192'

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
