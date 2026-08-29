import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { CONTRACT_ADDRESS } from './lib/config'
import {
  connectWallet,
  ContractConfig,
  genOracle,
  getWalletStatus,
  Market,
  MarketStatus,
  STUDIONET,
  subscribeWalletEvents,
} from './lib/genlayer'

type BusyAction =
  | ''
  | 'connect'
  | 'faucet'
  | 'create'
  | 'bet'
  | 'evidence'
  | 'resolve'
  | 'expire'
  | 'claim'
  | 'refresh'

type PendingResolution = {
  evidenceCount: number
  attemptCount: number
  hash: string
}

const DEFAULT_CONFIG: ContractConfig = {
  evidence_window_seconds: 600,
  expiry_period_seconds: 30 * 24 * 60 * 60,
  max_evidence_urls: 3,
  max_evidence_per_address: 2,
}

const short = (value: string, start = 8, end = 6) =>
  value.length <= start + end + 3
    ? value
    : `${value.slice(0, start)}...${value.slice(-end)}`

const effectiveStatus = (market: Market): MarketStatus =>
  market.effective_status ?? market.status

const statusLabel = (market: Market) => {
  const status = effectiveStatus(market)

  switch (status) {
    case 'OPEN':
      return 'Open'
    case 'EVIDENCE':
      return 'Evidence'
    case 'RESOLVED_YES':
      return 'Resolved YES'
    case 'RESOLVED_NO':
      return 'Resolved NO'
    case 'FAILED':
      return 'Failed / Refund'
  }
}

const statusClass = (market: Market) =>
  effectiveStatus(market).toLowerCase()

const formatDateTime = (timestamp?: number) => {
  if (!timestamp) return '—'
  return new Date(timestamp * 1000).toLocaleString()
}

const formatDuration = (seconds: number) => {
  if (seconds <= 0) return 'now'

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

const toDateTimeLocal = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0')

  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
  ].join('')
}

const makeDefaultDeadline = () =>
  toDateTimeLocal(new Date(Date.now() + 3 * 60 * 1000))

const MAX_ACTIVE_MARKETS = 50
const MAX_ACTIVE_PER_CREATOR = 5
const HISTORY_PAGE_SIZE = 10

// Must match the V7 contract whitelist exactly.
const AUTHORITY_OPTIONS = [
  'fifa.com',
  'uefa.com',
  'nba.com',
  'nfl.com',
  'mlb.com',
  'nhl.com',
  'federalreserve.gov',
  'bls.gov',
  'bea.gov',
  'sec.gov',
  'nasa.gov',
  'ethereum.org',
]

const pendingKey = (account: string, marketId: string) =>
  `genoracle:v7:resolve:${CONTRACT_ADDRESS}:${account.toLowerCase()}:${marketId}`

const RESOLUTION_AUTO_POLL_MS = 15_000
const RESOLUTION_AUTO_POLL_MAX = 20

function EmptyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z" />
    </svg>
  )
}

// The ratio between the two pools is the number a reader actually wants; two
// bare integers make them do the division themselves.
function PoolBar({ yes, no }: { yes: number | string; no: number | string }) {
  const y = Number(yes) || 0
  const n = Number(no) || 0
  const total = y + n

  if (total <= 0) {
    return <div className="pool-bar empty" aria-hidden="true" />
  }

  const pct = Math.round((y / total) * 100)

  return (
    <div className="pool-bar" role="img" aria-label={`YES ${pct}%, NO ${100 - pct}%`}>
      <i style={{ width: `${pct}%` }} />
    </div>
  )
}

