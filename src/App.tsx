import { useState, useEffect } from 'react';
import './index.css';
import { createClient, createAccount } from 'genlayer-js';

// Khởi tạo GenLayer Client và Account
const client = createClient({
  endpoint: '/api/rpc'
});
const account = createAccount(import.meta.env.VITE_PRIVATE_KEY || '0x72bf6e67319555b11f47754b6eba01ce6d67fa377ce6c62437bb8677d346fd28');

// THAY ĐỊA CHỈ CONTRACT SAU KHI DEPLOY VÀO ĐÂY!
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0xAF6d04CbcF8E25046ac6118f5Ea9148D9E4D1Ed5'; 

function App() {
  const [activeTab, setActiveTab] = useState<'trade' | 'resolve'>('trade');
  
  // Market States
  const [markets, setMarkets] = useState<any>({});
  const [marketIds, setMarketIds] = useState<string[]>(() => {
    return JSON.parse(localStorage.getItem('genOracleMarkets') || '[]');
  });
  
  // Create Market States
  const [createLoading, setCreateLoading] = useState(false);
  const [createMsg, setCreateMsg] = useState('');
  
  const [marketQuestion, setMarketQuestion] = useState("");
  const [marketUrl, setMarketUrl] = useState("");
  
  // Bet States
  const [betAmounts, setBetAmounts] = useState<{[key: string]: number}>({});
  const [loadingStates, setLoadingStates] = useState<{[key: string]: boolean}>({});
  const [messages, setMessages] = useState<{[key: string]: string}>({});
  
  useEffect(() => {
    fetchAllMarkets();
  }, [marketIds]);

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
          setMarkets(prev => ({ ...prev, [id]: data }));
        }
      } catch(e) {
        console.error(`Error fetching market ${id}`);
      }
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!marketQuestion || !marketUrl) return;
    
    setCreateLoading(true);
    setCreateMsg('Creating market on GenLayer...');
    
    // Auto generate a unique ID
    const newMarketId = Date.now().toString();
    
    try {
      await client.writeContract({
        account,
        address: CONTRACT_ADDRESS,
        functionName: 'create_market',
        args: [newMarketId, marketQuestion, marketUrl]
      });
      
      const newIds = [newMarketId, ...marketIds];
      setMarketIds(newIds);
      localStorage.setItem('genOracleMarkets', JSON.stringify(newIds));
      
      // Poll for block minting
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const res = await client.readContract({
            address: CONTRACT_ADDRESS,
            functionName: 'get_market',
            args: [newMarketId]
          });
          const data = typeof res === 'string' ? JSON.parse(res) : (res.result ? JSON.parse(res.result) : {});
          if (data && data.status) {
            setMarkets(prev => ({ ...prev, [newMarketId]: data }));
            break; // Break early if minted
          }
        } catch(e) {}
      }
      setCreateMsg('Success: Market created on GenLayer.');
      setMarketQuestion('');
      setMarketUrl('');
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
        args: [id, isYes, amount]
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
    setMessages(prev => ({...prev, [`res_${id}`]: 'Triggering AI Oracle...'}));
    
    // Async call
    client.writeContract({
      account,
      address: CONTRACT_ADDRESS,
      functionName: 'resolve_market',
      args: [id]
    }).catch(console.error);

    let attempt = 0;
    const interval = setInterval(async () => {
      attempt++;
      setMessages(prev => ({...prev, [`res_${id}`]: `AI Validators reading news... (Attempt ${attempt}/30)`}));
      try {
        const res = await client.readContract({
          address: CONTRACT_ADDRESS,
          functionName: 'get_market',
          args: [id]
        });
        const data = typeof res === 'string' ? JSON.parse(res) : (res.result ? JSON.parse(res.result) : {});
        
        if (data.status === 'RESOLVED_YES' || data.status === 'RESOLVED_NO' || data.status === 'FAILED') {
          clearInterval(interval);
          setLoadingStates(prev => ({...prev, [`res_${id}`]: false}));
          setMessages(prev => ({...prev, [`res_${id}`]: `Resolution Complete: ${data.status}`}));
          fetchAllMarkets();
        }
      } catch(err) {}
      
      if (attempt >= 30) {
        clearInterval(interval);
        setMessages(prev => ({...prev, [`res_${id}`]: 'Still waiting for AI consensus (Network congestion)...'}));
      }
    }, 5000);
  };

  const [walletConnected, setWalletConnected] = useState(false);
  
  // Filter markets for Kanban
  const pendingMarkets = marketIds.filter(id => markets[id] && markets[id].status === 'OPEN' && !loadingStates[`res_${id}`]);
  const processingMarkets = marketIds.filter(id => loadingStates[`res_${id}`]);
  const resolvedMarkets = marketIds.filter(id => markets[id] && markets[id].status !== 'OPEN');

  const handleConnectWallet = () => {
    setWalletConnected(true);
  };

  return (
    <div className="app-container">
      <div className="top-nav" style={{display: 'flex', justifyContent: 'flex-end', padding: '15px 30px'}}>
        {!walletConnected ? (
          <button 
            className="btn-primary" 
            style={{background: 'linear-gradient(90deg, #ff007f 0%, #7928ca 100%)', border: 'none', padding: '10px 20px', borderRadius: '20px'}}
            onClick={handleConnectWallet}
          >
            🔗 Connect GenLayer Wallet
          </button>
        ) : (
          <div style={{background: 'rgba(0, 255, 136, 0.1)', border: '1px solid #00ff88', padding: '8px 15px', borderRadius: '20px', color: '#00ff88', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px'}}>
            <div style={{width: '8px', height: '8px', background: '#00ff88', borderRadius: '50%', boxShadow: '0 0 8px #00ff88'}}></div>
            {account.address.substring(0, 6)}...{account.address.substring(account.address.length - 4)}
          </div>
        )}
      </div>

      <div className="cyber-header" style={{paddingTop: '0'}}>
        <h1>GEN<span className="highlight">ORACLE</span></h1>
        <p>Intelligent Prediction Market Powered by GenVM AI</p>
      </div>

      <div className="tab-container">
        <button 
          className={`tab-btn ${activeTab === 'trade' ? 'active' : ''}`}
          onClick={() => setActiveTab('trade')}
        >
          Markets & Trading
        </button>
        <button 
          className={`tab-btn ${activeTab === 'resolve' ? 'active' : ''}`}
          onClick={() => setActiveTab('resolve')}
        >
          AI Resolution (Oracle)
        </button>
      </div>

      {activeTab === 'trade' && (
        <div className="grid-layout">
          {/* Create Market Panel */}
          <div className="cyber-panel">
            <h2><span className="icon">⚡</span> Create New Market</h2>
            <form onSubmit={handleCreate}>
              <div className="input-group">
                <label>Question to Predict</label>
                <input 
                  type="text" 
                  value={marketQuestion}
                  onChange={(e) => setMarketQuestion(e.target.value)}
                  placeholder="e.g. Will Bitcoin reach 100k?"
                  required
                />
              </div>
              <div className="input-group">
                <label>Source of Truth (News URL)</label>
                <input 
                  type="url" 
                  value={marketUrl}
                  onChange={(e) => setMarketUrl(e.target.value)}
                  placeholder="https://en.wikipedia.org/wiki/..."
                  required
                />
              </div>
              <button type="submit" className="btn-primary" disabled={createLoading}>
                {createLoading ? <div className="loader"></div> : 'Initialize Market'}
              </button>
            </form>
            {createMsg && <div className="result-box success">{createMsg}</div>}
            
            <div style={{marginTop: '25px', padding: '15px', background: 'rgba(0, 255, 136, 0.05)', borderRadius: '8px', border: '1px solid rgba(0, 255, 136, 0.2)'}}>
              <h3 style={{fontSize: '13px', color: '#00ff88', marginBottom: '10px'}}>🎯 Quick Test Examples (Click to fill)</h3>
              
              <div 
                className="example-item" 
                style={{marginBottom: '10px', padding: '10px', background: 'rgba(0,0,0,0.3)', cursor: 'pointer', borderRadius: '4px', fontSize: '12px'}}
                onClick={() => {
                  setMarketQuestion('Did Argentina win the 2022 FIFA World Cup?');
                  setMarketUrl('https://en.wikipedia.org/wiki/2022_FIFA_World_Cup_final');
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
                }}
              >
                <strong>Tech:</strong> Did Apple release the Vision Pro in 2024?
              </div>
            </div>
          </div>

          {/* Place Bet Panel */}
          <div className="cyber-panel">
            <h2><span className="icon">🎲</span> Active Markets (Your History)</h2>
            <div style={{display: 'flex', gap: '10px', marginBottom: '15px'}}>
              <button className="btn-primary" onClick={fetchAllMarkets} style={{width: 'auto', padding: '8px 15px', fontSize: '12px'}}>
                🔄 Refresh Status
              </button>
              <button 
                className="btn-secondary" 
                onClick={() => {
                  if (window.confirm("Are you sure you want to clear your local market history? (This does not delete data from the blockchain)")) {
                    setMarketIds([]);
                    localStorage.removeItem('genOracleMarkets');
                  }
                }} 
                style={{width: 'auto', padding: '8px 15px', fontSize: '12px', background: '#333'}}
              >
                🗑️ Clear History
              </button>
            </div>
            
            {marketIds.length === 0 && <p style={{color: '#888'}}>No markets created yet.</p>}
            
            {marketIds.map(id => {
              const market = markets[id];
              if (!market) return (
                <div key={id} className="market-card" style={{marginBottom: '20px', border: '1px dashed #ffd700'}}>
                  <div className="loader" style={{margin: '10px auto'}}></div>
                  <p style={{textAlign: 'center', fontSize: '12px', color: '#ffd700'}}>
                    Blockchain is processing this market... (Pending)
                  </p>
                </div>
              );
              
              return (
                <div key={id} className="market-card" style={{marginBottom: '20px'}}>
                  <h3 style={{fontSize: '14px', borderBottom: '1px solid #333', paddingBottom: '10px'}}>
                    {market.question}
                  </h3>
                  <div className="pool-info">
                    <span>YES Pool: {market.yes_bets} GL</span>
                    <span>NO Pool: {market.no_bets} GL</span>
                    <span>Status: {market.status}</span>
                  </div>
                  
                  {market.status === 'OPEN' ? (
                    <form>
                      <div className="input-group" style={{marginTop: '10px'}}>
                        <label style={{fontSize: '11px'}}>Bet Amount (Tokens)</label>
                        <input 
                          type="number" 
                          value={betAmounts[id] || 100} 
                          onChange={(e) => setBetAmounts(prev => ({...prev, [id]: Number(e.target.value)}))} 
                          min="1"
                        />
                      </div>
                      <div className="bet-buttons">
                        <button type="button" className="btn-yes" onClick={(e) => handleBet(e, id, true)} disabled={loadingStates[`bet_${id}`]}>
                          BET YES
                        </button>
                        <button type="button" className="btn-no" onClick={(e) => handleBet(e, id, false)} disabled={loadingStates[`bet_${id}`]}>
                          BET NO
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="result-box glow" style={{marginTop: '10px'}}>Resolved: {market.status}</div>
                  )}
                  {loadingStates[`bet_${id}`] && <div className="loader" style={{margin: '10px auto'}}></div>}
                  {messages[`bet_${id}`] && <div className="result-box">{messages[`bet_${id}`]}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {activeTab === 'resolve' && (
        <div className="kanban-layout">
          {/* Column 1: Awaiting Resolution */}
          <div className="kanban-col">
            <h2>⏳ Pending AI Analysis</h2>
            {pendingMarkets.map(id => (
              <div key={id} className="market-card">
                <h3>{markets[id].question}</h3>
                <p style={{fontSize: '11px', color:'#aaa', wordBreak:'break-all', marginBottom: '10px'}}>{markets[id].source_url}</p>
                <button type="button" className="btn-resolve" onClick={(e) => handleResolve(e, id)}>
                  Trigger GenLayer AI
                </button>
              </div>
            ))}
            {pendingMarkets.length === 0 && <p style={{color: '#555'}}>No pending markets.</p>}
          </div>
          
          {/* Column 2: Analyzing (Asynchronous UX) */}
          <div className="kanban-col">
            <h2>🧠 GenVM Processing</h2>
            {processingMarkets.map(id => (
              <div key={id} className="market-card processing">
                <div className="ai-scanning"><div className="scan-line"></div></div>
                <h3>{markets[id].question}</h3>
                <p style={{color: '#ffd700', fontSize:'12px', marginTop:'10px'}}>{messages[`res_${id}`]}</p>
              </div>
            ))}
            {processingMarkets.length === 0 && <p style={{color: '#555'}}>No AI processing running.</p>}
          </div>

          {/* Column 3: Resolved */}
          <div className="kanban-col">
            <h2>✅ Resolved Markets</h2>
            {resolvedMarkets.map(id => (
              <div key={id} className="market-card success glow">
                <h3 style={{fontSize: '13px'}}>{markets[id].question}</h3>
                <h2 style={{color: '#00ff88', textAlign: 'center', margin: '15px 0'}}>
                  {markets[id].status}
                </h2>
              </div>
            ))}
            {resolvedMarkets.length === 0 && <p style={{color: '#555'}}>No resolved markets.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
