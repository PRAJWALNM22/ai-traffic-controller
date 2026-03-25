import React, { useState, useEffect, useCallback, useRef } from 'react';
import JunctionCanvas from './components/JunctionCanvas';
import StatsPanel from './components/StatsPanel';
import MetricsChart from './components/MetricsChart';
import {
  ARMS,
  ARM_LABELS,
  calculateAllGreenTimes,
  calculateLoad,
  generateRandomVehicles,
} from './logic/SignalController';
import './App.css';

const FORECAST_API = 'http://localhost:8000';
const CYCLE_SPEED = 1000; // 1 second per tick
const FORECAST_POLL_INTERVAL = 15000; // 15s demo (15 min prod)
const AUTO_EMERGENCY_INTERVAL = 25000; // random ambulance every ~25s
const EMERGENCY_DURATION = 15000; // emergency lasts 15s

function App() {
  const [mode, setMode] = useState('fixed');
  const [junction, setJunction] = useState('silk_board');

  const [baseGreens, setBaseGreens] = useState({
    arm_N: 30, arm_E: 30, arm_S: 30, arm_W: 30,
  });

  const [vehiclesPerArm, setVehiclesPerArm] = useState({
    N: { bike: 5, auto: 3, car: 4, bus: 1, ambulance: 0 },
    E: { bike: 3, auto: 2, car: 6, bus: 2, ambulance: 0 },
    S: { bike: 7, auto: 4, car: 5, bus: 3, ambulance: 0 },
    W: { bike: 2, auto: 1, car: 3, bus: 0, ambulance: 0 },
  });

  const [signalState, setSignalState] = useState({
    greenArm: 'N',
    phase: 'green',
    countdown: 30,
    emergency: false,
    emergencyArm: null,
    emergencyPhase: null, // 'pre-clearance' | 'active' | 'post-clearance'
  });

  const [greenTimes, setGreenTimes] = useState({ N: 30, E: 30, S: 30, W: 30 });

  // Metrics
  const [waitTimes, setWaitTimes] = useState(() =>
    Array.from({ length: 5 }, () => Math.round(25 + Math.random() * 10))
  );
  const [throughput, setThroughput] = useState(20);
  const [cycleCount, setCycleCount] = useState(15);
  const [waitTimeHistory, setWaitTimeHistory] = useState(() =>
    Array.from({ length: 15 }, () => Math.round((25 + Math.random() * 10) * 10) / 10)
  );
  const [throughputHistory, setThroughputHistory] = useState(() =>
    Array.from({ length: 15 }, () => Math.round(15 + Math.random() * 10))
  );

  // Emergency log
  const [emergencyLog, setEmergencyLog] = useState([]);

  const armIndexRef = useRef(0);
  const emergencyTimeoutRef = useRef(null);
  const emergencyActiveRef = useRef(false);
  const emergencyQueueRef = useRef([]); // FIFO queue for ambulances

  const [autoGenerate, setAutoGenerate] = useState(true);
  const [intensity, setIntensity] = useState('medium');
  const [autoEmergency, setAutoEmergency] = useState(true);

  // ─── Forecast polling ───
  const fetchForecast = useCallback(async () => {
    try {
      const res = await fetch(`${FORECAST_API}/forecast?junction=${junction}&horizon=30`);
      if (res.ok) {
        const data = await res.json();
        setBaseGreens({ arm_N: data.arm_N, arm_E: data.arm_E, arm_S: data.arm_S, arm_W: data.arm_W });
      }
    } catch { console.warn('Forecast API unavailable'); }
  }, [junction]);

  useEffect(() => {
    fetchForecast();
    const interval = setInterval(fetchForecast, FORECAST_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchForecast]);

  // ─── Auto-generate vehicles ───
  useEffect(() => {
    if (!autoGenerate) return;
    const interval = setInterval(() => {
      setVehiclesPerArm(prev => ({
        N: { ...generateRandomVehicles(intensity), ambulance: prev.N?.ambulance || 0 },
        E: { ...generateRandomVehicles(intensity), ambulance: prev.E?.ambulance || 0 },
        S: { ...generateRandomVehicles(intensity), ambulance: prev.S?.ambulance || 0 },
        W: { ...generateRandomVehicles(intensity), ambulance: prev.W?.ambulance || 0 },
      }));
    }, 5000);
    return () => clearInterval(interval);
  }, [autoGenerate, intensity]);

  // ─── Automatic emergency vehicle generation ───
  // Use a ref to track emergency status to avoid stale closures
  useEffect(() => {
    emergencyActiveRef.current = signalState.emergency;
  }, [signalState.emergency]);

  useEffect(() => {
    if (!autoEmergency) return;
    const interval = setInterval(() => {
      // Use ref instead of stale closure!
      if (emergencyActiveRef.current) return;

      // Clear any leftover ambulances from previous emergencies
      setVehiclesPerArm(prev => {
        const cleaned = {};
        for (const a of ARMS) {
          cleaned[a] = { ...prev[a], ambulance: 0 };
        }
        return cleaned;
      });

      const arm = ARMS[Math.floor(Math.random() * 4)];
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      // Add ambulance to chosen arm (after a tiny delay to let cleanup finish)
      setTimeout(() => {
        setVehiclesPerArm(prev => ({
          ...prev,
          [arm]: { ...prev[arm], ambulance: 1 },
        }));
        triggerEmergency(arm, true);
      }, 50);

      setEmergencyLog(prev => [...prev.slice(-9), {
        time: timeStr,
        arm,
        status: 'AUTO — Ambulance detected',
      }]);
    }, AUTO_EMERGENCY_INTERVAL + Math.random() * 10000);
    return () => clearInterval(interval);
  }, [autoEmergency]);

  // ─── Recalculate green times ───
  useEffect(() => {
    const newGreens = calculateAllGreenTimes(vehiclesPerArm, baseGreens, mode);
    setGreenTimes(newGreens);
  }, [vehiclesPerArm, baseGreens, mode]);

  // ─── Signal cycle ticker ───
  useEffect(() => {
    const ticker = setInterval(() => {
      setSignalState(prev => {
        // ── Emergency Phase Handling ──
        if (prev.emergency) {
          const newCountdown = prev.countdown - 1;
          
          if (prev.emergencyPhase === 'pre-clearance') {
            if (newCountdown <= 0) {
              // Pre-clearance yellow is over -> Start Ambulance Green
              return { ...prev, phase: 'green', countdown: 99, emergencyPhase: 'active' };
            }
            return { ...prev, countdown: newCountdown };
          }

          if (prev.emergencyPhase === 'post-clearance') {
            if (newCountdown <= 0) {
              // Post-clearance yellow is over -> Restore Original Green
              emergencyActiveRef.current = false; // FINALLY DONE
              const restoredArm = prev.resumeState?.greenArm || 'N';
              const restoredTime = prev.resumeState?.countdown || 30;
              return { 
                ...prev, 
                emergency: false, 
                emergencyArm: null, 
                emergencyPhase: null,
                greenArm: restoredArm,
                phase: 'green',
                countdown: restoredTime,
                resumeState: null
              };
            }
            return { ...prev, countdown: newCountdown };
          }

          // In 'active' phase, countdown is 99 (waiting for physical clearance)
          return prev;
        }

        const newCountdown = prev.countdown - 1;
        if (newCountdown <= 0) {
          if (prev.phase === 'green') {
            return { ...prev, phase: 'yellow', countdown: 4 }; // 4 second yellow clearance phase
          }

          let nextIndex;
          if (mode === 'fixed') {
            armIndexRef.current = (armIndexRef.current + 1) % 4;
            nextIndex = armIndexRef.current;
          } else {
            const sorted = [...ARMS].sort((a, b) => (greenTimes[b] || 30) - (greenTimes[a] || 30));
            const candidates = sorted.filter(a => a !== prev.greenArm);
            nextIndex = ARMS.indexOf(candidates[0]);
            armIndexRef.current = nextIndex;
          }

          const nextArm = ARMS[nextIndex];
          const nextGreen = greenTimes[nextArm] || 30;

          setCycleCount(c => c + 1);
          const totalVehicles = ARMS.reduce((sum, arm) => {
            const v = vehiclesPerArm[arm] || {};
            return sum + (v.bike || 0) + (v.auto || 0) + (v.car || 0) + (v.bus || 0);
          }, 0);
          const currentThroughput = Math.round(totalVehicles * 0.4 + Math.random() * 5);
          setThroughput(currentThroughput);

          const avgWait = mode === 'fixed' ? 30 + Math.random() * 10 : nextGreen * 0.4 + Math.random() * 5;
          setWaitTimes(prev => [...prev.slice(-19), avgWait]);
          setWaitTimeHistory(prev => [...prev.slice(-19), Math.round(avgWait * 10) / 10]);
          setThroughputHistory(prev => [...prev.slice(-19), currentThroughput]);

          return { ...prev, greenArm: nextArm, phase: 'green', countdown: nextGreen };
        }

        return { ...prev, countdown: newCountdown };
      });
    }, CYCLE_SPEED);

    return () => clearInterval(ticker);
  }, [mode, greenTimes, vehiclesPerArm]);

  // ─── Emergency handler (FIFO queue + phased transitions) ───
  const processNextEmergency = useCallback(() => {
    const queue = emergencyQueueRef.current;
    if (queue.length === 0) {
      // No more ambulances -> Start POST-CLEARANCE yellow for original arm
      setSignalState(prev => {
        if (!prev.resumeState) {
          emergencyActiveRef.current = false;
          return { ...prev, emergency: false, emergencyArm: null, emergencyPhase: null };
        }
        return {
          ...prev,
          greenArm: prev.resumeState.greenArm,
          phase: 'yellow',
          countdown: 4, 
          emergencyPhase: 'post-clearance',
        };
      });
      return;
    }

    const nextArm = queue.shift();
    setVehiclesPerArm(prev => ({ ...prev, [nextArm]: { ...prev[nextArm], ambulance: 1 } }));

    setSignalState(prev => ({
      ...prev,
      greenArm: nextArm,
      phase: 'yellow',
      countdown: 4,
      emergency: true,
      emergencyArm: nextArm,
      emergencyPhase: 'pre-clearance',
      resumeState: prev.resumeState || {
        greenArm: prev.greenArm,
        phase: prev.phase,
        countdown: prev.countdown,
      },
    }));
  }, []);

  const triggerEmergency = useCallback((arm = 'N', isAuto = false) => {
    if (!isAuto) {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setEmergencyLog(prev => [...prev.slice(-9), {
        time: timeStr, arm, status: 'MANUAL — Override triggered',
      }]);
    }

    if (emergencyActiveRef.current) {
      emergencyQueueRef.current.push(arm);
      return;
    }

    emergencyActiveRef.current = true;
    setVehiclesPerArm(prev => ({ ...prev, [arm]: { ...prev[arm], ambulance: 1 } }));
    setSignalState(prev => ({
      greenArm: arm,
      phase: 'yellow',
      countdown: 4,
      emergency: true,
      emergencyArm: arm,
      emergencyPhase: 'pre-clearance',
      resumeState: prev.emergency ? prev.resumeState : {
        greenArm: prev.greenArm,
        phase: prev.phase,
        countdown: prev.countdown,
      },
    }));
  }, []);

  const handleAmbulanceClear = useCallback((arm) => {
    setVehiclesPerArm(prev => ({ ...prev, [arm]: { ...prev[arm], ambulance: 0 } }));
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setEmergencyLog(prev => [...prev.slice(-9), {
      time: timeStr, arm, status: 'CLEARED — Ambulance crossed junction',
    }]);

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
        ...prev,
        emergency: false,
        emergencyArm: null,
        emergencyPhase: null,
        greenArm: prev.resumeState.greenArm,
        phase: prev.resumeState.phase,
        countdown: prev.resumeState.countdown,
        resumeState: null,
      };
    });
  }, []);

  const updateVehicleCount = (arm, type, value) => {
    setVehiclesPerArm(prev => ({
      ...prev,
      [arm]: { ...prev[arm], [type]: Math.max(0, parseInt(value) || 0) },
    }));
  };

  return (
    <div className="app">
      {/* Header */}
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
            <button className={`toggle-btn ${mode === 'fixed' ? 'active' : ''}`} onClick={() => setMode('fixed')}>
              Fixed Timer
            </button>
            <button className={`toggle-btn ${mode === 'ai' ? 'active' : ''}`} onClick={() => setMode('ai')}>
              AI Adaptive
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
        {/* Left: Canvas + Controls + Chart */}
        <div className="canvas-section">
          <JunctionCanvas
            signalState={signalState}
            vehiclesPerArm={vehiclesPerArm}
            mode={mode}
            onAmbulanceClear={handleAmbulanceClear}
          />

          {/* Controls */}
          <div className="controls-row">
            {/* Emergency */}
            <div className="emergency-controls">
              <div className="emergency-buttons">
                <span className="emergency-label">🚑 Manual Override:</span>
                {ARMS.map(arm => {
                  const isCurrent = signalState.emergencyArm === arm;
                  const isQueued = emergencyQueueRef.current.includes(arm);
                  return (
                    <button 
                      key={arm} 
                      className={`emergency-btn ${isCurrent ? 'active' : ''} ${isQueued ? 'queued' : ''}`}
                      onClick={() => triggerEmergency(arm)}
                    >
                      {arm}
                      {isQueued && <span className="btn-badge">Q</span>}
                    </button>
                  );
                })}
              </div>
              {signalState.emergency && (
                <button className="cancel-emergency-btn" onClick={cancelEmergency}>
                  ✕ Reset Junction
                </button>
              )}
            </div>

            {/* Auto controls */}
            <div className="auto-controls">
              <label className="auto-label">
                <input type="checkbox" checked={autoGenerate} onChange={e => setAutoGenerate(e.target.checked)} />
                Auto vehicles
              </label>
              <select className="intensity-select" value={intensity} onChange={e => setIntensity(e.target.value)} disabled={!autoGenerate}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <label className="auto-label emergency-auto-label">
                <input type="checkbox" checked={autoEmergency} onChange={e => setAutoEmergency(e.target.checked)} />
                🚑 Auto emergency
              </label>
            </div>
          </div>

          {/* Lane Legend */}
          <div className="lane-legend">
            <span className="legend-title">4-Lane Layout:</span>
            <span className="legend-item free-left-legend">↰ Lane 0 — Free Left (always)</span>
            <span className="legend-item">→ Lane 1,2 — Straight</span>
            <span className="legend-item">↱ Lane 3 — Right Turn</span>
          </div>

          {/* Chart */}
          <MetricsChart waitTimeHistory={waitTimeHistory} throughputHistory={throughputHistory} />
        </div>

        {/* Right: Stats Panel */}
        <div className="panel-section">
          <StatsPanel
            vehiclesPerArm={vehiclesPerArm}
            greenTimes={greenTimes}
            signalState={signalState}
            mode={mode}
            baseGreens={baseGreens}
            waitTimes={waitTimes}
            throughput={throughput}
            cycleCount={cycleCount}
            emergencyLog={emergencyLog}
          />

          {/* Manual Input */}
          {!autoGenerate && (
            <div className="manual-input stats-card">
              <h3>Manual Vehicle Input</h3>
              {ARMS.map(arm => (
                <div key={arm} className="manual-arm">
                  <span className="arm-cell">{arm}:</span>
                  {['bike', 'auto', 'car', 'bus'].map(type => (
                    <input
                      key={type}
                      type="number" min="0" max="30"
                      value={vehiclesPerArm[arm]?.[type] || 0}
                      onChange={e => updateVehicleCount(arm, type, e.target.value)}
                      title={type}
                      className="vehicle-input"
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Formula */}
          <div className="formula-card stats-card">
            <h3>📐 Active Formula</h3>
            {mode === 'ai' ? (
              <div className="formula-content">
                <code>green = base_green<sub>LSTM</sub> + (load × 0.3)</code>
                <code>load = (bikes×1 + autos×1.5 + cars×2 + buses×4) × 0.75</code>
                <code className="free-left-formula">↰ 25% vehicles use free left — load reduced</code>
                <code>clamped: [15s, 90s]</code>
              </div>
            ) : (
              <div className="formula-content">
                <code>green = 30s (fixed, all arms)</code>
                <code className="free-left-formula">↰ free left still active (always on)</code>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <span>HackSETU – TATVA Hackathon 2026 · Team Project</span>
        <span>4-Lane · Free Left Turn · Auto Emergency · LSTM Forecast</span>
      </footer>
    </div>
  );
}

export default App;
