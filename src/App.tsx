import { FormEvent, useEffect, useMemo, useState } from 'react'
import { CONTRACT_ADDRESS } from './lib/config'
import { connectWallet, genOracle, Market } from './lib/genlayer'

type BusyAction =
  | ''
  | 'connect'
  | 'faucet'
  | 'create'
  | 'bet'
  | 'close'
  | 'resolve'
  | 'claim'
  | 'refresh'

const short = (value: string, start = 8, end = 6) =>
  value.length <= start + end + 3
    ? value
    : `${value.slice(0, start)}...${value.slice(-end)}`

const statusLabel = (status: Market['status']) => {
  switch (status) {
    case 'OPEN':
      return 'Open'
    case 'CLOSED_FOR_BETTING':
      return 'Closed'
    case 'RESOLVED_YES':
      return 'Resolved YES'
    case 'RESOLVED_NO':
      return 'Resolved NO'
    case 'FAILED':
      return 'Failed / Refund'
  }
}

const todayIso = () => new Date().toISOString().slice(0, 10)

function App() {
  const [account, setAccount] = useState('')
  const [markets, setMarkets] = useState<Record<string, Market>>({})
  const [balance, setBalance] = useState(0)
  const [busy, setBusy] = useState<BusyAction>('')
  const [message, setMessage] = useState('')
  const [selectedId, setSelectedId] = useState('')

  const [marketId, setMarketId] = useState('')
  const [question, setQuestion] = useState('')
  const [domain, setDomain] = useState('')
  const [deadline, setDeadline] = useState('')

  const [betAmount, setBetAmount] = useState('25')

  const selected = selectedId ? markets[selectedId] : undefined

  const orderedMarkets = useMemo(
    () => Object.entries(markets).reverse(),
    [markets],
  )

  const run = async (action: BusyAction, fn: () => Promise<void>) => {
    try {
      setBusy(action)
      setMessage('')
      await fn()
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Unexpected error.',
      )
    } finally {
      setBusy('')
    }
  }

  const refresh = async () => {
    const [all, state] = await Promise.all([
      genOracle.getAllMarkets(),
      genOracle.getState(),
    ])

    setMarkets(all)

    if (account) {
      setBalance(state.balances[account.toLowerCase()] ?? 0)
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

  const handleConnect = () =>
    run('connect', async () => {
      const connected = await connectWallet()
      setAccount(connected)
      setMessage('Wallet connected to GenLayer Studionet.')
    })

  const handleFaucet = () =>
    run('faucet', async () => {
      if (!account) throw new Error('Connect wallet first.')
      await genOracle.faucet(account)
      await refresh()
      setMessage('Demo G-USD balance updated.')
    })

  const handleCreate = (event: FormEvent) => {
    event.preventDefault()

    return run('create', async () => {
      if (!account) throw new Error('Connect wallet first.')
      if (!marketId.trim()) throw new Error('Market ID is required.')
      if (!question.trim()) throw new Error('Question is required.')
      if (!domain.trim()) throw new Error('Authoritative domain is required.')
      if (!deadline) throw new Error('Deadline is required.')

      await genOracle.createMarket(
        account,
        marketId,
        question,
        domain,
        deadline,
      )

      setSelectedId(marketId.trim())
      setMarketId('')
      setQuestion('')
      setDomain('')
      setDeadline('')
      await refresh()
      setMessage('Market created.')
    })
  }

  const placeBet = (isYes: boolean) =>
    run('bet', async () => {
      if (!account) throw new Error('Connect wallet first.')
      if (!selectedId || !selected) throw new Error('Select a market first.')

      const amount = Number(betAmount)
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error('Bet amount must be a positive integer.')
      }

      await genOracle.placeBet(account, selectedId, isYes, amount)
      await refresh()
      setMessage(`${isYes ? 'YES' : 'NO'} bet submitted.`)
    })

  const closeBetting = () =>
    run('close', async () => {
      if (!account) throw new Error('Connect wallet first.')
      if (!selectedId) throw new Error('Select a market first.')

      await genOracle.closeBetting(account, selectedId)
      await refresh()
      setMessage('Betting closed after the market deadline.')
    })

  const resolveMarket = () =>
    run('resolve', async () => {
      if (!account) throw new Error('Connect wallet first.')
      if (!selectedId) throw new Error('Select a market first.')

      const { hash } = await genOracle.resolveMarket(account, selectedId)
      setMessage(
        `AI resolution submitted (${short(hash)}). Consensus runs asynchronously; refresh the market after it settles.`,
      )
    })

  const claim = () =>
    run('claim', async () => {
      if (!account) throw new Error('Connect wallet first.')
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
    !!selected && todayIso() > selected.deadline

  const canClose =
    !!selected &&
    selected.status === 'OPEN' &&
    deadlinePassed

  const canBet =
    !!selected &&
    selected.status === 'OPEN' &&
    !deadlinePassed

  const canResolve =
    !!selected &&
    selected.status === 'CLOSED_FOR_BETTING' &&
    deadlinePassed

  const canClaim =
    !!selected &&
    ['RESOLVED_YES', 'RESOLVED_NO', 'FAILED'].includes(selected.status)

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">GENLAYER STUDIONET</div>
          <h1>GenOracle</h1>
          <p className="subtitle">
            Authority-bound AI prediction markets with independent validator verification.
          </p>
        </div>

        <div className="wallet-panel">
          <div className="contract-chip">
            Contract {short(CONTRACT_ADDRESS)}
          </div>

          {account ? (
            <>
              <div className="wallet-address">{short(account)}</div>
              <div className="balance">{balance} G-USD</div>
            </>
          ) : null}

          <button
            className="button primary"
            onClick={handleConnect}
            disabled={busy !== ''}
          >
            {account ? 'Wallet Connected' : busy === 'connect' ? 'Connecting…' : 'Connect Wallet'}
          </button>

          {account ? (
            <button
              className="button ghost"
              onClick={handleFaucet}
              disabled={busy !== ''}
            >
              {busy === 'faucet' ? 'Processing…' : 'Get Demo G-USD'}
            </button>
          ) : null}
        </div>
      </header>

      <section className="steward-banner">
        <strong>Oracle policy:</strong> each market locks an authoritative domain.
        The leader and validators evaluate evidence under that policy, validators
        independently fetch the source, and only exact verdict labels are accepted.
      </section>

      {message ? <div className="notice">{message}</div> : null}

      <main className="grid">
        <section className="panel create-panel">
          <div className="panel-heading">
            <div>
              <div className="step">01</div>
              <h2>Create Market</h2>
            </div>
          </div>

          <form onSubmit={handleCreate} className="form">
            <label>
              Market ID
              <input
                value={marketId}
                onChange={(e) => setMarketId(e.target.value)}
                placeholder="world-cup-2022"
              />
            </label>

            <label>
              Prediction question
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Did Argentina win the 2022 FIFA World Cup?"
                rows={4}
              />
            </label>

            <label>
              Authoritative domain
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="fifa.com"
              />
              <small>
                Resolution sources must belong to this domain or its subdomains.
              </small>
            </label>

            <label>
              Settlement deadline
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
              <small>
                Bets are blocked after the deadline. Betting may be closed only after it passes.
              </small>
            </label>

            <button
              className="button primary full"
              disabled={busy !== ''}
              type="submit"
            >
              {busy === 'create' ? 'Creating…' : 'Create Market'}
            </button>
          </form>
        </section>

        <section className="panel markets-panel">
          <div className="panel-heading row">
            <div>
              <div className="step">02</div>
              <h2>Markets</h2>
            </div>
            <button
              className="button ghost"
              onClick={refreshUi}
              disabled={busy !== ''}
            >
              {busy === 'refresh' ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          <div className="market-list">
            {orderedMarkets.length === 0 ? (
              <div className="empty">
                No markets on this contract yet.
              </div>
            ) : (
              orderedMarkets.map(([id, market]) => (
                <button
                  key={id}
                  className={`market-card ${selectedId === id ? 'active' : ''}`}
                  onClick={() => setSelectedId(id)}
                >
                  <div className="market-card-top">
                    <span className={`status ${market.status.toLowerCase()}`}>
                      {statusLabel(market.status)}
                    </span>
                    <span className="market-id">{id}</span>
                  </div>
                  <strong>{market.question}</strong>
                  <div className="meta">
                    <span>Authority: {market.authoritative_domain}</span>
                    <span>Deadline: {market.deadline}</span>
                  </div>
                  <div className="pools">
                    <span>YES {market.yes_pool}</span>
                    <span>NO {market.no_pool}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="panel detail-panel">
          <div className="panel-heading">
            <div>
              <div className="step">03</div>
              <h2>Trade & Resolve</h2>
            </div>
          </div>

          {!selected ? (
            <div className="empty tall">
              Select a market to trade, close, resolve, or claim.
            </div>
          ) : (
            <>
              <div className="question-box">
                <span className={`status ${selected.status.toLowerCase()}`}>
                  {statusLabel(selected.status)}
                </span>
                <h3>{selected.question}</h3>

                <div className="facts">
                  <div>
                    <span>Authority</span>
                    <strong>{selected.authoritative_domain}</strong>
                  </div>
                  <div>
                    <span>Deadline</span>
                    <strong>{selected.deadline}</strong>
                  </div>
                  <div>
                    <span>YES pool</span>
                    <strong>{selected.yes_pool} G-USD</strong>
                  </div>
                  <div>
                    <span>NO pool</span>
                    <strong>{selected.no_pool} G-USD</strong>
                  </div>
                </div>
              </div>

              {selected.status === 'OPEN' ? (
                <div className="trade-box">
                  <label>
                    Bet amount
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={betAmount}
                      onChange={(e) => setBetAmount(e.target.value)}
                    />
                  </label>

                  <div className="trade-actions">
                    <button
                      className="button yes"
                      disabled={!canBet || busy !== ''}
                      onClick={() => placeBet(true)}
                    >
                      Bet YES
                    </button>
                    <button
                      className="button no"
                      disabled={!canBet || busy !== ''}
                      onClick={() => placeBet(false)}
                    >
                      Bet NO
                    </button>
                  </div>

                  {!deadlinePassed ? (
                    <p className="hint">
                      Betting is open. Closure becomes available after {selected.deadline}.
                    </p>
                  ) : (
                    <p className="hint warning">
                      Deadline passed. New bets are blocked by the contract.
                    </p>
                  )}

                  <button
                    className="button secondary full"
                    disabled={!canClose || busy !== ''}
                    onClick={closeBetting}
                  >
                    {busy === 'close' ? 'Closing…' : 'Close Betting'}
                  </button>
                </div>
              ) : null}

              {selected.status === 'CLOSED_FOR_BETTING' ? (
                <div className="resolution-box">
                  <h3>AI Resolution</h3>
                  <p>
                    GenLayer selects evidence under the enforced authority domain.
                    Validators independently fetch and evaluate the authoritative source.
                  </p>
                  <button
                    className="button primary full"
                    disabled={!canResolve || busy !== ''}
                    onClick={resolveMarket}
                  >
                    {busy === 'resolve' ? 'Submitting…' : 'Resolve with GenLayer AI'}
                  </button>
                </div>
              ) : null}

              {['RESOLVED_YES', 'RESOLVED_NO', 'FAILED'].includes(selected.status) ? (
                <div className="result-box">
                  <h3>{statusLabel(selected.status)}</h3>

                  {selected.resolution_source ? (
                    <div className="result-row">
                      <span>Source</span>
                      <a
                        href={selected.resolution_source}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {selected.resolution_source}
                      </a>
                    </div>
                  ) : null}

                  {selected.resolution_reason ? (
                    <div className="reason">
                      {selected.resolution_reason}
                    </div>
                  ) : null}

                  <button
                    className="button primary full"
                    disabled={!canClaim || busy !== '' || !account}
                    onClick={claim}
                  >
                    {selected.status === 'FAILED'
                      ? busy === 'claim'
                        ? 'Refunding…'
                        : 'Claim Refund'
                      : busy === 'claim'
                        ? 'Claiming…'
                        : 'Claim Winnings'}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </main>

      <footer>
        <span>GenOracle • GenLayer Studionet</span>
        <span>{CONTRACT_ADDRESS}</span>
      </footer>
    </div>
  )
}

export default App
