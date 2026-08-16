import { createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import { TransactionStatus } from 'genlayer-js/types'
import { getAddress } from 'viem'
import {
  CONTRACT_ADDRESS,
  EXPLORER_BASE,
  STUDIO_RPC,
  STUDIO_WALLET_RPC,
} from './config'

const chain = {
  ...studionet,
  rpcUrls: {
    default: {
      http: [STUDIO_RPC],
    },
  },
}

const RECEIPT_POLL_INTERVAL_MS = 15_000
const RECEIPT_MAX_RETRIES = 40
const STUDIONET_CHAIN_HEX = `0x${studionet.id.toString(16)}`

export type WalletConnection = {
  account: string
  chainId: number
  isStudionet: boolean
  nativeBalanceWei: bigint
}

export type WalletEventHandlers = {
  onChainChanged?: (chainId: number) => void
  onAccountsChanged?: (accounts: string[]) => void
}

export const normalizeAddress = (address: string) => getAddress(address)

export const getClient = (account?: string) => {
  const provider =
    typeof window !== 'undefined' ? window.ethereum : undefined

  const checksummed = account ? normalizeAddress(account) : undefined

  return createClient({
    chain,
    account: checksummed as any,
    provider: provider as any,
  })
}

function walletErrorCode(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === 'number' ? code : Number(code)
  }
  return undefined
}

function chainIdFromHex(value: unknown): number {
  if (typeof value !== 'string') return 0
  return Number.parseInt(value, 16)
}

async function switchToStudionet() {
  if (!window.ethereum) {
    throw new Error(
      'No browser wallet detected. Install MetaMask or a compatible wallet.',
    )
  }

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: STUDIONET_CHAIN_HEX }],
    })
    return
  } catch (error) {
    const code = walletErrorCode(error)

    if (code === 4001) {
      throw new Error(
        'Network switch was rejected. Switch MetaMask to GenLayer Studio Network to continue.',
      )
    }

    if (code !== 4902) {
      throw new Error(
        `Could not switch MetaMask to GenLayer Studio Network${
          error instanceof Error && error.message ? `: ${error.message}` : '.'
        }`,
      )
    }
  }

  try {
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: STUDIONET_CHAIN_HEX,
          chainName: studionet.name || 'GenLayer Studio Network',
          rpcUrls: [STUDIO_WALLET_RPC],
          nativeCurrency: {
            name: studionet.nativeCurrency?.name || 'GEN Token',
            symbol: studionet.nativeCurrency?.symbol || 'GEN',
            decimals: studionet.nativeCurrency?.decimals ?? 18,
          },
          blockExplorerUrls: [EXPLORER_BASE],
        },
      ],
    })
  } catch (error) {
    if (walletErrorCode(error) === 4001) {
      throw new Error(
        'Adding GenLayer Studio Network was rejected. Add the network in MetaMask to continue.',
      )
    }
    throw new Error(
      `Could not add GenLayer Studio Network to MetaMask${
        error instanceof Error && error.message ? `: ${error.message}` : '.'
      }`,
    )
  }

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: STUDIONET_CHAIN_HEX }],
    })
  } catch (error) {
    if (walletErrorCode(error) === 4001) {
      throw new Error(
        'Network switch was rejected. Switch MetaMask to GenLayer Studio Network to continue.',
      )
    }
    throw error
  }
}

export async function getWalletStatus(
  account: string,
): Promise<WalletConnection> {
  if (!window.ethereum) {
    throw new Error('No browser wallet detected.')
  }

  const chainHex = await window.ethereum.request({ method: 'eth_chainId' })
  const chainId = chainIdFromHex(chainHex)
  let nativeBalanceWei = BigInt(0)

  try {
    const rawBalance = await window.ethereum.request({
      method: 'eth_getBalance',
      params: [normalizeAddress(account), 'latest'],
    })

    if (typeof rawBalance === 'string') {
      nativeBalanceWei = BigInt(rawBalance)
    }
  } catch {
    // Balance visibility helps onboarding, but should not make wallet connection fail.
  }

  return {
    account: normalizeAddress(account),
    chainId,
    isStudionet: chainId === studionet.id,
    nativeBalanceWei,
  }
}

