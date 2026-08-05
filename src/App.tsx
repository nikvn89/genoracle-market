import { useState, useEffect, useMemo } from 'react';
import './index.css';
import { createClient, createAccount } from 'genlayer-js';

const client = createClient({
  endpoint: '/api/rpc'
});

const CONTRACT_ADDRESS = "0xDa43e586BA0FA02Fc3AcbF2FB15B790C5c596dD0"; // V23 (Real Deadline Enforcement)
const EXPLORER_BASE = "https://explorer-studio.genlayer.com/tx/";

// Helper: days until/since deadline
function getDeadlineStatus(deadline: string) {
  if (!deadline) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(deadline + 'T00:00:00');
  const diffMs = d.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

function App() {
  const [activeTab, setActiveTab] = useState<'trade' | 'resolve'>('trade');
  const [activeWallet, setActiveWallet] = useState<'A' | 'B'>('A');
  const accountA = useMemo(() => createAccount('0x72bf6e67319555b11f47754b6eba01ce6d67fa377ce6c62437bb8677d346fd28'), []);
  const accountB = useMemo(() => createAccount('0x8888888888888888888888888888888888888888888888888888888888888888'), []);
  const account = activeWallet === 'A' ? accountA : accountB;
  
  const [markets, setMarkets] = useState<any>({});
  const [marketIds, setMarketIds] = useState<string[]>([]);
  const [hiddenMarkets, setHiddenMarkets] = useState<string[]>(() => {
    try {
      const val = JSON.parse(localStorage.getItem('genOracleHidden') || '[]');
      return Array.isArray(val) ? val : [];
    } catch { return []; }
  });
  const [claimedFaucet, setClaimedFaucet] = useState<string[]>([]);
  
  const [createLoading, setCreateLoading] = useState(false);
  const [createMsg, setCreateMsg] = useState('');
  
  const [marketQuestion, setMarketQuestion] = useState('');
  const [marketDomain, setMarketDomain] = useState('');
  const [marketDeadline, setMarketDeadline] = useState('');
  
  const [betAmounts, setBetAmounts] = useState<{[key: string]: number}>({});
  const [loadingStates, setLoadingStates] = useState<{[key: string]: boolean}>({});
  const [messages, setMessages] = useState<{[key: string]: string}>({});
  const [txHashes, setTxHashes] = useState<{[key: string]: string}>({});
  const [allBalances, setAllBalances] = useState<{[key: string]: number}>({});
  const [balance, setBalance] = useState(0);

  // Smart domain suggestion based on question
  useEffect(() => {
    const q = marketQuestion.toLowerCase();
    if (q.includes('bitcoin') || q.includes('btc') || q.includes('eth') || q.includes('crypto') || q.includes('price') || q.includes('coin')) {
      setMarketDomain('coinmarketcap.com');
    } else if (q.includes('election') || q.includes('president') || q.includes('vote') || q.includes('senator') || q.includes('congress')) {
      setMarketDomain('apnews.com');
    } else if (q.includes('world cup') || q.includes('fifa') || q.includes('nba') || q.includes('nfl') || q.includes('championship') || q.includes('sport')) {
      setMarketDomain('wikipedia.org');
    } else if (q.includes('trump') || q.includes('biden') || q.includes('war') || q.includes('ukraine') || q.includes('russia')) {
      setMarketDomain('reuters.com');
    } else if (q.length > 5) {
      setMarketDomain('bbc.com');
    }
  }, [marketQuestion]);
  
  useEffect(() => {
    fetchAllMarkets();
    fetchBalance();
  }, [activeWallet]);

  const fetchBalance = async () => {
    try {
      const res = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_state',
        args: []
      });
      const data = typeof res === 'string' ? JSON.parse(res) : (res?.result ? JSON.parse(res.result) : {});
      if (data?.balances) {
        setAllBalances(data.balances);
        const lowerAddress = account.address.toLowerCase();
        const newBalance = data.balances[lowerAddress] || 0;
        setBalance(newBalance);
        if (data.claimed_faucet) setClaimedFaucet(data.claimed_faucet);
        return newBalance;
      }
    } catch {}
    return balance;
  };

  const hasFauceted = claimedFaucet.includes(account.address.toLowerCase());

  const handleFaucet = async () => {
    setLoadingStates(prev => ({...prev, faucet: true}));
    try {
      await client.writeContract({
        account,
        address: CONTRACT_ADDRESS,
        functionName: 'faucet',
        args: [account.address]
      });
      const prevBalance = balance;
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const updated = await fetchBalance();
        if (updated > prevBalance) break;
      }
    } catch(e: any) {
      alert('Faucet error: ' + e.message);
    }
    setLoadingStates(prev => ({...prev, faucet: false}));
  };

  const fetchAllMarkets = async () => {
    try {
      const res = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_all_markets',
        args: []
      });
      const data = typeof res === 'string' ? JSON.parse(res) : (res?.result ? JSON.parse(res.result) : {});
      if (data) {
        setMarkets(data);
        const hidden = JSON.parse(localStorage.getItem('genOracleHidden') || '[]');
        const ids = Object.keys(data)
          .filter(id => !hidden.includes(id))
          .sort((a, b) => {
            // Put demo markets first, then sort by id descending
            if (a.startsWith('demo_')) return -1;
            if (b.startsWith('demo_')) return 1;
            return b.localeCompare(a);
          });
        setMarketIds(ids);
      }
    } catch {}
    fetchBalance();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!marketQuestion || !marketDeadline) {
      setCreateMsg('Question and deadline are required.');
      return;
    }
    
    setCreateLoading(true);
    setCreateMsg('Deploying Market to GenLayer Network...');
    const newMarketId = Date.now().toString();
    
    try {
      await client.writeContract({
        account,
        address: CONTRACT_ADDRESS,
        functionName: 'create_market',
        args: [newMarketId, marketQuestion, marketDomain || '', marketDeadline]
      });
      
      setCreateMsg('Waiting for network consensus...');
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const res = await client.readContract({
            address: CONTRACT_ADDRESS,
            functionName: 'get_market',
            args: [newMarketId]
          });
          const data = typeof res === 'string' ? JSON.parse(res) : (res?.result ? JSON.parse(res.result) : {});
          if (data?.status) {
            setMarkets((prev: any) => ({ ...prev, [newMarketId]: data }));
            setMarketIds(prev => [newMarketId, ...prev]);
            break;
          }
        } catch {}
      }
      setCreateMsg('✅ Market Initialized Successfully!');
      setMarketQuestion('');
      setMarketDomain('');
      setMarketDeadline('');
    } catch(err: any) {
      setCreateMsg('❌ Error: ' + err.message);
    }
    setCreateLoading(false);
  };

  const handleBet = async (e: React.FormEvent, id: string, isYes: boolean) => {
    e.preventDefault();
    setLoadingStates(prev => ({...prev, [`bet_${id}`]: true}));
    setMessages(prev => ({...prev, [`bet_${id}`]: `Broadcasting ${isYes ? 'YES' : 'NO'} position...`}));
    
    const amount = Number(betAmounts[id]) || 100;
    
    try {
      const prevMarket = markets[id];
      const prevPool = isYes ? (prevMarket?.yes_pool || 0) : (prevMarket?.no_pool || 0);

      await client.writeContract({
        account,
        address: CONTRACT_ADDRESS,
        functionName: 'place_bet',
        args: [id, account.address.toLowerCase(), isYes, amount]
      });
      
      setMessages(prev => ({...prev, [`bet_${id}`]: `Awaiting BFT consensus...`}));
      
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const res = await client.readContract({
            address: CONTRACT_ADDRESS,
            functionName: 'get_market',
            args: [id]
          });
          const data = typeof res === 'string' ? JSON.parse(res) : (res?.result ? JSON.parse(res.result) : {});
          const currentPool = isYes ? data.yes_pool : data.no_pool;
          if (currentPool > prevPool) break;
        } catch {}
      }
      
      await fetchAllMarkets();
      setMessages(prev => ({...prev, [`bet_${id}`]: `✅ Order filled on ${isYes ? 'YES' : 'NO'}.`}));
    } catch(err: any) {
      setMessages(prev => ({...prev, [`bet_${id}`]: '❌ ' + err.message}));
    }
    setLoadingStates(prev => ({...prev, [`bet_${id}`]: false}));
  };

  const handleCloseBetting = async (id: string) => {
    setLoadingStates(prev => ({...prev, [`close_${id}`]: true}));
    try {
      await client.writeContract({
        account, address: CONTRACT_ADDRESS, functionName: 'close_betting', args: [id]
      });
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const res = await client.readContract({ address: CONTRACT_ADDRESS, functionName: 'get_market', args: [id] }).catch(() => null);
        if (res) {
          const data = typeof res === 'string' ? JSON.parse(res) : (res?.result ? JSON.parse(res.result) : {});
          if (data.status === 'CLOSED_FOR_BETTING') break;
        }
      }
      await fetchAllMarkets();
    } catch(err: any) {
      alert('Error closing betting: ' + err.message);
    }
    setLoadingStates(prev => ({...prev, [`close_${id}`]: false}));
  };

  const handleResolve = async (id: string) => {
    setLoadingStates(prev => ({...prev, [`res_${id}`]: true}));
    setMessages(prev => ({...prev, [`res_${id}`]: 'Initializing Multi-Agent Tribunal...'}));
    
    client.writeContract({
      account, address: CONTRACT_ADDRESS, functionName: 'resolve_market', args: [id]
    }).catch(console.error);

    let attempt = 0;
    const interval = setInterval(async () => {
      attempt++;
      if (attempt < 4)       setMessages(prev => ({...prev, [`res_${id}`]: `🔍 Agent 1: Crafting search query...`}));
      else if (attempt < 8)  setMessages(prev => ({...prev, [`res_${id}`]: `🌐 Agent 1: Searching DuckDuckGo...`}));
      else if (attempt < 12) setMessages(prev => ({...prev, [`res_${id}`]: `📰 Agent 2: Extracting facts from web...`}));
      else                   setMessages(prev => ({...prev, [`res_${id}`]: `⚖️ Agent 3: Chief Judge deliberating...`}));

      await fetchAllMarkets();
      const res = await client.readContract({
        address: CONTRACT_ADDRESS, functionName: 'get_market', args: [id]
      }).catch(() => null);
      
      if (res) {
        const data = typeof res === 'string' ? JSON.parse(res) : (res?.result ? JSON.parse(res.result) : {});
        if (data.status && data.status !== 'OPEN' && data.status !== 'CLOSED_FOR_BETTING') {
          clearInterval(interval);
          setLoadingStates(prev => ({...prev, [`res_${id}`]: false}));
          setMarkets((prev: any) => ({ ...prev, [id]: data }));
          return;
        }
      }
      if (attempt >= 40) {
        clearInterval(interval);
        setLoadingStates(prev => ({...prev, [`res_${id}`]: false}));
        setMessages(prev => ({...prev, [`res_${id}`]: '⚠️ Consensus timeout. Please retry.'}));
      }
    }, 5000);
  };

  const handleClaim = async (id: string) => {
    setLoadingStates(prev => ({...prev, [`claim_${id}`]: true}));
    try {
      await client.writeContract({
        account, address: CONTRACT_ADDRESS, functionName: 'claim_winnings', args: [id, account.address.toLowerCase()]
      });
      await new Promise(r => setTimeout(r, 5000));
      await fetchAllMarkets();
    } catch(err: any) {
      alert('Error: ' + err.message);
    }
    setLoadingStates(prev => ({...prev, [`claim_${id}`]: false}));
  };

  const handleClearHistory = () => {
    if (window.confirm('Hide all current markets from your view? They remain on-chain and can be restored.')) {
      const newHidden = [...hiddenMarkets, ...marketIds];
      setHiddenMarkets(newHidden);
      localStorage.setItem('genOracleHidden', JSON.stringify(newHidden));
      setMarketIds([]);
    }
  };

  const handleRestoreHidden = () => {
    setHiddenMarkets([]);
    localStorage.removeItem('genOracleHidden');
    fetchAllMarkets();
  };

  // Derived market lists for Kanban
  const pendingMarkets   = marketIds.filter(id => markets[id] && (markets[id].status === 'OPEN' || markets[id].status === 'CLOSED_FOR_BETTING') && !loadingStates[`res_${id}`]);
  const processingMarkets = marketIds.filter(id => loadingStates[`res_${id}`]);
  const resolvedMarkets  = marketIds.filter(id => markets[id] && (markets[id].status?.startsWith('RESOLVED') || markets[id].status === 'FAILED'));

  const globalTotalPool = Object.values(markets).reduce((sum: number, market: any) => sum + (market.yes_pool || 0) + (market.no_pool || 0), 0);

  // Status badge color
  function statusColor(status: string) {
    if (status === 'OPEN') return 'var(--success)';
    if (status === 'CLOSED_FOR_BETTING') return 'var(--warning)';
    if (status === 'RESOLVED_YES') return 'var(--success)';
    if (status === 'RESOLVED_NO') return 'var(--danger)';
    if (status === 'FAILED') return '#888';
    return 'var(--text-muted)';
  }

  // Render deadline badge
  function DeadlineBadge({ deadline }: { deadline: string }) {
    const days = getDeadlineStatus(deadline);
    if (days === null) return null;
    if (days > 0) return (
      <span style={{background: 'rgba(255,170,0,0.15)', color: 'var(--warning)', border: '1px solid var(--warning)', borderRadius: '4px', fontSize: '11px', padding: '2px 8px', fontWeight: 'bold'}}>
        ⏳ {days}d until settlement
      </span>
    );
    return (
      <span style={{background: 'rgba(0,255,136,0.15)', color: 'var(--success)', border: '1px solid var(--success)', borderRadius: '4px', fontSize: '11px', padding: '2px 8px', fontWeight: 'bold'}}>
        ✅ Ready to Resolve
      </span>
    );
  }

  // Check if this wallet has claimable winnings or refunds
  function canClaim(market: any) {
    const addr = account.address.toLowerCase();
    const yp = market.yes_positions?.[addr] || 0;
    const np = market.no_positions?.[addr] || 0;
    if (market.status === 'RESOLVED_YES') return yp > 0;
    if (market.status === 'RESOLVED_NO') return np > 0;
    if (market.status === 'FAILED') return (yp + np) > 0;
    return false;
  }

  function hasLost(market: any) {
    const addr = account.address.toLowerCase();
    const yp = market.yes_positions?.[addr] || 0;
    const np = market.no_positions?.[addr] || 0;
    if (market.status === 'RESOLVED_YES') return np > 0 && yp === 0;
    if (market.status === 'RESOLVED_NO') return yp > 0 && np === 0;
    return false;
  }

  return (
    <div className="app-container">
      {/* Top nav */}
      <div style={{display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '20px 0', gap: '12px'}}>
        <button className="btn-primary" onClick={handleFaucet}
          disabled={loadingStates.faucet || hasFauceted}
          style={{width: 'auto', padding: '10px 20px', background: hasFauceted ? 'rgba(0,0,0,0.4)' : undefined, border: hasFauceted ? '1px solid #444' : undefined}}>
          {loadingStates.faucet ? '⏳ Requesting...' : hasFauceted ? '✅ Faucet Claimed' : '🏦 Request 1000 G-USD'}
        </button>
        <div style={{background: 'rgba(0,255,136,0.08)', border: '1px solid #00ff88', padding: '10px 18px', borderRadius: '8px', color: '#00ff88', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '0.95rem'}}>
          <div style={{width: '7px', height: '7px', background: '#00ff88', borderRadius: '50%', boxShadow: '0 0 8px #00ff88'}}></div>
          {account.address.substring(0, 8)}... | <span style={{color: '#fff'}}>{balance}</span> G-USD
        </div>
      </div>

      {/* Header */}
      <div className="cyber-header">
        <h1>GEN<span className="highlight">ORACLE</span></h1>
        <p>Decentralized Prediction Market · Resolved by Multi-Agent AI Tribunal</p>
        
        <div style={{display: 'flex', justifyContent: 'center', gap: '25px', marginTop: '20px'}}>
          <div style={{background: 'rgba(0,0,0,0.4)', padding: '10px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)'}}>
            <span style={{color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block'}}>Global TVL</span>
            <strong style={{color: 'var(--primary-color)', fontSize: '1.2rem'}}>{globalTotalPool} G-USD</strong>
          </div>
          <div style={{background: 'rgba(0,0,0,0.4)', padding: '10px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)'}}>
            <span style={{color: 'var(--text-muted)', fontSize: '0.85rem', display: 'block'}}>Total Markets</span>
            <strong style={{color: 'var(--accent-color)', fontSize: '1.2rem'}}>{marketIds.length}</strong>
          </div>
        </div>

        {/* Wallet switcher */}
        <div style={{marginTop: '25px', display: 'flex', justifyContent: 'center', gap: '12px'}}>
          {(['A', 'B'] as const).map(w => (
            <button key={w}
              onClick={() => setActiveWallet(w)}
              style={{padding: '8px 25px', borderRadius: '25px', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'Rajdhani', fontSize: '1.1rem', transition: '0.3s',
                background: activeWallet === w ? (w === 'A' ? 'var(--primary-color)' : 'var(--accent-color)') : 'rgba(255,255,255,0.05)',
                color: '#fff',
                border: activeWallet === w ? `1px solid ${w === 'A' ? 'var(--primary-color)' : 'var(--accent-color)'}` : '1px solid rgba(255,255,255,0.2)',
                boxShadow: activeWallet === w ? `0 0 15px ${w === 'A' ? 'rgba(0,210,255,0.4)' : 'rgba(255,0,122,0.4)'}` : 'none'
              }}>
              {w === 'A' ? '🧑 Wallet A' : '🕵️ Wallet B'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="tab-container">
        <button className={`tab-btn ${activeTab === 'trade' ? 'active' : ''}`} onClick={() => setActiveTab('trade')}>MARKETS &amp; TRADING</button>
        <button className={`tab-btn ${activeTab === 'resolve' ? 'active' : ''}`} onClick={() => setActiveTab('resolve')}>AI TRIBUNAL RESOLUTION</button>
      </div>

      {/* ═══ MARKETS & TRADING TAB ═══ */}
      {activeTab === 'trade' && (
        <div className="grid-layout">
          {/* Left: Create + Leaderboard */}
          <div className="cyber-panel">
            <h2><span style={{color: 'var(--primary-color)'}}>⚡</span> Market Initialization</h2>
            <form onSubmit={handleCreate}>
              <div className="input-group">
                <label>Question to Predict</label>
                <input type="text" value={marketQuestion} onChange={e => setMarketQuestion(e.target.value)} required placeholder="e.g. Will SpaceX land on Mars before 2030?" />
              </div>
              <div className="input-group">
                <label>Authoritative Domain <span style={{color: 'var(--primary-color)', fontSize: '12px'}}>— OPTIONAL</span></label>
                <select value={marketDomain} onChange={e => setMarketDomain(e.target.value)}
                  style={{padding: '12px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '6px', fontSize: '1rem', width: '100%'}}>
                  <option value="">Open Web Search (Auto-Detect)</option>
                  <option value="wikipedia.org">wikipedia.org — General Knowledge</option>
                  <option value="bbc.com">bbc.com — Global News</option>
                  <option value="reuters.com">reuters.com — Politics & Economics</option>
                  <option value="apnews.com">apnews.com — Breaking News</option>
                  <option value="coinmarketcap.com">coinmarketcap.com — Crypto</option>
                </select>
              </div>
              <div className="input-group">
                <label>Settlement Deadline</label>
                <input type="date" value={marketDeadline} onChange={e => setMarketDeadline(e.target.value)} required />
              </div>
              <button type="submit" className="btn-primary" disabled={createLoading}>
                {createLoading ? <div className="loader"></div> : '🚀 Initialize Smart Contract'}
              </button>
            </form>
            {createMsg && <div className={`result-box ${createMsg.startsWith('✅') ? 'success' : ''}`}>{createMsg}</div>}

            {/* Leaderboard */}
            <div style={{marginTop: '35px'}}>
              <h2 style={{color: 'var(--warning)', fontSize: '1.4rem'}}>🏆 Top Traders</h2>
              <div style={{display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px'}}>
                {Object.entries(allBalances).length > 0 ? (
                  Object.entries(allBalances)
                    .filter(([, bal]) => (bal as number) > 0)
                    .sort((a, b) => (b[1] as number) - (a[1] as number))
                    .slice(0, 5)
                    .map(([addr, bal], idx) => (
                      <div key={addr} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', borderLeft: idx === 0 ? '4px solid #ffcc00' : '4px solid rgba(255,255,255,0.1)'}}>
                        <span style={{color: idx === 0 ? '#ffcc00' : '#fff', fontWeight: 'bold', fontSize: '0.9rem'}}>{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`} {addr.substring(0, 8)}...</span>
                        <span style={{color: 'var(--success)', fontWeight: 'bold'}}>{bal as number} G-USD</span>
                      </div>
                    ))
                ) : (
                  <div style={{textAlign: 'center', color: 'var(--text-muted)', padding: '20px'}}>No active traders yet</div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Order Book */}
          <div className="cyber-panel">
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '15px'}}>
              <h2 style={{borderBottom: 'none', padding: 0, margin: 0}}><span style={{color: 'var(--accent-color)'}}>🎲</span> Order Book</h2>
              <div style={{display: 'flex', gap: '8px'}}>
                {hiddenMarkets.length > 0 && (
                  <button className="btn-primary" onClick={handleRestoreHidden} style={{padding: '7px 14px', fontSize: '0.8rem', width: 'auto', background: 'var(--success)', border: '1px solid var(--success)'}}>👁️ Restore</button>
                )}
                <button className="btn-primary" onClick={handleClearHistory} style={{padding: '7px 14px', fontSize: '0.8rem', width: 'auto', background: 'rgba(255,51,102,0.2)', border: '1px solid var(--danger)', color: 'var(--danger)'}}>🗑️ Hide All</button>
                <button className="btn-primary" onClick={fetchAllMarkets} style={{padding: '7px 14px', fontSize: '0.8rem', width: 'auto'}}>🔄 Sync</button>
              </div>
            </div>
            
            <div style={{display: 'grid', gap: '20px'}}>
              {marketIds.map(id => {
                const market = markets[id];
                if (!market) return null;
                
                const myYes = market.yes_positions?.[account.address.toLowerCase()] || 0;
                const myNo  = market.no_positions?.[account.address.toLowerCase()] || 0;
                const totalPool = (market.yes_pool || 0) + (market.no_pool || 0);
                const yesPercent = totalPool > 0 ? Math.round((market.yes_pool / totalPool) * 100) : 50;
                const deadlineDays = getDeadlineStatus(market.deadline);
                const isDemo = id.startsWith('demo_');

                return (
                  <div key={id} className="market-card">
                    {isDemo && (
                      <div style={{fontSize: '10px', fontWeight: 'bold', color: 'var(--primary-color)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px'}}>
                        ⭐ Demo Market — Judge Testable
                      </div>
                    )}
                    <h3>{market.question}</h3>
                    <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px'}}>
                      <span style={{fontSize: '11px', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.3)', padding: '2px 8px', borderRadius: '4px'}}>
                        🌐 {market.authoritative_domain || 'open web'}
                      </span>
                      <span style={{fontSize: '11px', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.3)', padding: '2px 8px', borderRadius: '4px'}}>
                        📅 {market.deadline}
                      </span>
                      {market.deadline && <DeadlineBadge deadline={market.deadline} />}
                    </div>
                    
                    {/* Pool bar */}
                    <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '5px'}}>
                      <span style={{color: 'var(--success)'}}>YES {yesPercent}% ({market.yes_pool} G)</span>
                      <span style={{color: 'var(--danger)'}}>NO {100 - yesPercent}% ({market.no_pool} G)</span>
                    </div>
                    <div style={{height: '6px', background: 'rgba(255,51,102,0.3)', borderRadius: '3px', display: 'flex', overflow: 'hidden', marginBottom: '12px'}}>
                      <div style={{width: `${yesPercent}%`, background: 'var(--success)', height: '100%', transition: 'width 0.5s'}}></div>
                    </div>

                    <div className="pool-info">
                      <span>Total Pool: <strong>{totalPool} G-USD</strong></span>
                      <span>Status: <strong style={{color: statusColor(market.status)}}>{market.status}</strong></span>
                    </div>
                    
                    {/* My positions */}
                    {(myYes > 0 || myNo > 0) && (
                      <div style={{padding: '10px', background: 'rgba(0,210,255,0.07)', borderRadius: '8px', border: '1px solid rgba(0,210,255,0.2)', marginBottom: '12px', display: 'flex', gap: '15px', alignItems: 'center'}}>
                        <span style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>Your Position:</span>
                        {myYes > 0 && <span style={{color: 'var(--success)', fontWeight: 'bold', fontSize: '0.9rem'}}>YES {myYes} G</span>}
                        {myNo > 0 && <span style={{color: 'var(--danger)', fontWeight: 'bold', fontSize: '0.9rem'}}>NO {myNo} G</span>}
                      </div>
                    )}
                    
                    {/* Betting UI */}
                    {market.status === 'OPEN' && (deadlineDays === null || deadlineDays > 0) ? (
                      <div>
                        <div className="input-group" style={{margin: '0 0 10px'}}>
                          <input type="text" value={betAmounts[id] !== undefined ? betAmounts[id] : '100'}
                            onChange={e => setBetAmounts(prev => ({...prev, [id]: Number(e.target.value.replace(/[^0-9]/g, ''))}))}
                            placeholder="Amount in G-USD" />
                        </div>
                        <div className="bet-buttons">
                          <button className="btn-yes" onClick={e => handleBet(e, id, true)} disabled={loadingStates[`bet_${id}`]}>
                            {loadingStates[`bet_${id}`] ? '...' : '📈 BUY YES'}
                          </button>
                          <button className="btn-no" onClick={e => handleBet(e, id, false)} disabled={loadingStates[`bet_${id}`]}>
                            {loadingStates[`bet_${id}`] ? '...' : '📉 BUY NO'}
                          </button>
                        </div>
                      </div>
                    ) : market.status === 'OPEN' && deadlineDays !== null && deadlineDays <= 0 ? (
                      <div className="result-box" style={{color: 'var(--warning)', borderLeftColor: 'var(--warning)'}}>
                        ⛔ Betting period has ended. Go to Tribunal to resolve.
                      </div>
                    ) : market.status !== 'OPEN' ? (
                      <div className="result-box glow">
                        {market.status === 'CLOSED_FOR_BETTING' ? '🔒 Locked. Awaiting AI Tribunal.' : `Final: ${market.status}`}
                      </div>
                    ) : null}
                    
                    {messages[`bet_${id}`] && <div className="result-box" style={{marginTop: '8px'}}>{messages[`bet_${id}`]}</div>}
                    {txHashes[`bet_${id}`] && (
                      <a href={`${EXPLORER_BASE}${txHashes[`bet_${id}`]}`} target="_blank" rel="noreferrer"
                        style={{display: 'block', marginTop: '6px', fontSize: '11px', color: 'var(--primary-color)'}}>
                        🔗 View on Explorer →
                      </a>
                    )}
                  </div>
                );
              })}
              {marketIds.length === 0 && (
                <div style={{textAlign: 'center', color: 'var(--text-muted)', padding: '40px'}}>
                  No markets found.<br/>
                  <span style={{fontSize: '0.85rem'}}>Initialize one above or click Sync to load existing markets.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ AI TRIBUNAL RESOLUTION TAB ═══ */}
      {activeTab === 'resolve' && (
        <div className="kanban-layout">
          {/* Column 1: Pending */}
          <div className="kanban-col">
            <h2>⏳ Pending Analysis</h2>
            {pendingMarkets.length === 0 && <div style={{textAlign: 'center', color: 'var(--text-muted)', padding: '30px 0', fontSize: '0.9rem'}}>No pending markets</div>}
            {pendingMarkets.map(id => (
              <div key={id} className="market-card">
                <h3 style={{fontSize: '0.95rem'}}>{markets[id].question}</h3>
                <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '10px 0'}}>
                  <span style={{fontSize: '11px', color: 'var(--text-muted)'}}>🌐 {markets[id].authoritative_domain || 'open web'}</span>
                  {markets[id].deadline && <DeadlineBadge deadline={markets[id].deadline} />}
                </div>
                <div style={{fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px'}}>
                  Pool: {(markets[id].yes_pool || 0) + (markets[id].no_pool || 0)} G-USD
                </div>
                
                {markets[id].status === 'OPEN' ? (
                  <button className="btn-primary" onClick={() => handleCloseBetting(id)}
                    disabled={loadingStates[`close_${id}`]}
                    style={{background: 'var(--warning)', marginTop: '5px'}}>
                    {loadingStates[`close_${id}`] ? 'Locking...' : '🔒 Close Betting'}
                  </button>
                ) : (
                  <button className="btn-primary" onClick={() => handleResolve(id)}
                    style={{marginTop: '5px'}}>
                    🤖 Summon Autonomous Tribunal
                  </button>
                )}
              </div>
            ))}
          </div>
          
          {/* Column 2: Processing */}
          <div className="kanban-col">
            <h2>🧠 Tribunal Processing</h2>
            {processingMarkets.length === 0 && <div style={{textAlign: 'center', color: 'var(--text-muted)', padding: '30px 0', fontSize: '0.9rem'}}>No active analysis</div>}
            {processingMarkets.map(id => (
              <div key={id} className="market-card processing">
                <div className="ai-scanning"><div className="scan-line"></div></div>
                <h3 style={{fontSize: '0.95rem'}}>{markets[id].question}</h3>
                <div style={{background: 'rgba(0,0,0,0.5)', padding: '15px', borderRadius: '8px', marginTop: '15px', border: '1px solid var(--accent-color)'}}>
                  <p style={{color: '#fff', fontSize: '0.9rem', fontFamily: 'Rajdhani', fontWeight: 'bold'}}>{'>'} {messages[`res_${id}`]}</p>
                </div>
                <div style={{marginTop: '10px', display: 'flex', justifyContent: 'center', gap: '6px'}}>
                  {[1,2,3].map(i => <div key={i} style={{width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-color)', animation: `pulse ${0.5 * i}s infinite alternate`}}></div>)}
                </div>
              </div>
            ))}
          </div>

          {/* Column 3: Final Rulings */}
          <div className="kanban-col">
            <h2>✅ Final Rulings</h2>
            {resolvedMarkets.length === 0 && <div style={{textAlign: 'center', color: 'var(--text-muted)', padding: '30px 0', fontSize: '0.9rem'}}>No rulings yet</div>}
            {resolvedMarkets.map(id => {
              const market = markets[id];
              const claimable = canClaim(market);
              const lost = hasLost(market);
              const isFailed = market.status === 'FAILED';
              
              return (
                <div key={id} className="market-card" style={{borderColor: isFailed ? '#555' : market.status === 'RESOLVED_YES' ? 'var(--success)' : 'var(--danger)', boxShadow: 'none'}}>
                  <h3 style={{fontSize: '12px', color: 'var(--text-muted)'}}>{market.question}</h3>
                  <h2 style={{color: statusColor(market.status), textAlign: 'center', margin: '15px 0', fontSize: '1.3rem', letterSpacing: '1px'}}>
                    {market.status}
                  </h2>
                  
                  {market.resolution_reason && (
                    <div style={{background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '12px', marginBottom: '12px'}}>
                      <div style={{color: 'var(--accent-color)', fontSize: '10px', textTransform: 'uppercase', marginBottom: '6px', fontWeight: 'bold'}}>AI Reasoning Report</div>
                      <div style={{color: '#ccc', fontSize: '11px', whiteSpace: 'pre-wrap', maxHeight: '120px', overflowY: 'auto', lineHeight: '1.5'}}>{market.resolution_reason}</div>
                    </div>
                  )}
                  
                  {claimable && (
                    <button className="btn-primary" onClick={() => handleClaim(id)}
                      disabled={loadingStates[`claim_${id}`]}
                      style={{width: '100%', background: isFailed ? 'var(--warning)' : 'var(--success)', color: '#000', fontWeight: 'bold'}}>
                      {loadingStates[`claim_${id}`] ? '⏳ Processing...' : isFailed ? '🔁 Claim Refund' : '💰 Claim Payout'}
                    </button>
                  )}
                  
                  {lost && (
                    <div style={{color: 'var(--danger)', textAlign: 'center', marginTop: '10px', fontSize: '0.85rem', fontWeight: 'bold'}}>
                      ❌ Prediction incorrect. Liquidity seized.
                    </div>
                  )}
                  
                  {!claimable && !lost && (market.status === 'RESOLVED_YES' || market.status === 'RESOLVED_NO' || isFailed) && (
                    <div style={{color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.8rem', padding: '10px'}}>
                      {isFailed ? '— No position to refund for this wallet —' : '— No position in this market —'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
