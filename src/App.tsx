import { useState, useEffect, useMemo } from 'react';
import './index.css';
import { createClient, createAccount } from 'genlayer-js';

const client = createClient({
  endpoint: '/api/rpc'
});

const CONTRACT_ADDRESS = "0x75d3f8D8F1360F40B1c433E3967B8368cCE829A8";

function App() {
  const [activeTab, setActiveTab] = useState<'trade' | 'resolve'>('trade');
  const [activeWallet, setActiveWallet] = useState<'A' | 'B'>('A');
  const accountA = useMemo(() => createAccount('0x72bf6e67319555b11f47754b6eba01ce6d67fa377ce6c62437bb8677d346fd28'), []);
  const accountB = useMemo(() => createAccount('0x8888888888888888888888888888888888888888888888888888888888888888'), []);
  const account = activeWallet === 'A' ? accountA : accountB;
  
  const [markets, setMarkets] = useState<any>({});
  const [marketIds, setMarketIds] = useState<string[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [allBalances, setAllBalances] = useState<{[key: string]: number}>({});
  
  const [createLoading, setCreateLoading] = useState(false);
  const [createMsg, setCreateMsg] = useState('');
  
  const [marketQuestion, setMarketQuestion] = useState("");
  const [marketDomain, setMarketDomain] = useState("wikipedia.org");
  const [marketDeadline, setMarketDeadline] = useState("");
  
  const [betAmounts, setBetAmounts] = useState<{[key: string]: number}>({});
  const [loadingStates, setLoadingStates] = useState<{[key: string]: boolean}>({});
  const [messages, setMessages] = useState<{[key: string]: string}>({});
  
  // Semantic Analyzer for Auto-Domain Selection
  useEffect(() => {
    const q = marketQuestion.toLowerCase();
    if (q.includes('bitcoin') || q.includes('btc') || q.includes('crypto') || q.includes('price')) {
        setMarketDomain('coinmarketcap.com');
    } else if (q.includes('election') || q.includes('president') || q.includes('vote') || q.includes('win')) {
        setMarketDomain('apnews.com');
    } else if (q.includes('weather') || q.includes('rain') || q.includes('flat') || q.includes('earth')) {
        setMarketDomain('wikipedia.org');
    } else if (q.length > 0) {
        setMarketDomain('bbc.com');
    }
  }, [marketQuestion]);
  
  useEffect(() => {
    fetchAllMarkets();
    fetchBalance();
  }, [marketIds, activeWallet]);

  const fetchBalance = async () => {
    try {
      const res = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_state',
        args: []
      });
      const data = typeof res === 'string' ? JSON.parse(res) : (res.result ? JSON.parse(res.result) : {});
      if (data && data.balances) {
        setAllBalances(data.balances);
        const lowerAddress = account.address.toLowerCase();
        const newBalance = data.balances[lowerAddress] || data.balances[account.address] || 0;
        setBalance(newBalance);
        return newBalance;
      }
    } catch(e) {}
    return balance;
  };

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
      for (let i = 1; i <= 20; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const updatedBalance = await fetchBalance();
        if (updatedBalance > prevBalance) break;
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
      const data = typeof res === 'string' ? JSON.parse(res) : (res.result ? JSON.parse(res.result) : {});
      if (data) {
        setMarkets(data);
        // Sort IDs descending so newest are on top
        const ids = Object.keys(data).sort((a, b) => Number(b) - Number(a));
        setMarketIds(ids);
      }
    } catch(e) {}
    fetchBalance();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!marketQuestion || !marketDeadline || !marketDomain) {
      setCreateMsg('All fields are required.');
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
        args: [newMarketId, marketQuestion, marketDomain, marketDeadline]
      });
      
      const newIds = [newMarketId, ...marketIds];
      setMarketIds(newIds);
      
      setCreateMsg('Waiting for network consensus...');
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const res = await client.readContract({
            address: CONTRACT_ADDRESS,
            functionName: 'get_market',
            args: [newMarketId]
          });
          const data = typeof res === 'string' ? JSON.parse(res) : (res.result ? JSON.parse(res.result) : {});
          if (data && data.status) {
            setMarkets((prev: any) => ({ ...prev, [newMarketId]: data }));
            break;
          }
        } catch(e) {}
      }
      setCreateMsg('✅ Market Initialized Successfully!');
      setMarketQuestion('');
      setMarketDomain('wikipedia.org');
      setMarketDeadline('');
    } catch(err: any) {
      setCreateMsg('Error: ' + err.message);
    }
    setCreateLoading(false);
  };

  const handleBet = async (e: React.FormEvent, id: string, isYes: boolean) => {
    e.preventDefault();
    setLoadingStates(prev => ({...prev, [`bet_${id}`]: true}));
    setMessages(prev => ({...prev, [`bet_${id}`]: `Encrypting ${isYes ? 'YES' : 'NO'} payload...`}));
    
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
      
      setMessages(prev => ({...prev, [`bet_${id}`]: `Awaiting BFT validation...`}));
      
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000));
        try {
          const res = await client.readContract({
            address: CONTRACT_ADDRESS,
            functionName: 'get_market',
            args: [id]
          });
          const data = typeof res === 'string' ? JSON.parse(res) : (res.result ? JSON.parse(res.result) : {});
          const currentPool = isYes ? data.yes_pool : data.no_pool;
          if (currentPool > prevPool) {
            break;
          }
        } catch(e) {}
      }
      
      await fetchAllMarkets();
      setMessages(prev => ({...prev, [`bet_${id}`]: `✅ Order Filled on ${isYes ? 'YES' : 'NO'}.`}));
    } catch(err: any) {
      setMessages(prev => ({...prev, [`bet_${id}`]: '❌ Error: ' + err.message}));
    }
    setLoadingStates(prev => ({...prev, [`bet_${id}`]: false}));
  };

  const handleCloseBetting = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    setLoadingStates(prev => ({...prev, [`close_${id}`]: true}));
    try {
      await client.writeContract({
        account, address: CONTRACT_ADDRESS, functionName: 'close_betting', args: [id]
      });
      
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const res = await client.readContract({
          address: CONTRACT_ADDRESS,
          functionName: 'get_market',
          args: [id]
        }).catch(() => null);
        if (res) {
          const data = typeof res === 'string' ? JSON.parse(res) : (res.result ? JSON.parse(res.result) : {});
          if (data.status === 'CLOSED_FOR_BETTING') {
            break;
          }
        }
      }
      await fetchAllMarkets();
    } catch(err: any) {
      alert("Error closing betting: " + err.message);
    }
    setLoadingStates(prev => ({...prev, [`close_${id}`]: false}));
  };

  const handleResolve = async (e: React.FormEvent, id: string) => {
    e.preventDefault();

    setLoadingStates(prev => ({...prev, [`res_${id}`]: true}));
    setMessages(prev => ({...prev, [`res_${id}`]: 'Initializing Fully Autonomous Workflow...'}));
    
    client.writeContract({
      account, address: CONTRACT_ADDRESS, functionName: 'resolve_market', args: [id]
    }).catch(console.error);

    let attempt = 0;
    const interval = setInterval(async () => {
      attempt++;
      if (attempt < 4) setMessages(prev => ({...prev, [`res_${id}`]: `Agent 1 generating search strategy...`}));
      else if (attempt < 8) setMessages(prev => ({...prev, [`res_${id}`]: `Executing Web Search on selected domain...`}));
      else if (attempt < 12) setMessages(prev => ({...prev, [`res_${id}`]: `Agent 2 reading search snippets and extracting facts...`}));
      else setMessages(prev => ({...prev, [`res_${id}`]: `Agent 3 (Chief Judge) finalizing YES/NO ruling...`}));

      await fetchAllMarkets();
      const res = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_market',
        args: [id]
      }).catch(() => null);
      if (res) {
        const data = typeof res === 'string' ? JSON.parse(res) : (res.result ? JSON.parse(res.result) : {});
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
        setMessages(prev => ({...prev, [`res_${id}`]: 'Consensus Timeout. Check network.'}));
      }
    }, 5000);
  };

  const handleClaim = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    setLoadingStates(prev => ({...prev, [`claim_${id}`]: true}));
    try {
      await client.writeContract({
        account, address: CONTRACT_ADDRESS, functionName: 'claim_winnings', args: [id, account.address.toLowerCase()]
      });
      await new Promise(r => setTimeout(r, 4000));
      await fetchAllMarkets();
    } catch(err: any) {
      alert("Error: " + err.message);
    }
    setLoadingStates(prev => ({...prev, [`claim_${id}`]: false}));
  };

  const handleClearHistory = () => {
    // History is now on-chain, so we don't clear it locally anymore.
    alert("History is fully synchronized with the blockchain. You cannot clear it locally anymore!");
  };

  const [walletConnected, setWalletConnected] = useState(false);
  
  const pendingMarkets = marketIds.filter(id => markets[id] && (markets[id].status === 'OPEN' || markets[id].status === 'CLOSED_FOR_BETTING') && !loadingStates[`res_${id}`]);
  const processingMarkets = marketIds.filter(id => loadingStates[`res_${id}`]);
  const resolvedMarkets = marketIds.filter(id => markets[id] && (markets[id].status.startsWith('RESOLVED') || markets[id].status === 'FAILED'));

  // Calculate global stats
  const globalTotalPool = Object.values(markets).reduce((sum: number, market: any) => sum + (market.yes_pool || 0) + (market.no_pool || 0), 0);

  return (
    <div className="app-container">
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 0'}}>
        <div style={{color: 'var(--primary-color)', fontFamily: 'Rajdhani', fontSize: '1.2rem', fontWeight: 'bold'}}>
          {/* Logo area */}
        </div>
        <div style={{display: 'flex', gap: '15px'}}>
          {!walletConnected ? (
            <button className="btn-primary" onClick={() => setWalletConnected(true)} style={{width: 'auto'}}>
              🔗 Connect Terminal
            </button>
          ) : (
          <>
            <button className="btn-primary" onClick={handleFaucet} disabled={loadingStates.faucet || balance >= 1000} style={{width: 'auto', background: (loadingStates.faucet || balance >= 1000) ? 'rgba(0,0,0,0.5)' : 'var(--primary-color)'}}>
              {loadingStates.faucet ? `⏳ Interacting...` : (balance >= 1000 ? '✅ Faucet Limit Reached' : '🏦 Request 1000 G-USD')}
            </button>
            <div style={{background: 'rgba(0, 255, 136, 0.1)', border: '1px solid #00ff88', padding: '10px 20px', borderRadius: '8px', color: '#00ff88', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold'}}>
              <div style={{width: '8px', height: '8px', background: '#00ff88', borderRadius: '50%', boxShadow: '0 0 10px #00ff88'}}></div>
              {account.address.substring(0, 6)}... | {balance} G-USD
            </div>
          </>
        )}
        </div>
      </div>

      <div className="cyber-header">
        <h1>GEN<span className="highlight">ORACLE</span> V3</h1>
        <p>Next-Gen Prediction Market Powered by Multi-Agent AI Tribunal</p>
        
        <div style={{display: 'flex', justifyContent: 'center', gap: '30px', marginTop: '20px'}}>
          <div style={{background: 'rgba(0,0,0,0.4)', padding: '10px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)'}}>
            <span style={{color: 'var(--text-muted)', fontSize: '0.9rem', display: 'block'}}>Global TVL</span>
            <strong style={{color: 'var(--primary-color)', fontSize: '1.2rem'}}>{globalTotalPool} GL</strong>
          </div>
          <div style={{background: 'rgba(0,0,0,0.4)', padding: '10px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)'}}>
            <span style={{color: 'var(--text-muted)', fontSize: '0.9rem', display: 'block'}}>Total Markets</span>
            <strong style={{color: 'var(--accent-color)', fontSize: '1.2rem'}}>{marketIds.length}</strong>
          </div>
        </div>

        <div style={{marginTop: '25px', display: 'flex', justifyContent: 'center', gap: '15px'}}>
          <button 
            onClick={() => setActiveWallet('A')}
            style={{padding: '8px 25px', borderRadius: '25px', background: activeWallet === 'A' ? 'var(--primary-color)' : 'rgba(255,255,255,0.05)', color: '#fff', border: activeWallet === 'A' ? '1px solid var(--primary-color)' : '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'Rajdhani', fontSize: '1.1rem', transition: '0.3s', boxShadow: activeWallet === 'A' ? '0 0 15px rgba(0,210,255,0.5)' : 'none'}}
          >
            🧑 Wallet A
          </button>
          <button 
            onClick={() => setActiveWallet('B')}
            style={{padding: '8px 25px', borderRadius: '25px', background: activeWallet === 'B' ? 'var(--accent-color)' : 'rgba(255,255,255,0.05)', color: activeWallet === 'B' ? '#fff' : '#fff', border: activeWallet === 'B' ? '1px solid var(--accent-color)' : '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', fontWeight: 'bold', fontFamily: 'Rajdhani', fontSize: '1.1rem', transition: '0.3s', boxShadow: activeWallet === 'B' ? '0 0 15px rgba(255,0,122,0.5)' : 'none'}}
          >
            🕵️ Wallet B
          </button>
        </div>
      </div>

      <div className="tab-container">
        <button className={`tab-btn ${activeTab === 'trade' ? 'active' : ''}`} onClick={() => setActiveTab('trade')}>
          MARKETS & TRADING
        </button>
        <button className={`tab-btn ${activeTab === 'resolve' ? 'active' : ''}`} onClick={() => setActiveTab('resolve')}>
          AI TRIBUNAL RESOLUTION
        </button>
      </div>

      {activeTab === 'trade' && (
        <div className="grid-layout">
          <div className="cyber-panel">
            <h2><span style={{color: 'var(--primary-color)'}}>⚡</span> Market Initialization</h2>
            <form onSubmit={handleCreate}>
              <div className="input-group">
                <label>Question to Predict</label>
                <input type="text" value={marketQuestion} onChange={(e) => setMarketQuestion(e.target.value)} required placeholder="e.g. Did SpaceX launch Starship today?" />
              </div>
              <div className="input-group">
                <label>Authoritative Domain <span style={{color: 'var(--danger)', fontSize: '12px'}}>- REQUIRED</span></label>
                <select value={marketDomain} onChange={(e) => setMarketDomain(e.target.value)} required style={{padding: '12px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', borderRadius: '6px', fontSize: '1rem', width: '100%'}}>
                  <option value="wikipedia.org">wikipedia.org (General Knowledge)</option>
                  <option value="bbc.com">bbc.com (Global News)</option>
                  <option value="reuters.com">reuters.com (Politics & Economics)</option>
                  <option value="apnews.com">apnews.com (Fast News / Elections)</option>
                  <option value="coinmarketcap.com">coinmarketcap.com (Crypto)</option>
                </select>
              </div>
              <div className="input-group">
                <label>Settlement Deadline (YYYY-MM-DD)</label>
                <input type="date" value={marketDeadline} onChange={(e) => setMarketDeadline(e.target.value)} required />
              </div>
              <button type="submit" className="btn-primary" disabled={createLoading}>
                {createLoading ? <div className="loader"></div> : 'Initialize Smart Contract'}
              </button>
            </form>
            {createMsg && <div className="result-box success">{createMsg}</div>}

            <div style={{marginTop: '25px'}}>
              <h3 style={{fontSize: '1rem', color: 'var(--text-muted)', marginBottom: '10px'}}>Quick Test Examples (Click to fill)</h3>
              <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
                <button 
                  type="button" 
                  onClick={() => {
                    setMarketQuestion("Will it rain in London tomorrow?");
                    setMarketDeadline("2026-12-31");
                  }}
                  style={{textAlign: 'left', padding: '10px', background: 'rgba(0, 210, 255, 0.05)', border: '1px dashed var(--primary-color)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem'}}
                >
                  🌧️ Weather: Rain in London? (May block AI)
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setMarketQuestion("Is Bitcoin price above $100k?");
                    setMarketDomain("coinmarketcap.com");
                    setMarketDeadline("2026-12-31");
                  }}
                  style={{textAlign: 'left', padding: '10px', background: 'rgba(255, 0, 122, 0.05)', border: '1px dashed var(--accent-color)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem'}}
                >
                  📈 Crypto: BTC {">"} $100k? (Domain: coinmarketcap.com)
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    setMarketQuestion("Is the Earth flat?");
                    setMarketDomain("wikipedia.org");
                    setMarketDeadline("2026-12-31");
                  }}
                  style={{textAlign: 'left', padding: '10px', background: 'rgba(0, 255, 136, 0.05)', border: '1px dashed var(--success)', borderRadius: '6px', color: '#fff', fontSize: '0.85rem'}}
                >
                  🌍 Science: Is Earth flat? (Domain: wikipedia.org)
                </button>
              </div>
            </div>

            <div style={{marginTop: '30px'}}>
              <h2 style={{color: 'var(--warning)', fontSize: '1.4rem'}}>🏆 Top Traders</h2>
              <div style={{display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px'}}>
                {Object.entries(allBalances).length > 0 ? (
                  Object.entries(allBalances).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([addr, bal], idx) => (
                    <div key={addr} style={{display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', borderLeft: idx === 0 ? '4px solid #ffcc00' : '4px solid rgba(255,255,255,0.1)'}}>
                      <span style={{color: idx === 0 ? '#ffcc00' : '#fff', fontWeight: 'bold'}}>{idx === 0 ? '🥇' : `${idx + 1}.`} {addr.substring(0,6)}...</span>
                      <span style={{color: 'var(--success)', fontWeight: 'bold'}}>{bal} G-USD</span>
                    </div>
                  ))
                ) : (
                  <div style={{textAlign: 'center', color: 'var(--text-muted)'}}>No active traders</div>
                )}
              </div>
            </div>
          </div>

          <div className="cyber-panel">
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '15px'}}>
              <h2 style={{borderBottom: 'none', padding: 0, margin: 0}}><span style={{color: 'var(--accent-color)'}}>🎲</span> Order Book</h2>
              <div style={{display: 'flex', gap: '10px'}}>
                <button className="btn-primary" onClick={fetchAllMarkets} style={{padding: '8px 15px', fontSize: '0.85rem', width: 'auto'}}>🔄 Sync Node</button>
              </div>
            </div>
            
            <div style={{display: 'grid', gap: '20px'}}>
              {marketIds.map(id => {
                const market = markets[id];
                if (!market) return null;
                
                const myYes = market.yes_positions?.[account.address.toLowerCase()] || 0;
                const myNo = market.no_positions?.[account.address.toLowerCase()] || 0;
                
                const totalPool = market.yes_pool + market.no_pool;
                const yesPercent = totalPool > 0 ? Math.round((market.yes_pool / totalPool) * 100) : 50;

                return (
                  <div key={id} className="market-card">
                    <h3>{market.question}</h3>
                    <div style={{fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '15px', wordBreak: 'break-all'}}>Domain: {market.authoritative_domain}</div>
                    
                    {/* Visual Progress Bar */}
                    <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '5px'}}>
                      <span style={{color: 'var(--success)'}}>YES {yesPercent}%</span>
                      <span style={{color: 'var(--danger)'}}>NO {100 - yesPercent}%</span>
                    </div>
                    <div style={{height: '6px', background: 'var(--danger)', borderRadius: '3px', display: 'flex', overflow: 'hidden', marginBottom: '15px'}}>
                      <div style={{width: `${yesPercent}%`, background: 'var(--success)', height: '100%'}}></div>
                    </div>

                    <div className="pool-info">
                      <span>Total Pool: <strong>{totalPool} GL</strong></span>
                      <span>Status: <strong style={{color: market.status === 'OPEN' ? 'var(--success)' : 'var(--warning)'}}>{market.status}</strong></span>
                    </div>
                    
                    {(myYes > 0 || myNo > 0) && (
                      <div style={{padding: '10px', background: 'rgba(0, 210, 255, 0.1)', borderRadius: '8px', border: '1px solid rgba(0, 210, 255, 0.2)', marginBottom: '15px'}}>
                        <span style={{fontSize: '0.85rem', color: 'var(--text-muted)'}}>Your Position:</span>
                        <div style={{fontWeight: 'bold', display: 'flex', gap: '15px', marginTop: '5px'}}>
                          <span style={{color: 'var(--success)'}}>YES: {myYes}</span>
                          <span style={{color: 'var(--danger)'}}>NO: {myNo}</span>
                        </div>
                      </div>
                    )}
                    
                    {market.status === 'OPEN' ? (
                        <form>
                          <div className="input-group" style={{margin: '0'}}>
                            <input type="text" value={betAmounts[id] !== undefined ? betAmounts[id] : "100"} onChange={(e) => setBetAmounts(prev => ({...prev, [id]: Number(e.target.value.replace(/[^0-9]/g, ''))}))} placeholder="Amount in G-USD" />
                          </div>
                          <div className="bet-buttons">
                            <button type="button" className="btn-yes" onClick={(e) => handleBet(e, id, true)} disabled={loadingStates[`bet_${id}`]}>BUY YES</button>
                            <button type="button" className="btn-no" onClick={(e) => handleBet(e, id, false)} disabled={loadingStates[`bet_${id}`]}>BUY NO</button>
                          </div>
                        </form>
                    ) : (
                      <div className="result-box glow">
                        {market.status === 'CLOSED_FOR_BETTING' ? '🔒 Market Frozen. Awaiting AI Tribunal.' : `Final Resolution: ${market.status}`}
                      </div>
                    )}
                    {messages[`bet_${id}`] && <div className="result-box">{messages[`bet_${id}`]}</div>}
                  </div>
                )
              })}
              {marketIds.length === 0 && <div style={{textAlign: 'center', color: 'var(--text-muted)'}}>No Markets Found. Initialize one.</div>}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'resolve' && (
        <div className="kanban-layout">
          <div className="kanban-col">
            <h2>⏳ Pending Analysis</h2>
            {pendingMarkets.map(id => (
              <div key={id} className="market-card">
                <h3>{markets[id].question}</h3>
                <div style={{fontSize: '11px', color: 'var(--text-muted)', margin: '8px 0', wordBreak: 'break-all'}}>Domain: {markets[id].authoritative_domain}</div>
                
                {markets[id].status === 'OPEN' ? (
                  <button type="button" className="btn-primary" onClick={(e) => handleCloseBetting(e, id)} disabled={loadingStates[`close_${id}`]} style={{background: 'var(--warning)', marginTop: '15px'}}>
                    {loadingStates[`close_${id}`] ? 'Locking Contract...' : '🔒 Close Betting'}
                  </button>
                ) : (
                  <div style={{marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px'}}>
                    <button type="button" className="btn-primary" onClick={(e) => handleResolve(e, id)}>
                      🤖 Summon Autonomous Tribunal
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <div className="kanban-col">
            <h2>🧠 Tribunal Processing</h2>
            {processingMarkets.map(id => (
              <div key={id} className="market-card processing">
                <div className="ai-scanning"><div className="scan-line"></div></div>
                <h3>{markets[id].question}</h3>
                <div style={{background: 'rgba(0,0,0,0.5)', padding: '15px', borderRadius: '8px', marginTop: '15px', border: '1px solid var(--accent-color)'}}>
                  <p style={{color: '#fff', fontSize:'0.9rem', fontFamily: 'Rajdhani', fontWeight: 'bold'}}>{">"} {messages[`res_${id}`]}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="kanban-col">
            <h2>✅ Final Rulings</h2>
            {resolvedMarkets.map(id => (
              <div key={id} className="market-card" style={{borderColor: markets[id].status === 'FAILED' ? 'var(--warning)' : 'var(--success)', boxShadow: 'none'}}>
                <h3 style={{fontSize: '13px'}}>{markets[id].question}</h3>
                <h2 style={{color: markets[id].status === 'FAILED' ? 'var(--warning)' : 'var(--success)', textAlign: 'center', margin: '20px 0', fontSize: '1.5rem'}}>{markets[id].status}</h2>
                
                {((markets[id].status === 'RESOLVED_YES' && (markets[id].yes_positions?.[account.address.toLowerCase()] > 0)) ||
                  (markets[id].status === 'RESOLVED_NO' && (markets[id].no_positions?.[account.address.toLowerCase()] > 0)) ||
                  (markets[id].status === 'FAILED' && (markets[id].yes_positions?.[account.address.toLowerCase()] > 0 || markets[id].no_positions?.[account.address.toLowerCase()] > 0))) && (
                  <button className="btn-primary" style={{width: '100%', background: markets[id].status === 'FAILED' ? 'var(--warning)' : 'var(--success)'}} onClick={(e) => handleClaim(e, id)} disabled={loadingStates[`claim_${id}`]}>
                    {loadingStates[`claim_${id}`] ? 'Processing Tx...' : (markets[id].status === 'FAILED' ? '🔁 Claim Refund' : '💰 Claim Payout')}
                  </button>
                )}
                
                {((markets[id].status === 'RESOLVED_YES' && (markets[id].no_positions?.[account.address.toLowerCase()] > 0)) ||
                  (markets[id].status === 'RESOLVED_NO' && (markets[id].yes_positions?.[account.address.toLowerCase()] > 0))) && (
                  <div style={{color: 'var(--danger)', textAlign: 'center', marginTop: '15px', fontSize: '0.9rem', fontWeight: 'bold'}}>
                    ❌ Prediction incorrect. Liquidity seized.
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
