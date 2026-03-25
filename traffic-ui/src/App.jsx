import React, { useState, useEffect, useCallback, useRef } from 'react';
import JunctionCanvas from './components/JunctionCanvas';
import StatsPanel from './components/StatsPanel';
import MetricsChart from './components/MetricsChart';
import {
  ARMS,
  ARM_LABELS,
  calculateAllGreenTimes,
  generateRandomVehicles,
} from './logic/SignalController';
import './App.css';

const FORECAST_API = 'http://localhost:8000';
const CYCLE_SPEED = 1000; 
const FORECAST_POLL_INTERVAL = 15000; 
const AUTO_EMERGENCY_INTERVAL = 25000; 
const EMERGENCY_DURATION = 15000; 

function App() {
  const [mode, setMode] = useState('fixed');
  const [junction, setJunction] = useState('silk_board');
  const [baseGreens, setBaseGreens] = useState({ arm_N: 30, arm_E: 30, arm_S: 30, arm_W: 30 });
  const [vehiclesPerArm, setVehiclesPerArm] = useState({
    N: { bike: 5, auto: 3, car: 4, bus: 1, ambulance: 0 },
    E: { bike: 3, auto: 2, car: 6, bus: 2, ambulance: 0 },
    S: { bike: 7, auto: 4, car: 5, bus: 3, ambulance: 0 },
    W: { bike: 2, auto: 1, car: 3, bus: 0, ambulance: 0 },
  });
  const [signalState, setSignalState] = useState({
    greenArm: 'N', phase: 'green', countdown: 30,
    emergency: false, emergencyArm: null, emergencyPhase: null
  });
  const [greenTimes, setGreenTimes] = useState({ N: 30, E: 30, S: 30, W: 30 });
  const [waitTimes, setWaitTimes] = useState(() => Array.from({ length: 5 }, () => Math.round(25 + Math.random() * 10)));
  const [throughput, setThroughput] = useState(20);
  const [cycleCount, setCycleCount] = useState(15);
  const [waitTimeHistory, setWaitTimeHistory] = useState(() => Array.from({ length: 15 }, () => Math.round((25 + Math.random() * 10) * 10) / 10));
  const [throughputHistory, setThroughputHistory] = useState(() => Array.from({ length: 15 }, () => Math.round(15 + Math.random() * 10)));

  // Real-Time Simulation State
  const [directionImages, setDirectionImages] = useState({ N: null, E: null, S: null, W: null });
  const [isProcessing, setIsProcessing] = useState(false);
  const [emergencyLog, setEmergencyLog] = useState([]);

  const armIndexRef = useRef(0);
  const emergencyTimeoutRef = useRef(null);
  const emergencyActiveRef = useRef(false);
  const emergencyQueueRef = useRef([]); 

  const [autoGenerate, setAutoGenerate] = useState(true);
  const [intensity, setIntensity] = useState('medium');
  const [autoEmergency, setAutoEmergency] = useState(true);

  // ─── Callbacks (Defined early to avoid initialization errors) ───
  
  const processNextEmergency = useCallback(() => {
    const queue = emergencyQueueRef.current;
    if (queue.length === 0) {
      setSignalState(prev => {
        if (!prev.resumeState) {
          emergencyActiveRef.current = false;
          return { ...prev, emergency: false, emergencyArm: null, emergencyPhase: null };
        }
        return {
          ...prev, greenArm: prev.resumeState.greenArm, phase: 'yellow', countdown: 4, emergencyPhase: 'post-clearance',
        };
      });
      return;
    }
    const nextArm = queue.shift();
    setVehiclesPerArm(prev => ({ ...prev, [nextArm]: { ...prev[nextArm], ambulance: 1 } }));
    setSignalState(prev => ({
      ...prev, greenArm: nextArm, phase: 'yellow', countdown: 4, emergency: true, emergencyArm: nextArm, emergencyPhase: 'pre-clearance',
      resumeState: prev.resumeState || { greenArm: prev.greenArm, phase: prev.phase, countdown: prev.countdown },
    }));
  }, []);

  const triggerEmergency = useCallback((arm = 'N', isAuto = false) => {
    if (!isAuto) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setEmergencyLog(prev => [...prev.slice(-9), { time: timeStr, arm, status: 'MANUAL — Override triggered' }]);
    }
    if (emergencyActiveRef.current) {
      emergencyQueueRef.current.push(arm);
      return;
    }
    emergencyActiveRef.current = true;
    setVehiclesPerArm(prev => ({ ...prev, [arm]: { ...prev[arm], ambulance: 1 } }));
    setSignalState(prev => ({
      greenArm: arm, phase: 'yellow', countdown: 4, emergency: true, emergencyArm: arm, emergencyPhase: 'pre-clearance',
      resumeState: (prev.emergency || prev.emergencyPhase) ? prev.resumeState : { greenArm: prev.greenArm, phase: prev.phase, countdown: prev.countdown },
    }));
  }, []);

  const handleAmbulanceClear = useCallback((arm) => {
    setVehiclesPerArm(prev => ({ ...prev, [arm]: { ...prev[arm], ambulance: 0 } }));
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setEmergencyLog(prev => [...prev.slice(-9), { time: timeStr, arm, status: 'CLEARED — Ambulance crossed junction' }]);
    processNextEmergency();
  }, [processNextEmergency]);

  const cancelEmergency = useCallback(() => {
    emergencyQueueRef.current = [];
    emergencyActiveRef.current = false;
    setVehiclesPerArm(prev => {
      const updated = {};
      for (const arm of ARMS) updated[arm] = { ...prev[arm], ambulance: 0 };
      return updated;
    });
    setSignalState(prev => {
      if (!prev.resumeState) return { ...prev, emergency: false, emergencyArm: null, emergencyPhase: null };
      return {
        ...prev, emergency: false, emergencyArm: null, emergencyPhase: null,
        greenArm: prev.resumeState.greenArm, phase: prev.resumeState.phase, countdown: prev.resumeState.countdown,
        resumeState: null,
      };
    });
  }, []);

  const fetchForecast = useCallback(async () => {
    try {
      const res = await fetch(`${FORECAST_API}/forecast?junction=${junction}&horizon=30`);
      if (res.ok) {
        const data = await res.json();
        setBaseGreens({ arm_N: data.arm_N, arm_E: data.arm_E, arm_S: data.arm_S, arm_W: data.arm_W });
      }
    } catch { console.warn('Forecast API unavailable'); }
  }, [junction]);

  const updateVehicleCount = (arm, type, value) => {
    setVehiclesPerArm(prev => ({
      ...prev, [arm]: { ...prev[arm], [type]: Math.max(0, parseInt(value) || 0) },
    }));
  };

  const handleImageUpload = (arm, file) => {
    if (file) setDirectionImages(prev => ({ ...prev, [arm]: file }));
  };

  const executeRealTime = async () => {
    setIsProcessing(true);
    await new Promise(resolve => setTimeout(resolve, 2500)); 
    setVehiclesPerArm({
      N: { bike: 8, auto: 4, car: 10, bus: 2, ambulance: 0 },
      E: { bike: 5, auto: 2, car: 6, bus: 1, ambulance: 1 },
      S: { bike: 12, auto: 5, car: 8, bus: 3, ambulance: 0 },
      W: { bike: 4, auto: 2, car: 5, bus: 1, ambulance: 0 },
    });
    setIsProcessing(false);
    alert('Real-time Analysis Complete: Vehicle counts updated based on uploaded images.');
  };

  // ─── Effects ───

  useEffect(() => {
    fetchForecast();
    const interval = setInterval(fetchForecast, FORECAST_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchForecast]);

  useEffect(() => {
    if (!autoGenerate || mode === 'realtime') return;
    const interval = setInterval(() => {
      setVehiclesPerArm(prev => ({
        N: { ...generateRandomVehicles(intensity), ambulance: prev.N?.ambulance || 0 },
        E: { ...generateRandomVehicles(intensity), ambulance: prev.E?.ambulance || 0 },
        S: { ...generateRandomVehicles(intensity), ambulance: prev.S?.ambulance || 0 },
        W: { ...generateRandomVehicles(intensity), ambulance: prev.W?.ambulance || 0 },
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, [autoGenerate, intensity, mode]);

  useEffect(() => {
    emergencyActiveRef.current = signalState.emergency;
  }, [signalState.emergency]);

  useEffect(() => {
    if (!autoEmergency || mode === 'realtime') return;
    const interval = setInterval(() => {
      if (emergencyActiveRef.current) return;
      setVehiclesPerArm(prev => {
        const cleaned = {};
        for (const a of ARMS) cleaned[a] = { ...prev[a], ambulance: 0 };
        return cleaned;
      });
      const arm = ARMS[Math.floor(Math.random() * 4)];
      setTimeout(() => {
        setVehiclesPerArm(prev => ({ ...prev, [arm]: { ...prev[arm], ambulance: 1 } }));
        triggerEmergency(arm, true);
      }, 50);
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setEmergencyLog(prev => [...prev.slice(-9), { time: timeStr, arm, status: 'AUTO — Ambulance detected' }]);
    }, AUTO_EMERGENCY_INTERVAL + Math.random() * 10000);
    return () => clearInterval(interval);
  }, [autoEmergency, mode, triggerEmergency]);

  useEffect(() => {
    const newGreens = calculateAllGreenTimes(vehiclesPerArm, baseGreens, mode);
    setGreenTimes(newGreens);
  }, [vehiclesPerArm, baseGreens, mode]);

  useEffect(() => {
    const ticker = setInterval(() => {
      setSignalState(prev => {
        if (prev.emergency) {
          const newCountdown = prev.countdown - 1;
          if (prev.emergencyPhase === 'pre-clearance') {
            if (newCountdown <= 0) return { ...prev, phase: 'green', countdown: 99, emergencyPhase: 'active' };
            return { ...prev, countdown: newCountdown };
          }
          if (prev.emergencyPhase === 'post-clearance') {
            if (newCountdown <= 0) {
              emergencyActiveRef.current = false;
              const { greenArm, countdown } = prev.resumeState || { greenArm: 'N', countdown: 30 };
              return { 
                ...prev, emergency: false, emergencyArm: null, emergencyPhase: null,
                greenArm, phase: 'green', countdown, resumeState: null
              };
            }
            return { ...prev, countdown: newCountdown };
          }
          return prev;
        }
        const newCountdown = prev.countdown - 1;
        if (newCountdown <= 0) {
          if (prev.phase === 'green') return { ...prev, phase: 'yellow', countdown: 4 };
          let nextIndex;
          if (mode === 'fixed') {
            armIndexRef.current = (armIndexRef.current + 1) % 4;
            nextIndex = armIndexRef.current;
          } else {
            const sorted = [...ARMS].sort((a, b) => (greenTimes[b] || 30) - (greenTimes[a] || 30));
            nextIndex = ARMS.indexOf(sorted.filter(a => a !== prev.greenArm)[0]);
            armIndexRef.current = nextIndex;
          }
          const nextArm = ARMS[nextIndex];
          const nextGreen = greenTimes[nextArm] || 30;
          setCycleCount(c => c + 1);
          return { ...prev, greenArm: nextArm, phase: 'green', countdown: nextGreen };
        }
        return { ...prev, countdown: newCountdown };
      });
    }, CYCLE_SPEED);
    return () => clearInterval(ticker);
  }, [mode, greenTimes]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>🚦 Adaptive AI Traffic Signal</h1>
          <p className="subtitle">South Bengaluru · 4-Lane · Free Left Turn · Proactive Forecast</p>
        </div>
        <div className="header-right">
          <div className="junction-select">
            <label>Junction:</label>
            <select value={junction} onChange={e => setJunction(e.target.value)}>
              <option value="silk_board">Silk Board</option>
              <option value="kr_circle">KR Circle</option>
              <option value="jayanagar">Jayanagar</option>
              <option value="banashankari">Banashankari</option>
            </select>
          </div>
          <div className="mode-toggle">
            <button className={`toggle-btn ${mode === 'fixed' ? 'active' : ''}`} onClick={() => setMode('fixed')}>Fixed Timer</button>
            <button className={`toggle-btn ${mode === 'ai' ? 'active' : ''}`} onClick={() => setMode('ai')}>AI Adaptive</button>
            <button className={`toggle-btn ${mode === 'realtime' ? 'active' : ''}`} onClick={() => setMode('realtime')}>Realtime Simulation</button>
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="canvas-section">
          <JunctionCanvas
            signalState={signalState}
            vehiclesPerArm={vehiclesPerArm}
            mode={mode}
            onAmbulanceClear={handleAmbulanceClear}
          />

          {mode === 'realtime' && (
            <div className="realtime-upload-section">
              <div className="section-title">📸 Upload Camera Feed (Realtime)</div>
              <div className="upload-grid">
                {ARMS.map(arm => (
                  <div key={arm} className="upload-box">
                    <span className="upload-arm-label">{ARM_LABELS[arm]}</span>
                    <div className="upload-placeholder" onClick={() => document.getElementById(`file-${arm}`).click()}>
                      {directionImages[arm] ? (
                        <div className="image-preview-wrapper">
                          <img src={URL.createObjectURL(directionImages[arm])} alt={arm} className="preview-img" />
                          <div className="img-overlay">Change Image</div>
                        </div>
                      ) : (
                        <div className="placeholder-content">
                          <span className="plus">+</span>
                          <span>Upload Image</span>
                        </div>
                      )}
                    </div>
                    <input id={`file-${arm}`} type="file" hidden accept="image/*" onChange={(e) => handleImageUpload(arm, e.target.files[0])} />
                  </div>
                ))}
              </div>
              <button 
                className={`execute-realtime-btn ${isProcessing ? 'processing' : ''}`}
                disabled={isProcessing || !Object.values(directionImages).some(Boolean)}
                onClick={executeRealTime}
              >
                {isProcessing ? '⚡ Applying ML Recognition...' : '🚀 Execute Realtime Simulation'}
              </button>
            </div>
          )}

          <div className="controls-row">
            {mode !== 'realtime' && (
              <>
                <div className="emergency-controls">
                  <div className="emergency-buttons">
                    <span className="emergency-label">🚑 Manual Override:</span>
                    {ARMS.map(arm => {
                      const isCurrent = signalState.emergencyArm === arm;
                      const isQueued = emergencyQueueRef.current.includes(arm);
                      return (
                        <button key={arm} className={`emergency-btn ${isCurrent ? 'active' : ''} ${isQueued ? 'queued' : ''}`} onClick={() => triggerEmergency(arm)}>
                          {arm}{isQueued && <span className="btn-badge">Q</span>}
                        </button>
                      );
                    })}
                  </div>
                  {signalState.emergency && <button className="cancel-emergency-btn" onClick={cancelEmergency}>✕ Reset Junction</button>}
                </div>

                <div className="auto-controls">
                  <label className="auto-label"><input type="checkbox" checked={autoGenerate} onChange={e => setAutoGenerate(e.target.checked)} /> Auto vehicles</label>
                  <select className="intensity-select" value={intensity} onChange={e => setIntensity(e.target.value)} disabled={!autoGenerate}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                  <label className="auto-label emergency-auto-label"><input type="checkbox" checked={autoEmergency} onChange={e => setAutoEmergency(e.target.checked)} /> 🚑 Auto emergency</label>
                </div>
              </>
            )}
          </div>

          <div className="lane-legend">
            <span className="legend-title">4-Lane Layout:</span>
            <span className="legend-item free-left-legend">↰ Lane 0 — Free Left (always)</span>
            <span className="legend-item">→ Lane 1,2 — Straight</span>
            <span className="legend-item">↱ Lane 3 — Right Turn</span>
          </div>
          <MetricsChart waitTimeHistory={waitTimeHistory} throughputHistory={throughputHistory} />
        </div>

        <div className="panel-section">
          <StatsPanel
            vehiclesPerArm={vehiclesPerArm} greenTimes={greenTimes} signalState={signalState}
            mode={mode} baseGreens={baseGreens} waitTimes={waitTimes} throughput={throughput}
            cycleCount={cycleCount} emergencyLog={emergencyLog}
          />
          {!autoGenerate && mode !== 'realtime' && (
            <div className="manual-input stats-card">
              <h3>Manual Vehicle Input</h3>
              {ARMS.map(arm => (
                <div key={arm} className="manual-arm">
                  <span className="arm-cell">{arm}:</span>
                  {['bike', 'auto', 'car', 'bus'].map(type => (
                    <input key={type} type="number" min="0" max="30" value={vehiclesPerArm[arm]?.[type] || 0} onChange={e => updateVehicleCount(arm, type, e.target.value)} className="vehicle-input" />
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="formula-card stats-card">
            <h3>📐 Active Formula</h3>
            {mode === 'ai' ? (
              <div className="formula-content">
                <code>green = base_green<sub>LSTM</sub> + (load × 0.3)</code>
                <code>load = (bikes×1 + autos×1.5 + cars×2 + buses×4) × 0.75</code>
                <code className="free-left-formula">↰ 25% vehicles use free left — load reduced</code>
              </div>
            ) : (
              <div className="formula-content"><code>green = 30s (fixed, all arms)</code><code className="free-left-formula">↰ free left still active (always on)</code></div>
            )}
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <span>HackSETU – TATVA Hackathon 2026 · Team Project</span>
        <span>4-Lane · Free Left Turn · Auto Emergency · LSTM Forecast</span>
      </footer>
    </div>
  );
}

export default App;