function App() {
  const [account, setAccount] = useState('')
  const [markets, setMarkets] = useState<Record<string, Market>>({})
  const [config, setConfig] = useState<ContractConfig>(DEFAULT_CONFIG)
  const [balance, setBalance] = useState(0)
  const [networkId, setNetworkId] = useState(0)
  const [isStudionet, setIsStudionet] = useState(false)
  const [nativeBalanceWei, setNativeBalanceWei] = useState(BigInt(0))
  const [busy, setBusy] = useState<BusyAction>('')
  const actionLockRef = useRef(false)
  const resolutionPollAttemptsRef = useRef<Record<string, number>>({})
  const [message, setMessage] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [nowMs, setNowMs] = useState(Date.now())

  const [marketId, setMarketId] = useState('')
  const [question, setQuestion] = useState('')
  const [domain, setDomain] = useState('')
  const [deadline, setDeadline] = useState(makeDefaultDeadline)

  const [betAmount, setBetAmount] = useState('25')
  const [evidenceUrl, setEvidenceUrl] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyVisible, setHistoryVisible] = useState(HISTORY_PAGE_SIZE)
  const [pendingResolutions, setPendingResolutions] = useState<
    Record<string, PendingResolution>
  >({})

  const selected = selectedId ? markets[selectedId] : undefined
  const nowTs = Math.floor(nowMs / 1000)

  const nativeGenBalance = useMemo(() => {
    const base = BigInt(10) ** BigInt(18)
    const whole = nativeBalanceWei / base
    const remainder = nativeBalanceWei % base
    const fraction = remainder
      .toString()
      .padStart(18, '0')
      .slice(0, 4)
      .replace(/0+$/, '')

    return fraction ? `${whole}.${fraction}` : whole.toString()
  }, [nativeBalanceWei])

  const ensureWritable = () => {
    if (!account) throw new Error('Connect wallet first.')

    if (!isStudionet) {
      throw new Error(
        `Wrong network. Switch MetaMask to ${STUDIONET.name} (chain ${STUDIONET.id}) before submitting a transaction.`,
      )
    }
  }

  const orderedMarkets = useMemo(
    () => Object.entries(markets).reverse(),
    [markets],
  )

  const activeMarkets = useMemo(
    () =>
      orderedMarkets.filter(([, market]) =>
        ['OPEN', 'EVIDENCE'].includes(effectiveStatus(market)),
      ),
    [orderedMarkets],
  )

  const historyMarkets = useMemo(
    () =>
      orderedMarkets.filter(([, market]) =>
        ['RESOLVED_YES', 'RESOLVED_NO', 'FAILED'].includes(
          effectiveStatus(market),
        ),
      ),
    [orderedMarkets],
  )

  const creatorActiveCount = useMemo(() => {
    if (!account) return 0

    const wallet = account.toLowerCase()

    return activeMarkets.filter(
      ([, market]) => (market.creator ?? '').toLowerCase() === wallet,
    ).length
  }, [account, activeMarkets])

  const createLimitReached =
    activeMarkets.length >= MAX_ACTIVE_MARKETS ||
    (!!account && creatorActiveCount >= MAX_ACTIVE_PER_CREATOR)

  const run = async (action: BusyAction, fn: () => Promise<void>) => {
    // Synchronous lock prevents a second click before React has time to re-render.
    if (actionLockRef.current) return

    actionLockRef.current = true

    try {
      setBusy(action)
      setMessage('')
      await fn()
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Unexpected error.',
      )
    } finally {
      actionLockRef.current = false
      setBusy('')
    }
  }

  const reconcileResolutionLocks = (
    all: Record<string, Market>,
    wallet: string,
  ) => {
    if (!wallet) {
      setPendingResolutions({})
      return
    }

    const restored: Record<string, PendingResolution> = {}

    for (const [marketId, market] of Object.entries(all)) {
      const key = pendingKey(wallet, marketId)
      const raw = localStorage.getItem(key)

      if (!raw) continue

      try {
        const pending = JSON.parse(raw) as PendingResolution
        const completed =
          ['RESOLVED_YES', 'RESOLVED_NO', 'FAILED'].includes(
            effectiveStatus(market),
          ) ||
          (market.resolution_attempts ?? 0) > pending.attemptCount

        if (completed) {
          localStorage.removeItem(key)
        } else {
          restored[marketId] = pending
        }
      } catch {
        localStorage.removeItem(key)
      }
    }

    setPendingResolutions(restored)
  }

  const refresh = async () => {
    const [all, state, contractConfig] = await Promise.all([
      genOracle.getAllMarkets(),
      genOracle.getState(),
      genOracle.getConfig(),
    ])

    setMarkets(all)
    setConfig(contractConfig)

    if (account) {
      setBalance(state.balances[account.toLowerCase()] ?? 0)
      reconcileResolutionLocks(all, account)
    } else {
      setPendingResolutions({})
    }

    if (selectedId && !all[selectedId]) {
      setSelectedId('')
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    if (!account) return
    void refresh()
  }, [account])

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!account) return

    const pendingIds = Object.keys(pendingResolutions)
    if (pendingIds.length === 0) return

    let cancelled = false

    const pollPending = async () => {
      for (const marketId of pendingIds) {
        if (cancelled) return

        const pending = pendingResolutions[marketId]
        if (!pending) continue

        const attempts = resolutionPollAttemptsRef.current[marketId] ?? 0

        if (attempts >= RESOLUTION_AUTO_POLL_MAX) {
          continue
        }

        resolutionPollAttemptsRef.current[marketId] = attempts + 1

        try {
          const updated = await genOracle.getMarket(marketId)
          if (!updated || cancelled) continue

          setMarkets((current) => ({
            ...current,
            [marketId]: updated,
          }))

          const settled =
            ['RESOLVED_YES', 'RESOLVED_NO', 'FAILED'].includes(
              effectiveStatus(updated),
            ) ||
            (updated.resolution_attempts ?? 0) > pending.attemptCount

          if (settled) {
            localStorage.removeItem(pendingKey(account, marketId))

            setPendingResolutions((current) => {
              const next = { ...current }
              delete next[marketId]
              return next
            })

            delete resolutionPollAttemptsRef.current[marketId]

            if (
              ['RESOLVED_YES', 'RESOLVED_NO', 'FAILED'].includes(
                effectiveStatus(updated),
              )
            ) {
              setMessage(
                `Consensus settled automatically: ${statusLabel(updated)}.`,
              )
            } else {
              setMessage(
                'Consensus attempt settled. Review the latest evidence result.',
              )
            }
          }
        } catch {
          // Silent by design: manual Refresh remains the fallback.
        }
      }
    }

    void pollPending()

    const timer = window.setInterval(
      () => void pollPending(),
      RESOLUTION_AUTO_POLL_MS,
    )

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [account, pendingResolutions])

  useEffect(() => {
    const unsubscribe = subscribeWalletEvents({
      onChainChanged: (chainId) => {
        setNetworkId(chainId)
        const onStudionet = chainId === STUDIONET.id
        setIsStudionet(onStudionet)

        if (!onStudionet) {
          setNativeBalanceWei(BigInt(0))
          setMessage(
            `MetaMask switched away from ${STUDIONET.name}. Write actions are disabled until you reconnect to chain ${STUDIONET.id}.`,
          )
          return
        }

        if (account) {
          void getWalletStatus(account).then((status) => {
            setNativeBalanceWei(status.nativeBalanceWei)
            setMessage(`Connected to ${STUDIONET.name}.`)
          })
        }
      },

      onAccountsChanged: (accounts) => {
        if (!accounts[0]) {
          setAccount('')
          setBalance(0)
          setNetworkId(0)
          setIsStudionet(false)
          setNativeBalanceWei(BigInt(0))
          setPendingResolutions({})
          setMessage('Wallet disconnected.')
          return
        }

        void getWalletStatus(accounts[0]).then((status) => {
          setAccount(status.account)
          setNetworkId(status.chainId)
          setIsStudionet(status.isStudionet)
          setNativeBalanceWei(status.nativeBalanceWei)
          setPendingResolutions({})
          setMessage(
            status.isStudionet
              ? `Account changed. Connected to ${STUDIONET.name}.`
              : `Account changed, but MetaMask is on the wrong network. Reconnect to switch to chain ${STUDIONET.id}.`,
          )
        })
      },
    })

    return unsubscribe
  }, [account])

  const handleConnect = () =>
    run('connect', async () => {
      const connected = await connectWallet()
      setAccount(connected.account)
      setNetworkId(connected.chainId)
      setIsStudionet(connected.isStudionet)
      setNativeBalanceWei(connected.nativeBalanceWei)
      setMessage(`Wallet connected to ${STUDIONET.name}.`)
    })

  const handleFaucet = () =>
    run('faucet', async () => {
      ensureWritable()
      await genOracle.faucet(account)
      await refresh()
      setMessage('Demo G-USD balance updated.')
    })

  const handleCreate = (event: FormEvent) => {
    event.preventDefault()

    return run('create', async () => {
      ensureWritable()

      if (!marketId.trim()) throw new Error('Market ID is required.')
      if (!question.trim()) throw new Error('Question is required.')
      if (!domain.trim()) throw new Error('Authoritative domain is required.')
      if (!deadline) throw new Error('Deadline is required.')

      const deadlineMs = new Date(deadline).getTime()

      if (!Number.isFinite(deadlineMs)) {
        throw new Error('Deadline is invalid.')
      }

      const deadlineTs = Math.floor(deadlineMs / 1000)

      if (deadlineTs <= Math.floor(Date.now() / 1000)) {
        throw new Error('Deadline must be in the future.')
      }

      if (activeMarkets.length >= MAX_ACTIVE_MARKETS) {
        throw new Error('Maximum 50 active markets reached.')
      }

      if (creatorActiveCount >= MAX_ACTIVE_PER_CREATOR) {
        throw new Error('This wallet already has 5 active markets.')
      }

      await genOracle.createMarket(
        account,
        marketId,
        question,
        domain,
        deadlineTs,
      )

      setSelectedId(marketId.trim())
      setMarketId('')
      setQuestion('')
      setDomain('')
      setDeadline(makeDefaultDeadline())
      await refresh()
      setMessage('Market created.')
    })
  }

  const placeBet = (isYes: boolean) =>
    run('bet', async () => {
      ensureWritable()

      if (!selectedId || !selected) {
        throw new Error('Select a market first.')
      }

      const amount = Number(betAmount)

      if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error('Bet amount must be a positive integer.')
      }

      await genOracle.placeBet(account, selectedId, isYes, amount)
      await refresh()
      setMessage(`${isYes ? 'YES' : 'NO'} bet submitted.`)
    })

  const submitEvidence = () =>
    run('evidence', async () => {
      ensureWritable()

      if (!selectedId || !selected) {
        throw new Error('Select a market first.')
      }

      const url = evidenceUrl.trim()

      if (!url) {
        throw new Error('Enter an official evidence URL.')
      }

      await genOracle.submitEvidence(account, selectedId, url)
      setEvidenceUrl('')
      await refresh()
      setMessage(
        `Official evidence submitted. GenLayer will judge it under ${selected.authoritative_domain}.`,
      )
    })

  const resolveMarket = () =>
    run('resolve', async () => {
      ensureWritable()

      if (!selectedId || !selected) {
        throw new Error('Select a market first.')
      }

      if (pendingResolutions[selectedId]) {
        throw new Error(
          'A resolution transaction is already pending for this market.',
        )
      }

      const evidenceCount = selected.evidence?.length ?? 0
      const attemptCount = selected.resolution_attempts ?? 0

      const { hash } = await genOracle.resolveMarket(account, selectedId)

      const pending: PendingResolution = {
        evidenceCount,
        attemptCount,
        hash,
      }

      setPendingResolutions((current) => ({
        ...current,
        [selectedId]: pending,
      }))

      localStorage.setItem(
        pendingKey(account, selectedId),
        JSON.stringify(pending),
      )

      setMessage(
        `AI resolution submitted (${short(hash)}). Double-submit protection is active. The app will check accepted onchain state automatically every 15 seconds.`,
      )
    })

  const expireMarket = () =>
    run('expire', async () => {
      ensureWritable()

      if (!selectedId) throw new Error('Select a market first.')

      await genOracle.expireMarket(account, selectedId)
      await refresh()
      setMessage('Market expired. Bettors can claim refunds.')
    })

  const claim = () =>
    run('claim', async () => {
      ensureWritable()

      if (!selectedId) throw new Error('Select a market first.')

      await genOracle.claimWinnings(account, selectedId)
      await refresh()
      setMessage('Claim/refund processed.')
    })

  const refreshUi = () =>
    run('refresh', async () => {
      await refresh()
      setMessage('Accepted onchain state refreshed.')
    })

  const deadlinePassed =
    !!selected && nowTs >= Number(selected.deadline_ts ?? 0)

  const selectedPhase: MarketStatus | undefined = selected
    ? effectiveStatus(selected) === 'OPEN' && deadlinePassed
      ? 'EVIDENCE'
      : effectiveStatus(selected)
    : undefined

  const canBet =
    !!selected &&
    isStudionet &&
    selectedPhase === 'OPEN' &&
    !deadlinePassed

  const evidenceCount = selected?.evidence?.length ?? 0
  const yourEvidenceCount =
    selected && account
      ? selected.evidence_counts?.[account.toLowerCase()] ?? 0
      : 0

  const canSubmitEvidence =
    !!selected &&
    isStudionet &&
    selectedPhase === 'EVIDENCE' &&
    nowTs >= selected.deadline_ts &&
    nowTs < selected.expiry_at &&
    evidenceCount < config.max_evidence_urls &&
    yourEvidenceCount < config.max_evidence_per_address

  const resolutionPending =
    !!selectedId && !!pendingResolutions[selectedId]

  const hasNewEvidenceForResolution =
    !!selected &&
    evidenceCount > (selected.last_attempt_evidence_count ?? 0)

  const canResolve =
    !!selected &&
    isStudionet &&
    selectedPhase === 'EVIDENCE' &&
    nowTs >= selected.resolve_open_at &&
    nowTs < selected.expiry_at &&
    evidenceCount > 0 &&
    hasNewEvidenceForResolution &&
    !resolutionPending

  const canExpire =
    !!selected &&
    isStudionet &&
    selectedPhase === 'EVIDENCE' &&
    nowTs >= selected.expiry_at

  const walletKey = account?.toLowerCase() ?? ''

  const yourYes =
    selected && walletKey
      ? selected.yes_positions[walletKey] ?? 0
      : 0

  const yourNo =
    selected && walletKey
      ? selected.no_positions[walletKey] ?? 0
      : 0

  const canClaim =
    !!selected &&
    !!account &&
    isStudionet &&
    (
      (selectedPhase === 'RESOLVED_YES' && yourYes > 0) ||
      (selectedPhase === 'RESOLVED_NO' && yourNo > 0) ||
      (selectedPhase === 'FAILED' && (yourYes > 0 || yourNo > 0))
    )

  const resolutionWaitSeconds = selected
    ? Math.max(0, selected.resolve_open_at - nowTs)
    : 0

  const expiryWaitSeconds = selected
    ? Math.max(0, selected.expiry_at - nowTs)
    : 0

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="GenOracle home">
          <img src="/genoracle-logo.png" alt="GenOracle" className="brand-logo" />
          <div className="brand-copy">
            <strong>GenOracle</strong>
            <span>Official-evidence prediction markets</span>
          </div>
        </a>

        <nav className="topnav" aria-label="Page sections">
          <a href="#markets">Explore</a>
          <a href="#create-market">Create</a>
        </nav>

        <div className="wallet-panel">
          <div className={`network-pill ${isStudionet ? 'ok' : 'wrong'}`}>
            {isStudionet
              ? `● ${STUDIONET.name}`
              : `⚠ Wrong network${networkId ? ` · ${networkId}` : ''}`}
          </div>

          {account ? (
            <div className="balance-pill">
              <strong>{balance} G-USD</strong>
              <span>{nativeGenBalance} {STUDIONET.currencySymbol} gas</span>
            </div>
          ) : null}

          <button
            className="button faucet"
            onClick={handleFaucet}
            disabled={busy !== '' || !account || !isStudionet}
          >
            {busy === 'faucet' ? 'Processing…' : 'Get Demo G-USD'}
          </button>

          <button
            className="button wallet"
            onClick={handleConnect}
            disabled={busy !== ''}
          >
            {account && isStudionet
              ? short(account)
              : busy === 'connect'
                ? 'Connecting…'
                : account
                  ? 'Switch to GenLayer'
                  : 'Connect Wallet'}
          </button>
        </div>
      </header>

      <main id="top" className="page">
        <section className="hero">
          <div className="hero-copy">
            <span className="kicker">AUTHORITY-BOUND PREDICTION MARKETS</span>
            <h1>
              Markets that settle from
              <em> official evidence.</em>
            </h1>
            <p>
              Lock the source before betting. After the deadline, official URLs become
              evidence and GenLayer validators independently decide the outcome.
            </p>

            <div className="hero-actions">
              <a className="hero-button primary-link" href="#markets">Explore Markets</a>
              <a className="hero-button secondary-link" href="#create-market">Create Market</a>
            </div>

            <div className="hero-chips">
              <span>Official domains</span>
              <span>Permissionless evidence</span>
              <span>AI validator consensus</span>
            </div>
          </div>

          <div className="hero-flow" aria-label="GenOracle market lifecycle">
            <div className="flow-node active">
              <span>01</span>
              <strong>Predict</strong>
              <small>YES / NO positions</small>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-node">
              <span>02</span>
              <strong>Prove</strong>
              <small>Official URLs only</small>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-node">
              <span>03</span>
              <strong>Consensus</strong>
              <small>GenLayer judges</small>
            </div>
            <div className="flow-arrow">→</div>
            <div className="flow-node">
              <span>04</span>
              <strong>Settle</strong>
              <small>Claim or refund</small>
            </div>
          </div>
        </section>

        <section className="policy-strip">
          <strong>Oracle policy</strong>
          <span>
            Every market commits an authoritative domain before betting. Evidence must
            come from that domain or its subdomains; submitters never choose YES or NO.
          </span>
          <code>{short(CONTRACT_ADDRESS)}</code>
        </section>

        {message ? <div className="notice">{message}</div> : null}

        <section id="markets" className="explore-layout">
          <aside className="markets-panel panel">
            <div className="panel-heading">
              <div>
                <span className="section-label">EXPLORE</span>
                <h2>Live markets</h2>
              </div>
              <button
                className="icon-button"
                onClick={refreshUi}
                disabled={busy !== ''}
                title="Refresh accepted state"
              >
                {busy === 'refresh' ? '…' : '↻'}
              </button>
            </div>

            <div className="market-counts">
              <span>{activeMarkets.length} active</span>
              <span>{historyMarkets.length} settled</span>
            </div>

            <div className="market-list">
              {activeMarkets.length === 0 ? (
                <div className="empty compact-empty">
                  <EmptyIcon />
                  <span>
                    <b>No active markets yet</b>
                    Create one below to begin.
                  </span>
                </div>
              ) : (
                activeMarkets.map(([id, market]) => (
                  <button
                    key={id}
                    className={`market-card ${selectedId === id ? 'active' : ''}`}
                    onClick={() => setSelectedId(id)}
                  >
                    <div className="market-card-top">
                      <span className={`status ${statusClass(market)}`}>
                        {statusLabel(market)}
                      </span>
                      <span className="market-id">#{id}</span>
                    </div>

                    <strong className="market-question">{market.question}</strong>
                    <span className="market-authority">{market.authoritative_domain}</span>

                    <div className="mini-split">
                      <span>YES {market.yes_pool}</span>
                      <span>NO {market.no_pool}</span>
                    </div>
                    <PoolBar yes={market.yes_pool} no={market.no_pool} />

                    <div className="market-footer">
                      <span>{Number(market.yes_pool || 0) + Number(market.no_pool || 0)} G-USD pool</span>
                      <span>{formatDateTime(market.deadline_ts)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>

            <button
              className="history-toggle"
              onClick={() => setHistoryOpen((value) => !value)}
            >
              <span>Settled history</span>
              <span>{historyOpen ? '−' : '+'}</span>
            </button>

            {historyOpen ? (
              <div className="market-list history-list">
                {historyMarkets.slice(0, historyVisible).map(([id, market]) => (
                  <button
                    key={id}
                    className={`market-card history-card ${selectedId === id ? 'active' : ''}`}
                    onClick={() => setSelectedId(id)}
                  >
                    <div className="market-card-top">
                      <span className={`status ${statusClass(market)}`}>
                        {statusLabel(market)}
                      </span>
                      <span className="market-id">#{id}</span>
                    </div>
                    <strong className="market-question">{market.question}</strong>
                    <span className="market-authority">{market.authoritative_domain}</span>
                    <div className="mini-split">
                      <span>YES {market.yes_pool}</span>
                      <span>NO {market.no_pool}</span>
                    </div>
                  </button>
                ))}

                {historyVisible < historyMarkets.length ? (
                  <button
                    className="button subtle full"
                    onClick={() =>
                      setHistoryVisible((value) => value + HISTORY_PAGE_SIZE)
                    }
                  >
                    Load More
                  </button>
                ) : null}
              </div>
            ) : null}
          </aside>

          <section className="market-detail panel">
            {!selected ? (
              <div className="empty tall">
                <EmptyIcon />
                <span>
                  <b>Select a market</b>
                  Pick a live or settled market to see trading, evidence and settlement.
                </span>
              </div>
            ) : (
              <>
                <div className="selected-header">
                  <div className="selected-title">
                    <div className="selected-topline">
                      <span className={`status ${statusClass(selected)}`}>
                        {statusLabel(selected)}
                      </span>
                      <span className="authority-chip">
                        Official source · {selected.authoritative_domain}
                      </span>
                    </div>
                    <h2>{selected.question}</h2>
                    <div className="selected-meta">
                      <span>Market #{selectedId}</span>
                      <span>Deadline {formatDateTime(selected.deadline_ts)}</span>
                      <span>
                        Pool {Number(selected.yes_pool || 0) + Number(selected.no_pool || 0)} G-USD
                      </span>
                    </div>
                  </div>
                </div>

                <div className="outcome-grid">
                  <div className="outcome-card yes-card">
                    <span>YES</span>
                    <strong>{selected.yes_pool} G-USD</strong>
                    <small>Your position: {account ? yourYes : '—'} G-USD</small>
                  </div>

                  <div className="outcome-divider">
                    <PoolBar yes={selected.yes_pool} no={selected.no_pool} />
                    <span>MARKET SPLIT</span>
                  </div>

                  <div className="outcome-card no-card">
                    <span>NO</span>
                    <strong>{selected.no_pool} G-USD</strong>
                    <small>Your position: {account ? yourNo : '—'} G-USD</small>
                  </div>
                </div>

                <div className="phase-bar">
                  <div className={selectedPhase === 'OPEN' ? 'phase active' : 'phase done'}>
                    <span>1</span><b>Predict</b>
                  </div>
                  <div className={selectedPhase === 'EVIDENCE' ? 'phase active' : ['RESOLVED_YES','RESOLVED_NO','FAILED'].includes(selectedPhase ?? '') ? 'phase done' : 'phase'}>
                    <span>2</span><b>Evidence</b>
                  </div>
                  <div className={resolutionPending ? 'phase active' : ['RESOLVED_YES','RESOLVED_NO','FAILED'].includes(selectedPhase ?? '') ? 'phase done' : 'phase'}>
                    <span>3</span><b>Consensus</b>
                  </div>
                  <div className={['RESOLVED_YES','RESOLVED_NO','FAILED'].includes(selectedPhase ?? '') ? 'phase active' : 'phase'}>
                    <span>4</span><b>Settle</b>
                  </div>
                </div>

                {selectedPhase === 'OPEN' ? (
                  <div className="action-layout">
                    <section className="action-card">
                      <span className="section-label">TRADE</span>
                      <h3>Take a position</h3>
                      <label>
                        Bet amount
                        <div className="input-unit">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={betAmount}
                            onChange={(e) => setBetAmount(e.target.value)}
                          />
                          <span>G-USD</span>
                        </div>
                      </label>

                      <div className="trade-actions">
                        <button
                          className="button yes"
                          disabled={!canBet || busy !== ''}
                          onClick={() => placeBet(true)}
                        >
                          {busy === 'bet' ? 'Submitting…' : 'Bet YES'}
                        </button>
                        <button
                          className="button no"
                          disabled={!canBet || busy !== ''}
                          onClick={() => placeBet(false)}
                        >
                          {busy === 'bet' ? 'Submitting…' : 'Bet NO'}
                        </button>
                      </div>

                      {!deadlinePassed ? (
                        <p className="hint">
                          Betting stays open until {formatDateTime(selected.deadline_ts)}.
                        </p>
                      ) : (
                        <p className="hint warning">
                          Deadline passed. New bets are blocked by the contract.
                        </p>
                      )}
                    </section>

                    <aside className="next-card">
                      <span className="section-label">WHAT HAPPENS NEXT</span>
                      <h3>Betting closes. Evidence opens.</h3>
                      <p>
                        After the deadline, anyone can submit official pages from
                        <strong> {selected.authoritative_domain}</strong>. Validators
                        independently render and judge the committed evidence.
                      </p>
                      <div className="next-facts">
                        <div><span>Resolution opens</span><b>{formatDateTime(selected.resolve_open_at)}</b></div>
                        <div><span>Max sources</span><b>{config.max_evidence_urls}</b></div>
                        <div><span>Outcome picker</span><b>Validators only</b></div>
                      </div>
                    </aside>
                  </div>
                ) : null}

                {selectedPhase === 'EVIDENCE' ? (
                  <div className="evidence-layout">
                    <section className="action-card">
                      <span className="section-label">OFFICIAL EVIDENCE</span>
                      <h3>Prove what happened.</h3>
                      <p className="supporting-copy">
                        Submit official pages from <strong>{selected.authoritative_domain}</strong>.
                        You provide evidence; GenLayer validators choose the outcome.
                      </p>

                      <div className="evidence-list">
                        {(selected.evidence ?? []).length === 0 ? (
                          <div className="hint">No evidence submitted yet.</div>
                        ) : (
                          (selected.evidence ?? []).map((item, index) => (
                            <div key={`${item.url}-${index}`} className="evidence-item">
                              <div>
                                <span>Source {index + 1}</span>
                                <small>{short(item.submitter)}</small>
                              </div>
                              <a href={item.url} target="_blank" rel="noreferrer">
                                {item.url}
                              </a>
                            </div>
                          ))
                        )}
                      </div>

                      <label>
                        Official evidence URL
                        <input
                          type="url"
                          value={evidenceUrl}
                          onChange={(e) => setEvidenceUrl(e.target.value)}
                          placeholder={`https://${selected.authoritative_domain}/...`}
                          disabled={!canSubmitEvidence || busy !== ''}
                        />
                      </label>

                      <button
                        className="button secondary full"
                        disabled={
                          !canSubmitEvidence ||
                          busy !== '' ||
                          !evidenceUrl.trim()
                        }
                        onClick={submitEvidence}
                      >
                        {busy === 'evidence'
                          ? 'Submitting Evidence…'
                          : `Submit Official Evidence (${evidenceCount}/${config.max_evidence_urls})`}
                      </button>

                      {!canSubmitEvidence &&
                      evidenceCount >= config.max_evidence_urls ? (
                        <p className="hint warning">
                          Evidence set is full ({config.max_evidence_urls} URLs).
                        </p>
                      ) : null}
                    </section>

                    <aside className="consensus-card">
                      <span className="section-label">GENLAYER CONSENSUS</span>
                      <h3>
                        {resolutionPending
                          ? 'Validators are deciding.'
                          : 'Resolve from committed evidence.'}
                      </h3>

                      {resolutionWaitSeconds > 0 ? (
                        <p className="hint">
                          Evidence collection is open. Resolution unlocks in{' '}
                          <strong>{formatDuration(resolutionWaitSeconds)}</strong>.
                        </p>
                      ) : evidenceCount === 0 ? (
                        <p className="hint warning">
                          Submit at least one official evidence URL before resolving.
                        </p>
                      ) : !hasNewEvidenceForResolution ? (
                        <p className="hint warning">
                          Previous attempt returned UNKNOWN. New official evidence is required.
                        </p>
                      ) : (
                        <p className="hint">
                          The evidence window is complete. GenLayer can adjudicate now.
                        </p>
                      )}

                      <button
                        className="button primary full"
                        disabled={!canResolve || busy !== ''}
                        onClick={resolveMarket}
                      >
                        {resolutionPending
                          ? 'Resolution Submitted — Waiting for Consensus'
                          : busy === 'resolve'
                            ? 'Submitting Resolution…'
                            : 'Resolve with GenLayer AI'}
                      </button>

                      {resolutionPending ? (
                        <p className="hint warning">
                          Double-submit protection is active. The app checks accepted state
                          automatically; Refresh remains available as fallback.
                        </p>
                      ) : null}

                      {selected.resolution_attempts > 0 &&
                      selectedPhase === 'EVIDENCE' ? (
                        <div className="last-attempt">
                          <span>Last attempt</span>
                          <strong>{selected.resolution_reason || 'UNKNOWN'}</strong>
                        </div>
                      ) : null}

                      <div className="expiry-box">
                        {expiryWaitSeconds > 0 ? (
                          <p className="hint">
                            Fail-closed refund expiry: {formatDateTime(selected.expiry_at)}
                          </p>
                        ) : (
                          <button
                            className="button secondary full"
                            disabled={!canExpire || busy !== ''}
                            onClick={expireMarket}
                          >
                            {busy === 'expire'
                              ? 'Expiring…'
                              : 'Expire Market & Enable Refunds'}
                          </button>
                        )}
                      </div>
                    </aside>
                  </div>
                ) : null}

                {['RESOLVED_YES', 'RESOLVED_NO', 'FAILED'].includes(
                  selectedPhase ?? '',
                ) ? (
                  <section className="result-card">
                    <div className="result-head">
                      <span className="section-label">FINAL OUTCOME</span>
                      <h3>{statusLabel(selected)}</h3>
                    </div>

                    <div className="result-grid">
                      {selected.resolution_source ? (
                        <div className="result-row">
                          <span>Authoritative source</span>
                          <a
                            href={selected.resolution_source}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {selected.resolution_source}
                          </a>
                        </div>
                      ) : null}

                      {selected.resolution_quote ? (
                        <div className="result-row">
                          <span>Quote-grounded evidence</span>
                          <blockquote>“{selected.resolution_quote}”</blockquote>
                        </div>
                      ) : null}

                      {selected.resolution_reason ? (
                        <div className="result-row">
                          <span>AI resolution reason</span>
                          <p>{selected.resolution_reason}</p>
                        </div>
                      ) : null}
                    </div>

                    {canClaim ? (
                      <button
                        className="button primary claim-button"
                        disabled={busy !== '' || !isStudionet}
                        onClick={claim}
                      >
                        {selectedPhase === 'FAILED'
                          ? busy === 'claim'
                            ? 'Refunding…'
                            : 'Claim Refund'
                          : busy === 'claim'
                            ? 'Claiming…'
                            : 'Claim Winnings'}
                      </button>
                    ) : null}
                  </section>
                ) : null}
              </>
            )}
          </section>
        </section>

        <section id="create-market" className="create-section panel">
          <div className="create-intro">
            <span className="section-label">CREATE</span>
            <h2>Launch an authority-bound market.</h2>
            <p>
              The authoritative domain is committed before betting and cannot be swapped
              later to chase a preferred outcome.
            </p>

            <div className="create-stats">
              <div><span>Network active</span><b>{activeMarkets.length}/{MAX_ACTIVE_MARKETS}</b></div>
              <div><span>Your active</span><b>{account ? creatorActiveCount : '—'}/{MAX_ACTIVE_PER_CREATOR}</b></div>
            </div>
          </div>

          <form onSubmit={handleCreate} className="create-form">
            <label>
              Market ID
              <input
                value={marketId}
                onChange={(e) => setMarketId(e.target.value)}
                placeholder="world-cup-2030"
              />
            </label>

            <label className="span-2">
              Prediction question
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Will Argentina win the 2030 FIFA World Cup?"
                rows={3}
              />
            </label>

            <label>
              Authoritative domain
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              >
                <option value="">Select authority…</option>
                {AUTHORITY_OPTIONS.map((authority) => (
                  <option key={authority} value={authority}>
                    {authority}
                  </option>
                ))}
              </select>
              <small>Evidence must belong to this domain or its subdomains.</small>
            </label>

            <label>
              Betting deadline
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                min={toDateTimeLocal(new Date(Date.now() + 60_000))}
              />
              <small>
                Evidence opens after the deadline. AI resolution opens one minute later.
              </small>
            </label>

            <div className="create-submit">
              <button
                className="button primary full"
                disabled={busy !== '' || createLimitReached || !isStudionet}
                type="submit"
              >
                {busy === 'create'
                  ? 'Creating…'
                  : createLimitReached
                    ? 'Active Market Limit Reached'
                    : 'Create Market'}
              </button>
            </div>
          </form>
        </section>
      </main>

      <footer>
        <div>
          <strong>GenOracle V7</strong>
          <span>Official evidence · GenLayer consensus · deterministic settlement</span>
        </div>
        <span>{CONTRACT_ADDRESS}</span>
      </footer>
    </div>
  )
}

export default App
