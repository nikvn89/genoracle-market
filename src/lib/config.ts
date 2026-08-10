export const CONTRACT_ADDRESS =
  (import.meta.env.VITE_CONTRACT_ADDRESS as `0x${string}` | undefined) ??
  '0x3a72Af40212f9075F13495Aa27cD58C6F4127337'

export const STUDIO_RPC =
  (import.meta.env.VITE_STUDIO_RPC as string | undefined) ??
  'https://studio.genlayer.com/api'
