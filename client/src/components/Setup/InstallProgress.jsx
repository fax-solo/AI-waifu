import React, { useState, useEffect, useRef } from 'react';

export default function InstallProgress({ packages, onComplete, isActive }) {
  const [logOpen, setLogOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progresses, setProgresses] = useState({});
  const [isFinished, setIsFinished] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  
  const logEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, logOpen]);

  useEffect(() => {
    if (!isActive || isFinished || !hasStarted || packages.length === 0) return;

    // Small delay to allow the screen transition animation to finish (0.6s)
    const timer = setTimeout(() => {
      const ids = packages.map(p => p.id).join(',');
      const baseUrl = window.location.protocol === 'file:' ? 'http://localhost:3001' : '';
      const eventSource = new EventSource(`${baseUrl}/api/setup/stream?packages=${ids}`);

      const addLog = (text, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        setLogs(prev => [...prev, { time: timestamp, text, type }]);
      };

      eventSource.addEventListener('log', (e) => {
        const data = JSON.parse(e.data);
        addLog(data.text, data.type);
      });

      eventSource.addEventListener('progress', (e) => {
        const data = JSON.parse(e.data);
        setProgresses(prev => ({ ...prev, [data.id]: data.progress }));
        
        const pkgIndex = packages.findIndex(p => p.id === data.id);
        if (pkgIndex > currentIndex) {
          setCurrentIndex(pkgIndex);
        }
      });

      eventSource.addEventListener('done', (e) => {
        const data = JSON.parse(e.data);
        addLog(data.text, 'success');
        setCurrentIndex(packages.length);
        setIsFinished(true);
        eventSource.close();
      });

      eventSource.addEventListener('error', (e) => {
        let msg = 'Connection lost or stream ended unexpectedly.';
        if (e.data) {
          try {
            const data = JSON.parse(e.data);
            msg = data.text;
          } catch(err) {}
        }
        addLog(`Error: ${msg}`, 'error');
        eventSource.close();
      });

      // Store in ref to close on cleanup
      eventSourceRef.current = eventSource;
    }, 800);

    return () => {
      clearTimeout(timer);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // Calculate overall progress
  const totalWeight = packages.length * 100;
  const currentWeight = packages.reduce((acc, pkg) => acc + (progresses[pkg.id] || 0), 0);
  const overallProgress = packages.length === 0 ? 0 : Math.floor((currentWeight / totalWeight) * 100);

  return (
    <div className="setup-screen">
      <div className="setup-header">
        <h1>Installation</h1>
        <span className="step-indicator">Step 2 of 2</span>
      </div>

      {!isFinished ? (
        <div className="install-container">
          {!hasStarted ? (
            <div className="confirmation-overlay">
              <div className="confirmation-card">
                <h2>Confirm Installation</h2>
                <p>The app will now download and configure the following components:</p>
                <div className="summary-list">
                  {packages.map(pkg => (
                    <div key={pkg.id} className="summary-item">
                      <span>{pkg.name}</span>
                      <span className="summary-size">{pkg.size}</span>
                    </div>
                  ))}
                </div>
                <button className="btn-primary" onClick={() => setHasStarted(true)} style={{ width: '100%', marginTop: '1.5rem', height: '3.5rem', fontSize: '1.125rem' }}>
                  Start Installation
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="7 13 12 18 17 13"></polyline>
                    <polyline points="7 6 12 11 17 6"></polyline>
                  </svg>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="overall-progress">
                <div className="progress-header">
                  <h2>Installing Components</h2>
                  <span className="progress-percentage">{overallProgress}%</span>
                </div>
                <div className="progress-bar-container">
                  <div className="progress-bar-fill" style={{ width: `${overallProgress}%` }}></div>
                </div>
              </div>

              <div className="install-list">
                {packages.map((pkg, idx) => {
                  const status = idx < currentIndex ? 'done' : idx === currentIndex ? 'active' : 'waiting';
                  const progress = progresses[pkg.id] || 0;
                  
                  return (
                    <div key={pkg.id} className={`install-item ${status}`}>
                      <div className="item-info">
                        <div className="item-icon">
                          {status === 'active' ? (
                            <div className="spinner"></div>
                          ) : status === 'done' ? (
                            <svg className="status-icon done" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          ) : (
                            <svg className="status-icon waiting" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"></circle>
                              <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                          )}
                        </div>
                        <div className="item-details">
                          <div className="item-name">{pkg.name}</div>
                        </div>
                      </div>
                      <div className={`item-status ${status}`}>
                        {status === 'active' ? `Installing... ${Math.floor(progress)}%` : 
                         status === 'done' ? 'Installed' : 'Waiting...'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="completion-state">
          <div className="completion-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <h2>Ready to Launch</h2>
          <p>All selected components have been successfully downloaded and configured.</p>
          <button className="btn-primary" onClick={onComplete} style={{ fontSize: '1.125rem', padding: '1rem 2.5rem' }}>
            Launch App
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </button>
        </div>
      )}

      <div className="setup-footer">
        <button className="btn-secondary" onClick={() => setLogOpen(!logOpen)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 14 10 14 10 20"></polyline>
            <polyline points="20 10 14 10 14 4"></polyline>
            <line x1="14" y1="10" x2="21" y2="3"></line>
            <line x1="3" y1="21" x2="10" y2="14"></line>
          </svg>
          {logOpen ? 'Hide Log' : 'Show Log'}
        </button>
      </div>

      <div className={`log-drawer ${!logOpen ? 'closed' : ''}`} style={{ height: '300px' }}>
        <div className="log-header">
          <span className="log-title">Console Output</span>
          <button style={{ background: 'transparent', border: 'none', color: 'var(--setup-text-secondary)', cursor: 'pointer' }} onClick={() => setLogOpen(false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div className="log-content">
          {logs.map((log, i) => (
            <div key={i} className="log-line">
              <span className="log-time">[{log.time}]</span>
              <span className={`log-${log.type}`}>{log.text}</span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
    </div>
  );
}
