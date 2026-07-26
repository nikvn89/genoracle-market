import { useState, useEffect } from 'react';
import './index.css';
import { createClient, createAccount } from 'genlayer-js';

// Khởi tạo GenLayer Client và Account
const client = createClient({
  endpoint: '/api/rpc'
});
const account = createAccount(import.meta.env.VITE_PRIVATE_KEY || '0x32ddb03a893081e7dff1b1ef732a3d0cb8dccdf41ea87bcce09338b76176378f');

// THAY ĐỊA CHỈ CONTRACT SAU KHI DEPLOY VÀO ĐÂY!
const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0xAF6d04CbcF8E25046ac6118f5Ea9148D9E4D1Ed5'; 

function App() {
  const [activeTab, setActiveTab] = useState<'trade' | 'resolve'>('trade');
  
  // Market States
  const [markets, setMarkets] = useState<any>({});
  const [marketId, setMarketId] = useState('1');
  
  // Create Market States
  const [createLoading, setCreateLoading] = useState(false);
  const [createMsg, setCreateMsg] = useState('');
  
  const [marketQuestion, setMarketQuestion] = useState("Did Argentina win the 2022 FIFA World Cup?");
  const [marketUrl, setMarketUrl] = useState("https://en.wikipedia.org/wiki/2022_FIFA_World_Cup_final");
  
  // Bet States
  const [betLoading, setBetLoading] = useState(false);
  const [betMsg, setBetMsg] = useState('');
  
  // Kanban Resolve States
  const [resolveStatus, setResolveStatus] = useState<'idle' | 'analyzing' | 'resolved'>('idle');
  const [resolveMsg, setResolveMsg] = useState('');
  
  useEffect(() => {
    fetchMarketData();
  }, [marketId]);

  const [fetchError, setFetchError] = useState('');

  const fetchMarketData = async (idToFetch = marketId) => {
    try {
      setFetchError('');
      const res = await client.readContract({
        address: CONTRACT_ADDRESS,
        functionName: 'get_market',
        args: [idToFetch]
      });
      const data = typeof res === 'string' ? JSON.parse(res) : (res.result ? JSON.parse(res.result) : {});
      if (data && data.status) {
        setMarkets(prev => ({ ...prev, [idToFetch]: data }));
        if (data.status.includes('RESOLVED') || data.status === 'FAILED') {
          setResolveStatus('resolved');
        }
      } else {
        setFetchError('Market not found on GenLayer yet.');
      }
    } catch(e: any) {
      setFetchError(e.message || 'Error fetching data');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateMsg('Creating market on GenLayer...');
    try {
      await client.writeContract({
        account,
        address: CONTRACT_ADDRESS,
        functionName: 'create_market',
        args: [
          marketId,
          marketQuestion,
          marketUrl
        ]
      });
      
      // Poll for 15 seconds to wait for block minting
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 3000));
        await fetchMarketData(marketId);
        // If markets[marketId] exists (which fetchMarketData updates via state setter? No, fetchMarketData updates state asynchronously)
        // Wait, fetchMarketData doesn't return data. Let's just poll.
      }
      setCreateMsg('Success: Market created on GenLayer. Data fetched.');
    } catch(err: any) {
      setCreateMsg('Error: ' + err.message);
    }
    setCreateLoading(false);
  };

  const handleBet = async (e: React.FormEvent, isYes: boolean) => {
    e.preventDefault();
    setBetLoading(true);
    setBetMsg(`Placing ${isYes ? 'YES' : 'NO'} bet...`);
    try {
      await client.writeContract({
        account,
        address: CONTRACT_ADDRESS,
        functionName: 'place_bet',
        args: [marketId, isYes, 100]
      });
      await new Promise(r => setTimeout(r, 4000));
      await fetchMarketData();
      setBetMsg(`Success: Bet placed on ${isYes ? 'YES' : 'NO'}.`);
    } catch(err: any) {
      setBetMsg('Error: ' + err.message);
    }
    setBetLoading(false);
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    setResolveStatus('analyzing');
    setResolveMsg('Triggering AI Oracle...');
    
    // Asynchronous background call
    client.writeContract({
      account,
      address: CONTRACT_ADDRESS,
      functionName: 'resolve_market',
      args: [marketId]
    }).catch(console.error);

    // Bắt đầu Polling vòng lặp kiểm tra
    let attempt = 0;
    const interval = setInterval(async () => {
      attempt++;
      setResolveMsg(`AI Validators are reading the news... (Attempt ${attempt}/30)`);
      try {
        const res = await client.readContract({
          address: CONTRACT_ADDRESS,
          functionName: 'get_market',
          args: [marketId]
        });
        const data = typeof res === 'string' ? JSON.parse(res) : (res.result ? JSON.parse(res.result) : {});
        
        if (data.status === 'RESOLVED_YES' || data.status === 'RESOLVED_NO' || data.status === 'FAILED') {
          clearInterval(interval);
          setResolveStatus('resolved');
          setResolveMsg(`Resolution Complete: Outcome is ${data.status}.`);
          fetchMarketData();
        }
      } catch(err) {
        // Ignore read errors
      }
      
      if (attempt >= 30) {
        clearInterval(interval);
        setResolveMsg('Still waiting for AI consensus. This can take up to 2-3 minutes on GenLayer StudioNet...');
      }
    }, 5000); // Poll mỗi 5s
  };

  const market = markets[marketId];

  return (
    <div className="app-container">
      <div className="cyber-header">
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
                <label>Market ID</label>
                <input 
                  type="text" 
                  value={marketId}
                  onChange={(e) => {
                    setMarketId(e.target.value);
                    setCreateMsg('');
                    setBetMsg('');
                    setResolveMsg('');
                    setResolveStatus('idle');
                  }}
                />
              </div>
              <div className="input-group">
                <label>Question to Predict</label>
                <input 
                  type="text" 
                  value={marketQuestion}
                  onChange={(e) => setMarketQuestion(e.target.value)}
                  disabled={!!market}
                />
              </div>
              <div className="input-group">
                <label>Source of Truth (News URL)</label>
                <input 
                  type="url" 
                  value={marketUrl}
                  onChange={(e) => setMarketUrl(e.target.value)}
                  disabled={!!market}
                />
              </div>
              <button type="submit" className="btn-primary" disabled={createLoading || !!market}>
                {createLoading ? <div className="loader"></div> : (market ? 'Market Exists' : 'Initialize Market')}
              </button>
            </form>
            {createMsg && <div className="result-box success">{createMsg}</div>}
          </div>

          {/* Place Bet Panel */}
          <div className="cyber-panel">
            <h2><span className="icon">🎲</span> Place a Bet</h2>
            {market ? (
              <div className="market-card">
                <h3>Market #1: {market.question}</h3>
                <div className="pool-info">
                  <span>YES Pool: {market.yes_bets} GL</span>
                  <span>NO Pool: {market.no_bets} GL</span>
                  <span>Status: {market.status}</span>
                </div>
                {market.status === 'OPEN' ? (
                  <form>
                    <div className="input-group">
                      <label>Bet Amount (Tokens)</label>
                      <input type="number" readOnly value="100" />
                    </div>
                    <div className="bet-buttons">
                      <button type="button" className="btn-yes" onClick={(e) => handleBet(e, true)} disabled={betLoading}>
                        BET YES
                      </button>
                      <button type="button" className="btn-no" onClick={(e) => handleBet(e, false)} disabled={betLoading}>
                        BET NO
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="result-box glow">Market is closed. Result: {market.status}</div>
                )}
                {betLoading && <div className="loader" style={{margin: '10px auto'}}></div>}
                {betMsg && <div className="result-box">{betMsg}</div>}
              </div>
            ) : (
              <div style={{color: '#888'}}>
                <p>Initialize market first.</p>
                {fetchError && <p style={{color: '#ff4444', marginTop: '10px'}}>{fetchError}</p>}
                <button type="button" className="btn-secondary" style={{marginTop: '15px'}} onClick={() => fetchMarketData(marketId)}>
                  Refresh Status
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'resolve' && (
        <div className="kanban-layout">
          {/* Column 1: Awaiting Resolution */}
          <div className="kanban-col">
            <h2>⏳ Pending AI Analysis</h2>
            {market && market.status === 'OPEN' && resolveStatus === 'idle' && (
              <div className="market-card">
                <h3>#1: {market.question}</h3>
                <p style={{fontSize: '12px', color:'#aaa', wordBreak:'break-all'}}>{market.source_url}</p>
                <button type="button" className="btn-resolve" onClick={handleResolve}>
                  Trigger GenLayer AI
                </button>
              </div>
            )}
            {!market && <p style={{color: '#555'}}>No markets initialized.</p>}
          </div>
          
          {/* Column 2: Analyzing (Asynchronous UX) */}
          <div className="kanban-col">
            <h2>🧠 GenVM Processing</h2>
            {resolveStatus === 'analyzing' && (
              <div className="market-card processing">
                <div className="ai-scanning">
                  <div className="scan-line"></div>
                </div>
                <h3>#1: Analyzing the news...</h3>
                <p style={{color: '#ffd700', fontSize:'13px', marginTop:'10px'}}>{resolveMsg}</p>
              </div>
            )}
          </div>

          {/* Column 3: Resolved */}
          <div className="kanban-col">
            <h2>✅ Resolved Markets</h2>
            {resolveStatus === 'resolved' && market && (
              <div className="market-card success glow">
                <h3>#1: Market Finalized</h3>
                <h2 style={{color: '#00ff88', textAlign: 'center', margin: '20px 0'}}>
                  {market.status}
                </h2>
                <p style={{fontSize: '12px', textAlign: 'center'}}>Smart Contract funds atomically distributed to winners.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
