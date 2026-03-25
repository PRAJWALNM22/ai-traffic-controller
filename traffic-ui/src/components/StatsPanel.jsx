import React from 'react';
import {
  ARMS,
  ARM_LABELS,
  VEHICLE_COLORS,
  calculateLoad,
  calculateRawLoad,
  getFreeLeftCount,
} from '../logic/SignalController';

/**
 * StatsPanel — Enhanced with free-left info and 4-lane details.
 */
export default function StatsPanel({
  vehiclesPerArm,
  greenTimes,
  signalState,
  mode,
  baseGreens,
  waitTimes,
  throughput,
  cycleCount,
  emergencyLog,
}) {
  return (
    <div className="stats-panel">
      <h2 className="panel-title">
        <span className="title-icon">📊</span> Signal Dashboard
      </h2>

      {/* Current Signal State */}
      <div className="stats-card signal-state-card">
        <h3>🚦 Current Signal</h3>
        <div className="signal-grid">
          {ARMS.map(arm => {
            const isGreen = signalState.greenArm === arm && signalState.phase === 'green' && !signalState.emergency;
            const isYellow = signalState.greenArm === arm && signalState.phase === 'yellow' && !signalState.emergency;
            const isEmergency = signalState.emergency && signalState.emergencyArm === arm;
            
            let dotClass = 'red';
            if (isGreen || isEmergency) dotClass = 'green';
            else if (isYellow) dotClass = 'yellow';

            return (
              <div
                key={arm}
                className={`signal-arm ${isGreen || isYellow || isEmergency ? 'active' : ''} ${isEmergency ? 'emergency' : ''}`}
              >
                <span className="arm-label">{ARM_LABELS[arm]}</span>
                <span className={`signal-dot ${dotClass}`} />
                <span className="green-time">{greenTimes[arm]}s</span>
              </div>
            );
          })}
        </div>
        {signalState.emergency && (
          <div className="emergency-banner">🚑 EMERGENCY — {ARM_LABELS[signalState.emergencyArm]} ARM</div>
        )}
        <div className="countdown-display">
          <span className="countdown-label">Countdown</span>
          <span className="countdown-value">{signalState.countdown}s</span>
        </div>
      </div>

      {/* Vehicle Counts + Free Left */}
      <div className="stats-card">
        <h3>🚗 Vehicle Counts (4-Lane)</h3>
        <div className="vehicle-table">
          <div className="table-header">
            <span>Arm</span>
            <span style={{ color: VEHICLE_COLORS.bike }}>🏍️</span>
            <span style={{ color: VEHICLE_COLORS.auto }}>🛺</span>
            <span style={{ color: VEHICLE_COLORS.car }}>🚗</span>
            <span style={{ color: VEHICLE_COLORS.bus }}>🚌</span>
            <span className="free-left-header">↰Free</span>
            <span>Load</span>
          </div>
          {ARMS.map(arm => {
            const v = vehiclesPerArm[arm] || { bike: 0, auto: 0, car: 0, bus: 0 };
            const rawLoad = calculateRawLoad(v);
            const effLoad = calculateLoad(v);
            const freeLeft = getFreeLeftCount(v);
            return (
              <div
                key={arm}
                className={`table-row ${signalState.greenArm === arm ? 'active-row' : ''}`}
              >
                <span className="arm-cell">{ARM_LABELS[arm]}</span>
                <span>{v.bike}</span>
                <span>{v.auto}</span>
                <span>{v.car}</span>
                <span>{v.bus}</span>
                <span className="free-left-cell">-{freeLeft}</span>
                <span className="load-cell">{effLoad.toFixed(1)}</span>
              </div>
            );
          })}
        </div>
        <p className="load-note">
          ↰ Free left vehicles bypass signal — load reduced by 25%
        </p>
      </div>

      {/* Free Left Explanation */}
      <div className="stats-card free-left-card">
        <h3>↰ Free Left Turn</h3>
        <div className="free-left-info">
          <div className="free-left-status">
            <span className="free-left-dot" />
            <span>Always Active — No Signal Required</span>
          </div>
          <p className="free-left-desc">
            Vehicles in Lane 0 (leftmost) take the curved slip road to turn left,
            bypassing the signal entirely. This reduces effective signal load by ~25%.
          </p>
        </div>
      </div>

      {/* Forecast Base Greens */}
      <div className="stats-card">
        <h3>🧠 Forecast Base Greens</h3>
        <div className="base-greens">
          {ARMS.map(arm => (
            <div key={arm} className="base-green-item">
              <span>{ARM_LABELS[arm]}</span>
              <span className="base-value">{baseGreens[`arm_${arm}`] || 30}s</span>
            </div>
          ))}
        </div>
        <p className="forecast-label">
          Mode: <strong>{mode === 'ai' ? 'AI Adaptive' : 'Fixed Timer (30s)'}</strong>
        </p>
      </div>

      {/* Performance Metrics */}
      <div className="stats-card">
        <h3>⚡ Performance</h3>
        <div className="metrics-row">
          <div className="metric">
            <span className="metric-label">Avg Wait</span>
            <span className="metric-value">
              {waitTimes.length > 0
                ? (waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length).toFixed(1)
                : '—'}s
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">Throughput</span>
            <span className="metric-value">{throughput}/min</span>
          </div>
          <div className="metric">
            <span className="metric-label">Cycles</span>
            <span className="metric-value">{cycleCount}</span>
          </div>
        </div>
      </div>

      {/* Emergency Log */}
      {emergencyLog && emergencyLog.length > 0 && (
        <div className="stats-card emergency-log-card">
          <h3>🚑 Emergency Log</h3>
          <div className="emergency-log">
            {emergencyLog.slice(-5).reverse().map((entry, i) => (
              <div key={i} className="log-entry">
                <span className="log-time">{entry.time}</span>
                <span className="log-arm">{ARM_LABELS[entry.arm]}</span>
                <span className="log-status">{entry.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
