import { createClient } from 'genlayer-js'
import { studionet } from 'genlayer-js/chains'
import { TransactionStatus } from 'genlayer-js/types'
import { getAddress } from 'viem'
import { CONTRACT_ADDRESS, STUDIO_RPC } from './config'

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

export async function connectWallet(): Promise<string> {
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

  return normalizeAddress(accounts[0])
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
    write(account, 'claim_winnings', [
      marketId,
      normalizeAddress(account),
    ]),

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
