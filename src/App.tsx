import { useState, useEffect } from 'react';
import './index.css';
import { createClient, createAccount } from 'genlayer-js';

// Khởi tạo GenLayer Client và Account
const client = createClient({
  endpoint: '/api/rpc'
});
const account = createAccount(import.meta.env.VITE_PRIVATE_KEY || '0x72bf6e67319555b11f47754b6eba01ce6d67fa377ce6c62437bb8677d346fd28');

// V2 Contract Address
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0x9Fba402CFa696D8c65F338BD154E2Ac84eeC4951'; 

function App() {
  const [activeTab, setActiveTab] = useState<'trade' | 'resolve'>('trade');
  
  // Market States
  const [markets, setMarkets] = useState<any>({});
  const [marketIds, setMarketIds] = useState<string[]>(() => {
    return JSON.parse(localStorage.getItem('genOracleMarkets') || '[]');
  });
  const [balance, setBalance] = useState<number>(0);
  
  const [createLoading, setCreateLoading] = useState(false);
  const [createMsg, setCreateMsg] = useState('');
  const [faucetElapsed, setFaucetElapsed] = useState(0);
  
  const [marketQuestion, setMarketQuestion] = useState("");
  const [marketUrl, setMarketUrl] = useState("");
  const [marketDeadline, setMarketDeadline] = useState("");
  
  // Bet States
  const [betAmounts, setBetAmounts] = useState<{[key: string]: number}>({});
  const [loadingStates, setLoadingStates] = useState<{[key: string]: boolean}>({});
  const [messages, setMessages] = useState<{[key: string]: string}>({});
  
  useEffect(() => {
    fetchAllMarkets();
    fetchBalance();
  }, [marketIds]);

  const fetchBalance = async () => {
    try {
      const res = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_state',
        args: []
      });
      const data = typeof res === 'string' ? JSON.parse(res) : (res.result ? JSON.parse(res.result) : {});
      if (data && data.balances) {
        // Smart contract stores balances in lowercase, so we need to match it
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
    setFaucetElapsed(0);
    try {
      await client.writeContract({
        account,
        address: CONTRACT_ADDRESS,
        functionName: 'faucet',
        args: [account.address]
      });
      // Poll until balance increases (up to 60s for GenVM BFT Consensus)
      const prevBalance = balance;
      for (let i = 1; i <= 20; i++) {
        setFaucetElapsed(i * 3);
        await new Promise(r => setTimeout(r, 3000));
        const updatedBalance = await fetchBalance();
        if (updatedBalance > prevBalance) break;
      }
    } catch(e: any) {
      alert('Faucet error: ' + e.message);
    }
    setLoadingStates(prev => ({...prev, faucet: false}));
    setFaucetElapsed(0);
  };

  const fetchAllMarkets = async () => {
    for (const id of marketIds) {
      try {
        const res = await client.readContract({
          address: CONTRACT_ADDRESS,
          functionName: 'get_market',
          args: [id]
        });
        const data = typeof res === 'string' ? JSON.parse(res) : (res.result ? JSON.parse(res.result) : {});
        if (data && data.status) {
          setMarkets((prev: any) => ({ ...prev, [id]: data }));
        }
      } catch(e) {}
    }
    fetchBalance();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!marketQuestion || !marketUrl || !marketDeadline) return;
    
    setCreateLoading(true);
    setCreateMsg('Creating market on GenLayer...');
    
    const newMarketId = Date.now().toString();
    
    try {
      await client.writeContract({
        account,
        address: CONTRACT_ADDRESS,
        functionName: 'create_market',
        args: [newMarketId, marketQuestion, marketUrl, marketDeadline]
      });
      
      const newIds = [newMarketId, ...marketIds];
      setMarketIds(newIds);
      localStorage.setItem('genOracleMarkets', JSON.stringify(newIds));
      
      // Poll until market appears on blockchain
      setCreateMsg('Waiting for blockchain confirmation...');
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
      setCreateMsg('✅ Market created successfully!');
      setMarketQuestion('');
      setMarketUrl('');
      setMarketDeadline('');
    } catch(err: any) {
      setCreateMsg('Error: ' + err.message);
    }
    setCreateLoading(false);
  };

  const handleBet = async (e: React.FormEvent, id: string, isYes: boolean) => {
    e.preventDefault();
    setLoadingStates(prev => ({...prev, [`bet_${id}`]: true}));
    setMessages(prev => ({...prev, [`bet_${id}`]: `Placing ${isYes ? 'YES' : 'NO'} bet...`}));
    
    const amount = betAmounts[id] || 100;
    
    try {
      await client.writeContract({
        account,
        address: CONTRACT_ADDRESS,
        functionName: 'place_bet',
        args: [id, account.address.toLowerCase(), isYes, amount]
      });
      await new Promise(r => setTimeout(r, 4000));
      await fetchAllMarkets();
      setMessages(prev => ({...prev, [`bet_${id}`]: `Success: Bet placed on ${isYes ? 'YES' : 'NO'}.`}));
    } catch(err: any) {
      setMessages(prev => ({...prev, [`bet_${id}`]: 'Error: ' + err.message}));
    }
    setLoadingStates(prev => ({...prev, [`bet_${id}`]: false}));
  };

  const handleResolve = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    setLoadingStates(prev => ({...prev, [`res_${id}`]: true}));
    setMessages(prev => ({...prev, [`res_${id}`]: 'Sending to AI Oracle...'}));
    
    client.writeContract({
      account, address: CONTRACT_ADDRESS, functionName: 'resolve_market', args: [id]
    }).catch(console.error);

    let attempt = 0;
    const interval = setInterval(async () => {
      attempt++;
      setMessages(prev => ({...prev, [`res_${id}`]: `AI Validators reading source... (${attempt * 5}s elapsed)`}));
      await fetchAllMarkets();
      // Check if market moved out of OPEN state
      const res = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_market',
        args: [id]
      }).catch(() => null);
      if (res) {
        const data = typeof res === 'string' ? JSON.parse(res) : (res.result ? JSON.parse(res.result) : {});
        if (data.status && data.status !== 'OPEN') {
          clearInterval(interval);
          setLoadingStates(prev => ({...prev, [`res_${id}`]: false}));
          setMarkets((prev: any) => ({ ...prev, [id]: data }));
          return;
        }
      }
      if (attempt >= 40) {
        clearInterval(interval);
        setLoadingStates(prev => ({...prev, [`res_${id}`]: false}));
        setMessages(prev => ({...prev, [`res_${id}`]: 'Timeout - GenVM network may be congested. Refresh to check.'}));
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
      alert("Error claiming: " + err.message);
    }
    setLoadingStates(prev => ({...prev, [`claim_${id}`]: false}));
  };

  const [walletConnected, setWalletConnected] = useState(false);
  
  const pendingMarkets = marketIds.filter(id => markets[id] && (markets[id].status === 'OPEN' || markets[id].status === 'LOCKED') && !loadingStates[`res_${id}`]);
  const processingMarkets = marketIds.filter(id => loadingStates[`res_${id}`]);
  const resolvedMarkets = marketIds.filter(id => markets[id] && (markets[id].status.startsWith('RESOLVED') || markets[id].status === 'FAILED'));

  return (
    <div className="app-container">
      <div className="top-nav" style={{display: 'flex', justifyContent: 'flex-end', padding: '15px 30px', gap: '15px'}}>
        {!walletConnected ? (
          <button className="btn-primary" onClick={() => setWalletConnected(true)}>
            🔗 Connect GenLayer Wallet
          </button>
        ) : (
          <>
            <button className="btn-secondary" onClick={handleFaucet} disabled={loadingStates.faucet || balance >= 1000} style={(loadingStates.faucet || balance >= 1000) ? {background: 'rgba(255,255,255,0.05)', color: '#888', borderColor: '#444'} : {}}>
              {loadingStates.faucet ? `⏳ Awaiting Consensus... (${faucetElapsed}s)` : (balance >= 1000 ? '✅ Faucet Limit Reached' : '🏦 Request 1000 G-USD')}
            </button>
            <div style={{background: 'rgba(0, 255, 136, 0.1)', border: '1px solid #00ff88', padding: '8px 15px', borderRadius: '20px', color: '#00ff88', display: 'flex', alignItems: 'center', gap: '8px'}}>
              <div style={{width: '8px', height: '8px', background: '#00ff88', borderRadius: '50%'}}></div>
              {account.address.substring(0, 6)}... | 💰 {balance} G-USD
            </div>
          </>
        )}
      </div>

      <div className="cyber-header" style={{paddingTop: '0'}}>
        <h1>GEN<span className="highlight">ORACLE</span> V2</h1>
        <p>DeFi Prediction Market Powered by GenVM AI & Objective Timing</p>
      </div>

      <div className="tab-container">
        <button className={`tab-btn ${activeTab === 'trade' ? 'active' : ''}`} onClick={() => setActiveTab('trade')}>
          Markets & Trading
        </button>
        <button className={`tab-btn ${activeTab === 'resolve' ? 'active' : ''}`} onClick={() => setActiveTab('resolve')}>
          AI Resolution (Oracle)
        </button>
      </div>

      {activeTab === 'trade' && (
        <div className="grid-layout">
          <div className="cyber-panel">
            <h2><span className="icon">⚡</span> Create New Market</h2>
            <form onSubmit={handleCreate}>
              <div className="input-group">
                <label>Question to Predict</label>
                <input type="text" value={marketQuestion} onChange={(e) => setMarketQuestion(e.target.value)} required />
              </div>
              <div className="input-group">
                <label>Source of Truth (News URL)</label>
                <input type="url" value={marketUrl} onChange={(e) => setMarketUrl(e.target.value)} required />
              </div>
              <div className="input-group">
                <label>Objective Deadline (YYYY-MM-DD)</label>
                <input type="date" value={marketDeadline} onChange={(e) => setMarketDeadline(e.target.value)} required />
              </div>
              <button type="submit" className="btn-primary" disabled={createLoading}>
                {createLoading ? <div className="loader"></div> : 'Initialize Market'}
              </button>
            </form>
            {createMsg && <div className="result-box success">{createMsg}</div>}

            <div style={{marginTop: '25px', padding: '15px', background: 'rgba(0, 210, 255, 0.05)', borderRadius: '8px', border: '1px solid rgba(0, 210, 255, 0.2)'}}>
              <h3 style={{fontSize: '13px', color: '#00d2ff', marginBottom: '10px'}}>🎯 Quick Test Examples (Click to fill)</h3>
              
              <div 
                className="example-item" 
                style={{marginBottom: '10px', padding: '10px', background: 'rgba(0,0,0,0.3)', cursor: 'pointer', borderRadius: '4px', fontSize: '12px'}}
                onClick={() => {
                  setMarketQuestion('Did Argentina win the 2022 FIFA World Cup?');
                  setMarketUrl('https://en.wikipedia.org/wiki/2022_FIFA_World_Cup_final');
                  setMarketDeadline('2022-12-19');
                }}
              >
                <strong>Sports:</strong> Did Argentina win the 2022 FIFA World Cup?
              </div>
              
              <div 
                className="example-item" 
                style={{marginBottom: '10px', padding: '10px', background: 'rgba(0,0,0,0.3)', cursor: 'pointer', borderRadius: '4px', fontSize: '12px'}}
                onClick={() => {
                  setMarketQuestion('Is SpaceX Starship the tallest rocket ever built?');
                  setMarketUrl('https://en.wikipedia.org/wiki/SpaceX_Starship');
                  setMarketDeadline('2023-01-01');
                }}
              >
                <strong>Space:</strong> Is SpaceX Starship the tallest rocket ever built?
              </div>

              <div 
                className="example-item" 
                style={{padding: '10px', background: 'rgba(0,0,0,0.3)', cursor: 'pointer', borderRadius: '4px', fontSize: '12px'}}
                onClick={() => {
                  setMarketQuestion('Did Apple release the Vision Pro in 2024?');
                  setMarketUrl('https://en.wikipedia.org/wiki/Apple_Vision_Pro');
                  setMarketDeadline('2024-03-01');
                }}
              >
                <strong>Tech:</strong> Did Apple release the Vision Pro in 2024?
              </div>
            </div>
          </div>

          <div className="cyber-panel">
            <h2><span className="icon">🎲</span> Active Markets</h2>
            <div style={{display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap'}}>
              <button className="btn-primary" onClick={fetchAllMarkets} style={{padding: '8px 15px', fontSize: '12px', flex: '1', minWidth: '120px'}}>🔄 Refresh Status</button>
              <button onClick={() => { if(window.confirm('Clear all market history?')) { setMarketIds([]); setMarkets({}); localStorage.removeItem('genOracleMarkets'); }}} style={{padding: '8px 15px', fontSize: '12px', flex: '1', minWidth: '120px', background: '#c0392b', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer'}}>🗑️ Clear History</button>
            </div>
            {marketIds.map(id => {
              const market = markets[id];
              if (!market) return null;
              
              const myYes = market.yes_positions?.[account.address] || 0;
              const myNo = market.no_positions?.[account.address] || 0;

              return (
                <div key={id} className="market-card" style={{marginBottom: '20px'}}>
                  <h3 style={{fontSize: '14px', borderBottom: '1px solid #333', paddingBottom: '10px'}}>{market.question}</h3>
                  <div className="pool-info" style={{fontSize: '12px', marginTop: '10px'}}>
                    <span>Deadline: {market.deadline}</span>
                    <span>YES Pool: {market.yes_pool} GL</span>
                    <span>NO Pool: {market.no_pool} GL</span>
                    <span>Status: {market.status}</span>
                  </div>
                  {(myYes > 0 || myNo > 0) && (
                    <div style={{color: '#00d2ff', fontSize: '12px', marginTop: '5px'}}>Your Positions: YES ({myYes}) / NO ({myNo})</div>
                  )}
                  
                  {market.status === 'OPEN' ? (
                    <form>
                      <div className="input-group" style={{marginTop: '10px'}}>
                        <input type="number" value={betAmounts[id] || 100} onChange={(e) => setBetAmounts(prev => ({...prev, [id]: Number(e.target.value)}))} min="1" />
                      </div>
                      <div className="bet-buttons">
                        <button type="button" className="btn-yes" onClick={(e) => handleBet(e, id, true)} disabled={loadingStates[`bet_${id}`]}>BET YES</button>
                        <button type="button" className="btn-no" onClick={(e) => handleBet(e, id, false)} disabled={loadingStates[`bet_${id}`]}>BET NO</button>
                      </div>
                    </form>
                  ) : (
                    <div className="result-box glow" style={{marginTop: '10px'}}>Resolved: {market.status}</div>
                  )}
                  {messages[`bet_${id}`] && <div className="result-box">{messages[`bet_${id}`]}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {activeTab === 'resolve' && (
        <div className="kanban-layout">
          <div className="kanban-col">
            <h2>⏳ Pending AI Analysis</h2>
            {pendingMarkets.map(id => (
              <div key={id} className="market-card">
                <h3>{markets[id].question}</h3>
                <div style={{fontSize: '11px', color: '#aaa', margin: '8px 0', wordBreak: 'break-all'}}>{markets[id].source_url}</div>
                <div style={{fontSize: '11px', color: '#ff3366', marginBottom: '12px'}}>Deadline: {markets[id].deadline}</div>
                <button type="button" className="btn-resolve" onClick={(e) => handleResolve(e, id)}>
                  🤖 Trigger GenLayer AI
                </button>
              </div>
            ))}
          </div>
          
          <div className="kanban-col">
            <h2>🧠 GenVM Processing</h2>
            {processingMarkets.map(id => (
              <div key={id} className="market-card processing">
                <div className="ai-scanning"><div className="scan-line"></div></div>
                <h3>{markets[id].question}</h3>
                <p style={{color: '#ffd700', fontSize:'12px', marginTop:'10px'}}>{messages[`res_${id}`]}</p>
              </div>
            ))}
          </div>

          <div className="kanban-col">
            <h2>✅ Resolved Markets</h2>
            {resolvedMarkets.map(id => (
              <div key={id} className="market-card success glow">
                <h3 style={{fontSize: '13px'}}>{markets[id].question}</h3>
                <h2 style={{color: '#00ff88', textAlign: 'center', margin: '15px 0'}}>{markets[id].status}</h2>
                {((markets[id].status === 'RESOLVED_YES' && (markets[id].yes_positions?.[account.address] > 0 || markets[id].yes_positions?.[account.address.toLowerCase()] > 0)) ||
                  (markets[id].status === 'RESOLVED_NO' && (markets[id].no_positions?.[account.address] > 0 || markets[id].no_positions?.[account.address.toLowerCase()] > 0)) ||
                  (markets[id].status === 'FAILED' && (markets[id].yes_positions?.[account.address] > 0 || markets[id].yes_positions?.[account.address.toLowerCase()] > 0 || markets[id].no_positions?.[account.address] > 0 || markets[id].no_positions?.[account.address.toLowerCase()] > 0))) && (
                  <button className="btn-primary" style={{width: '100%', background: '#ff007f'}} onClick={(e) => handleClaim(e, id)} disabled={loadingStates[`claim_${id}`]}>
                    {loadingStates[`claim_${id}`] ? 'Claiming...' : '💰 Claim Payout / Refund'}
                  </button>
                )}
                
                {((markets[id].status === 'RESOLVED_YES' && (markets[id].no_positions?.[account.address] > 0 || markets[id].no_positions?.[account.address.toLowerCase()] > 0)) ||
                  (markets[id].status === 'RESOLVED_NO' && (markets[id].yes_positions?.[account.address] > 0 || markets[id].yes_positions?.[account.address.toLowerCase()] > 0))) && (
                  <div style={{color: '#ff4444', textAlign: 'center', marginTop: '10px', fontSize: '14px', fontWeight: 'bold'}}>
                    ❌ Your prediction was incorrect. No payout.
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