export async function connectWallet(): Promise<WalletConnection> {
  if (!window.ethereum) {
    throw new Error(
      'No browser wallet detected. Install MetaMask or a compatible wallet.',
    )
  }

  const accounts = (await window.ethereum.request({
    method: 'eth_requestAccounts',
  })) as string[]

  if (!accounts?.[0]) {
    throw new Error('Wallet connection was not approved.')
  }

  const currentChain = chainIdFromHex(
    await window.ethereum.request({ method: 'eth_chainId' }),
  )

  if (currentChain !== studionet.id) {
    await switchToStudionet()
  }

  const status = await getWalletStatus(accounts[0])
  if (!status.isStudionet) {
    throw new Error(
      'MetaMask is not connected to GenLayer Studio Network. Switch to chain 61999 and try again.',
    )
  }

  return status
}

export function subscribeWalletEvents({
  onChainChanged,
  onAccountsChanged,
}: WalletEventHandlers) {
  const ethereum = window.ethereum as any
  if (!ethereum?.on) return () => {}

  const handleChainChanged = (chainHex: string) => {
    onChainChanged?.(chainIdFromHex(chainHex))
  }
  const handleAccountsChanged = (accounts: string[]) => {
    onAccountsChanged?.(accounts ?? [])
  }

  ethereum.on('chainChanged', handleChainChanged)
  ethereum.on('accountsChanged', handleAccountsChanged)

  return () => {
    ethereum.removeListener?.('chainChanged', handleChainChanged)
    ethereum.removeListener?.('accountsChanged', handleAccountsChanged)
  }
}

export const STUDIONET = {
  id: studionet.id,
  name: studionet.name || 'GenLayer Studio Network',
  chainIdHex: STUDIONET_CHAIN_HEX,
  currencySymbol: studionet.nativeCurrency?.symbol || 'GEN',
}

async function write(
  account: string,
  functionName: string,
  args: Array<string | boolean | number>,
) {
  const client = getClient(account)

  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value: BigInt(0),
  })

  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    interval: RECEIPT_POLL_INTERVAL_MS,
    retries: RECEIPT_MAX_RETRIES,
  })

  return { hash, receipt }
}

async function writeAsync(
  account: string,
  functionName: string,
  args: Array<string | boolean | number>,
) {
  const client = getClient(account)

  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value: BigInt(0),
  })

  return { hash }
}

async function read(functionName: string, args: Array<string>) {
  const client = getClient()

  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    stateStatus: 'accepted',
  } as any)
}

export type Market = {
  creator?: string
  question: string
  authoritative_domain: string
  deadline: string
  status: 'OPEN' | 'CLOSED_FOR_BETTING' | 'RESOLVED_YES' | 'RESOLVED_NO' | 'FAILED'
  yes_pool: number
  no_pool: number
  yes_positions: Record<string, number>
  no_positions: Record<string, number>
  resolution_reason?: string
  resolution_source?: string
}

export type ContractState = {
  balances: Record<string, number>
  claimed_faucet: string[]
}

function parseJson<T>(value: unknown, fallback: T): T {
  try {
    if (typeof value === 'string') {
      const cleaned = value.replace(/^"|"$/g, '').replace(/\\"/g, '"')
      return JSON.parse(cleaned) as T
    }

    return value as T
  } catch {
    return fallback
  }
}

export const genOracle = {
  faucet: (account: string) =>
    write(account, 'faucet', [normalizeAddress(account)]),

  createMarket: (
    account: string,
    marketId: string,
    question: string,
    authoritativeDomain: string,
    deadline: string,
  ) =>
    write(account, 'create_market', [
      marketId.trim(),
      question.trim(),
      authoritativeDomain.trim(),
      deadline.trim(),
    ]),

  placeBet: (
    account: string,
    marketId: string,
    isYes: boolean,
    amount: number,
  ) =>
    write(account, 'place_bet', [
      marketId,
      normalizeAddress(account),
      isYes,
      amount,
    ]),

  closeBetting: (account: string, marketId: string) =>
    write(account, 'close_betting', [marketId]),

  resolveMarket: (account: string, marketId: string) =>
    writeAsync(account, 'resolve_market', [marketId]),

  claimWinnings: (account: string, marketId: string) =>
    write(account, 'claim_winnings', [marketId, normalizeAddress(account)]),

  getState: async (): Promise<ContractState> =>
    parseJson<ContractState>(
      await read('get_state', []),
      { balances: {}, claimed_faucet: [] },
    ),

  getMarket: async (marketId: string): Promise<Market | null> => {
    const result = await read('get_market', [marketId])
    const parsed = parseJson<Record<string, unknown>>(result, {})
    return Object.keys(parsed).length ? (parsed as Market) : null
  },

  getAllMarkets: async (): Promise<Record<string, Market>> =>
    parseJson<Record<string, Market>>(
      await read('get_all_markets', []),
      {},
    ),
}
