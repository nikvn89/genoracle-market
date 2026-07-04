import { useState } from 'react';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState<'trade' | 'resolve'>('trade');
  
  // Create Market States
  const [createLoading, setCreateLoading] = useState(false);
  const [createMsg, setCreateMsg] = useState('');
  
  // Bet States
  const [betLoading, setBetLoading] = useState(false);
  const [betMsg, setBetMsg] = useState('');
  
  // Resolve States
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveMsg, setResolveMsg] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateMsg('');
    setTimeout(() => {
      setCreateLoading(false);
      setCreateMsg('Success: Market "Will Space X launch Starship in July?" created on GenLayer.');
    }, 1500);
  };

  const handleBet = (e: React.FormEvent, isYes: boolean) => {
    e.preventDefault();
    setBetLoading(true);
    setBetMsg('');
    setTimeout(() => {
      setBetLoading(false);
      setBetMsg(`Success: Bet placed on ${isYes ? 'YES' : 'NO'}.`);
    }, 1500);
  };

  const handleResolve = (e: React.FormEvent) => {
    e.preventDefault();
    setResolveLoading(true);
    setResolveMsg('');
    setTimeout(() => {
      setResolveLoading(false);
      setResolveMsg('Resolution Complete: AI analyzed the article. Outcome is YES. Funds disbursed to winners.');
    }, 4500);
  };

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
                <label>Question to Predict</label>
                <input type="text" placeholder="e.g. Will Space X launch Starship in July?" required defaultValue="Will Space X launch Starship in July?" />
              </div>
              <div className="input-group">
                <label>Source of Truth (News URL)</label>
                <input type="url" placeholder="https://reuters.com/..." required defaultValue="https://www.reuters.com/technology/space/spacex-starship-launch" />
              </div>
              <button type="submit" className="btn-primary" disabled={createLoading}>
                {createLoading ? <div className="loader"></div> : 'Initialize Market'}
              </button>
            </form>
            {createMsg && <div className="result-box success">{createMsg}</div>}
          </div>

          {/* Place Bet Panel */}
          <div className="cyber-panel">
            <h2><span className="icon">🎲</span> Place a Bet</h2>
            <div className="market-card">
              <h3>Market #1: Will Space X launch Starship in July?</h3>
              <div className="pool-info">
                <span>YES Pool: 450 GL</span>
                <span>NO Pool: 320 GL</span>
              </div>
              <form>
                <div className="input-group">
                  <label>Bet Amount (Tokens)</label>
                  <input type="number" placeholder="100" required defaultValue="100" />
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
              {betLoading && <div className="loader" style={{margin: '10px auto'}}></div>}
              {betMsg && <div className="result-box">{betMsg}</div>}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'resolve' && (
        <div className="cyber-panel center-panel">
          <h2><span className="icon">🧠</span> Autonomous AI Resolution</h2>
          <p className="desc">
            Trigger GenLayer's AI Validators to read the Source of Truth URL and determine the outcome automatically.
          </p>
          <div className="oracle-box">
            <p><strong>Market ID:</strong> #1</p>
            <p><strong>Source URL:</strong> https://www.reuters.com/technology/space/spacex-starship-launch</p>
            <form onSubmit={handleResolve}>
              <button type="submit" className="btn-resolve" disabled={resolveLoading}>
                {resolveLoading ? <div className="loader"></div> : 'Trigger AI Oracle'}
              </button>
            </form>
          </div>
          
          {resolveLoading && (
            <div className="ai-scanning">
              <div className="scan-line"></div>
              <p>AI Validators are reading the news article...</p>
            </div>
          )}

          {resolveMsg && (
            <div className="result-box success glow">
              {resolveMsg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
