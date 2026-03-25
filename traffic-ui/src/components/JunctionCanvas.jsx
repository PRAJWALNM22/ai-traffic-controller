import React, { useRef, useEffect, useCallback } from 'react';
import { VEHICLE_COLORS, ARMS } from '../logic/SignalController';

const CANVAS_SIZE = 760;
const ROAD_WIDTH = 200;        // total road width (4 lanes)
const HALF_ROAD = ROAD_WIDTH / 2;
const LANE_W = ROAD_WIDTH / 4; // each lane = 50px
const CENTER = CANVAS_SIZE / 2;
const SIGNAL_RADIUS = 10;

// Preload vehicle sprites
const vehicleImages = {};
if (typeof window !== 'undefined') {
  ['car', 'bus', 'bike', 'rickshaw', 'truck'].forEach(type => {
    const img = new Image();
    img.src = `/assets/down/${type}.png`; // All natively face DOWN (South)
    vehicleImages[type] = img;
  });
}

/*
 * ROAD LAYOUT (Left-Hand Traffic, Indian Style):
 *
 *  Each arm has 4 lanes split by a yellow center divider.
 *  You drive on the LEFT side of the road.
 *
 *  North arm (looking top-down):
 *    - EAST half (right side) = INCOMING from North (heading ↓ south)
 *    - WEST half (left side)  = OUTGOING to North (heading ↑ north)
 *
 *  FREE LEFT TURN (always moving):
 *    - Leftmost incoming lane (Lane 0) curves through the corner and merges
 *      into the leftmost outgoing lane of the adjacent arm.
 *    - N incoming (East half)   → NE corner → East outgoing (North half)
 *    - E incoming (South half)  → SE corner → South outgoing (East half)
 *    - S incoming (West half)   → SW corner → West outgoing (South half)
 *    - W incoming (North half)  → NW corner → North outgoing (West half)
 */

const DOT_SIZES = { bike: 3, auto: 5, car: 6, bus: 9, ambulance: 7 };

export default function JunctionCanvas({ signalState, vehiclesPerArm, mode, onAmbulanceClear }) {
  const canvasRef = useRef(null);
  const vehicleDotsRef = useRef({});
  const animFrameRef = useRef(null);
  const lastVehiclesRef = useRef(null);

  // Smart queue updater
  const updateVehicleQueue = useCallback(() => {
    const dots = vehicleDotsRef.current;
    const FREE_LEFT_RATIO = 0.22;
    const RIGHT_TURN_RATIO = 0.0; // Right turns disabled as per request

    for (const arm of ARMS) {
      if (!dots[arm]) dots[arm] = [];
      const counts = vehiclesPerArm[arm] || {};

      const currentCounts = {};
      for (const d of dots[arm]) {
        currentCounts[d.type] = (currentCounts[d.type] || 0) + 1;
      }

      for (const [type, count] of Object.entries(counts)) {
        if (type === 'ambulance' && count > 0) {
          if (!currentCounts['ambulance']) {
            const laneDots = dots[arm].filter(d => d.lane === 1);
            const mOffset = laneDots.length > 0 ? Math.max(...laneDots.map(d => d.offset)) : 20;
            // Cap offset at 450 so it's always visible on screen immediately
            const spawnOffset = Math.min(450, mOffset + 60);
            dots[arm].push({
              type: 'ambulance', offset: Math.max(350, spawnOffset),
              lane: 1, wobble: 0, speed: 3.8, flash: 0,
            });
          }
          continue;
        }

        const curCount = currentCounts[type] || 0;
        const diff = count - curCount;
        if (diff > 0) {
          for (let i = 0; i < diff; i++) {
            const rng = Math.random();
            const isFreeLeft = rng < FREE_LEFT_RATIO;
            const isRightTurn = !isFreeLeft && rng < FREE_LEFT_RATIO + RIGHT_TURN_RATIO;

            if (isFreeLeft) {
              const laneDots = dots[arm].filter(d => d.lane === 0);
              const minProg = laneDots.length > 0 ? Math.min(...laneDots.map(d => d.freeLeftProgress)) : 0;
              dots[arm].push({
                type,
                lane: 0,
                wobble: 0,
                speed: 0.35 + Math.random() * 0.15,
                freeLeftProgress: Math.min(minProg - 0.25 - Math.random() * 0.1, -0.2),
              });
            } else {
              const laneDots = dots[arm].filter(d => d.lane === 1);
              const mOffset = laneDots.length > 0 ? Math.max(...laneDots.map(d => d.offset)) : 20;
              dots[arm].push({
                type,
                lane: 1,
                wobble: 0,
                speed: 3.5,
                offset: Math.max(300, mOffset + 50 + Math.random() * 10),
              });
            }
          }
        }
      }
    }
  }, [vehiclesPerArm]);

  useEffect(() => { updateVehicleQueue(); }, [vehiclesPerArm, updateVehicleQueue]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CANVAS_SIZE * dpr;
    canvas.height = CANVAS_SIZE * dpr;
    ctx.scale(dpr, dpr);

    // ─── Background ───
    ctx.fillStyle = '#111518';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // ─── Grass / building quadrants ───
    const grassGrad = ctx.createRadialGradient(CENTER, CENTER, ROAD_WIDTH, CENTER, CENTER, CANVAS_SIZE);
    grassGrad.addColorStop(0, '#1c281e');
    grassGrad.addColorStop(1, '#111a14');
    ctx.fillStyle = grassGrad;
    ctx.fillRect(0, 0, CENTER - HALF_ROAD, CENTER - HALF_ROAD);
    ctx.fillRect(CENTER + HALF_ROAD, 0, CENTER - HALF_ROAD, CENTER - HALF_ROAD);
    ctx.fillRect(0, CENTER + HALF_ROAD, CENTER - HALF_ROAD, CENTER - HALF_ROAD);
    ctx.fillRect(CENTER + HALF_ROAD, CENTER + HALF_ROAD, CENTER - HALF_ROAD, CENTER - HALF_ROAD);

    // ─── Roads (Asphalt) ───
    ctx.fillStyle = '#3a414e';
    ctx.fillRect(CENTER - HALF_ROAD, 0, ROAD_WIDTH, CANVAS_SIZE); // vertical
    ctx.fillRect(0, CENTER - HALF_ROAD, CANVAS_SIZE, ROAD_WIDTH); // horizontal
    ctx.fillStyle = '#454d5c';
    ctx.fillRect(CENTER - HALF_ROAD, CENTER - HALF_ROAD, ROAD_WIDTH, ROAD_WIDTH); // intersection

    // ─── Center divider (solid yellow) ───
    ctx.strokeStyle = '#d4a017';
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(CENTER, 0); ctx.lineTo(CENTER, CENTER - HALF_ROAD); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CENTER, CENTER + HALF_ROAD); ctx.lineTo(CENTER, CANVAS_SIZE); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, CENTER); ctx.lineTo(CENTER - HALF_ROAD, CENTER); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(CENTER + HALF_ROAD, CENTER); ctx.lineTo(CANVAS_SIZE, CENTER); ctx.stroke();

    // ─── Lane dividers (dashed white) ───
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 10]);
    [CENTER - LANE_W, CENTER + LANE_W].forEach(x => {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CENTER - HALF_ROAD); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, CENTER + HALF_ROAD); ctx.lineTo(x, CANVAS_SIZE); ctx.stroke();
    });
    [CENTER - LANE_W, CENTER + LANE_W].forEach(y => {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CENTER - HALF_ROAD, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CENTER + HALF_ROAD, y); ctx.lineTo(CANVAS_SIZE, y); ctx.stroke();
    });
    ctx.setLineDash([]);

    // ─── Road edges ───
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    [CENTER - HALF_ROAD, CENTER + HALF_ROAD].forEach(x => {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CENTER - HALF_ROAD); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, CENTER + HALF_ROAD); ctx.lineTo(x, CANVAS_SIZE); ctx.stroke();
    });
    [CENTER - HALF_ROAD, CENTER + HALF_ROAD].forEach(y => {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CENTER - HALF_ROAD, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(CENTER + HALF_ROAD, y); ctx.lineTo(CANVAS_SIZE, y); ctx.stroke();
    });

    // ─── Direction arrows (Left-Hand Traffic) ───
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // North arm: incoming ↓ on EAST half, outgoing ↑ on WEST half
    ctx.fillText('↑', CENTER - LANE_W * 1.5, CENTER - HALF_ROAD - 50);
    ctx.fillText('↑', CENTER - LANE_W * 0.5, CENTER - HALF_ROAD - 50);
    ctx.fillText('↓', CENTER + LANE_W * 0.5, CENTER - HALF_ROAD - 50);
    ctx.fillText('↓', CENTER + LANE_W * 1.5, CENTER - HALF_ROAD - 50);
    // South arm: incoming ↑ on WEST half, outgoing ↓ on EAST half
    ctx.fillText('↑', CENTER - LANE_W * 1.5, CENTER + HALF_ROAD + 50);
    ctx.fillText('↑', CENTER - LANE_W * 0.5, CENTER + HALF_ROAD + 50);
    ctx.fillText('↓', CENTER + LANE_W * 0.5, CENTER + HALF_ROAD + 50);
    ctx.fillText('↓', CENTER + LANE_W * 1.5, CENTER + HALF_ROAD + 50);
    // East arm: incoming ← on SOUTH half, outgoing → on NORTH half
    ctx.fillText('→', CENTER + HALF_ROAD + 50, CENTER - LANE_W * 1.5);
    ctx.fillText('→', CENTER + HALF_ROAD + 50, CENTER - LANE_W * 0.5);
    ctx.fillText('←', CENTER + HALF_ROAD + 50, CENTER + LANE_W * 0.5);
    ctx.fillText('←', CENTER + HALF_ROAD + 50, CENTER + LANE_W * 1.5);
    // West arm: incoming → on NORTH half, outgoing ← on SOUTH half
    ctx.fillText('→', CENTER - HALF_ROAD - 50, CENTER - LANE_W * 1.5);
    ctx.fillText('→', CENTER - HALF_ROAD - 50, CENTER - LANE_W * 0.5);
    ctx.fillText('←', CENTER - HALF_ROAD - 50, CENTER + LANE_W * 0.5);
    ctx.fillText('←', CENTER - HALF_ROAD - 50, CENTER + LANE_W * 1.5);

    // ─── Lane labels ───
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.font = '8px Inter, sans-serif';
    ctx.fillText('OUT', CENTER - LANE_W * 1, CENTER - HALF_ROAD - 20);
    ctx.fillText('IN', CENTER + LANE_W * 1, CENTER - HALF_ROAD - 20);
    ctx.fillText('IN', CENTER - LANE_W * 1, CENTER + HALF_ROAD + 22);
    ctx.fillText('OUT', CENTER + LANE_W * 1, CENTER + HALF_ROAD + 22);

    // ─── FREE LEFT TURN CHANNELS (Radius perfectly matches outermost lane) ───
    const drawFreeLeftChannel = (cx, cy, startAngle, endAngle, arrowRotation) => {
      // The lane width is 50px. Center of lane is 25px from corner.
      // We'll draw the visually channel from 5 to 45 radius (center 25).
      const innerR = 5;
      const outerR = 45;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, endAngle);
      ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = 'rgba(34, 197, 94, 0.10)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(34, 197, 94, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const midAngle = (startAngle + endAngle) / 2;
      ctx.save();
      ctx.translate(cx + 25 * Math.cos(midAngle), cy + 25 * Math.sin(midAngle));
      ctx.rotate(arrowRotation);
      ctx.fillStyle = 'rgba(34, 197, 94, 0.8)';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('↑', 0, 0);
      ctx.restore();
    };

    // NE corner: North incoming (East half) → East outgoing (North half)
    drawFreeLeftChannel(CENTER + HALF_ROAD, CENTER - HALF_ROAD, Math.PI / 2, Math.PI, Math.PI * 0.75);
    // SE corner: East incoming (South half) → South outgoing (East half)
    drawFreeLeftChannel(CENTER + HALF_ROAD, CENTER + HALF_ROAD, Math.PI, Math.PI * 1.5, Math.PI * 1.25);
    // SW corner: South incoming (West half) → West outgoing (South half)
    drawFreeLeftChannel(CENTER - HALF_ROAD, CENTER + HALF_ROAD, Math.PI * 1.5, Math.PI * 2, Math.PI * 1.75);
    // NW corner: West incoming (North half) → North outgoing (West half)
    drawFreeLeftChannel(CENTER - HALF_ROAD, CENTER - HALF_ROAD, 0, Math.PI / 2, Math.PI * 0.25);

    ctx.fillStyle = 'rgba(34, 197, 94, 0.8)';
    ctx.font = 'bold 8px Inter, sans-serif';
    ctx.fillText('FREE L', CENTER + HALF_ROAD + 25, CENTER - HALF_ROAD - 10);
    ctx.fillText('FREE L', CENTER + HALF_ROAD + 25, CENTER + HALF_ROAD + 10);
    ctx.fillText('FREE L', CENTER - HALF_ROAD - 25, CENTER + HALF_ROAD + 10);
    ctx.fillText('FREE L', CENTER - HALF_ROAD - 25, CENTER - HALF_ROAD - 10);

    // ─── Stop lines (only on INCOMING half) ───
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 3;
    // North incoming stop (east half of north road)
    ctx.beginPath(); ctx.moveTo(CENTER, CENTER - HALF_ROAD - 3); ctx.lineTo(CENTER + HALF_ROAD, CENTER - HALF_ROAD - 3); ctx.stroke();
    // South incoming stop (west half of south road)
    ctx.beginPath(); ctx.moveTo(CENTER - HALF_ROAD, CENTER + HALF_ROAD + 3); ctx.lineTo(CENTER, CENTER + HALF_ROAD + 3); ctx.stroke();
    // East incoming stop (south half of east road)
    ctx.beginPath(); ctx.moveTo(CENTER + HALF_ROAD + 3, CENTER); ctx.lineTo(CENTER + HALF_ROAD + 3, CENTER + HALF_ROAD); ctx.stroke();
    // West incoming stop (north half of west road)
    ctx.beginPath(); ctx.moveTo(CENTER - HALF_ROAD - 3, CENTER - HALF_ROAD); ctx.lineTo(CENTER - HALF_ROAD - 3, CENTER); ctx.stroke();

    // ─── Signal Lights ───
    const signalPositions = {
      N: { x: CENTER + HALF_ROAD + 28, y: CENTER - HALF_ROAD - 30 },
      S: { x: CENTER - HALF_ROAD - 28, y: CENTER + HALF_ROAD + 30 },
      E: { x: CENTER + HALF_ROAD + 30, y: CENTER + HALF_ROAD + 28 },
      W: { x: CENTER - HALF_ROAD - 30, y: CENTER - HALF_ROAD - 28 },
    };

    for (const [arm, pos] of Object.entries(signalPositions)) {
      const isGreenLight = signalState.greenArm === arm && signalState.phase === 'green' && !signalState.emergency;
      const isYellowLight = signalState.greenArm === arm && signalState.phase === 'yellow' && !signalState.emergency;
      const isEmerge = signalState.emergency && signalState.emergencyArm === arm;
      const active = isGreenLight || isEmerge;

      ctx.save();
      // Draw 3-bulb traffic light housing
      ctx.fillStyle = '#2d3748';
      ctx.fillRect(pos.x - 10, pos.y - 30, 20, 60);
      ctx.strokeStyle = '#4a5568';
      ctx.strokeRect(pos.x - 10, pos.y - 30, 20, 60);

      // Top Bulb: RED
      ctx.fillStyle = (!active && !isYellowLight) ? '#ef4444' : 'rgba(239, 68, 68, 0.2)';
      ctx.beginPath(); ctx.arc(pos.x, pos.y - 18, 6, 0, Math.PI * 2); ctx.fill();

      // Middle Bulb: YELLOW
      ctx.fillStyle = isYellowLight ? '#eab308' : 'rgba(234, 179, 8, 0.2)';
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2); ctx.fill();

      // Bottom Bulb: GREEN
      ctx.fillStyle = active ? '#22c55e' : 'rgba(34, 197, 94, 0.2)';
      ctx.beginPath(); ctx.arc(pos.x, pos.y + 18, 6, 0, Math.PI * 2); ctx.fill();

      // Active border glow
      if (active || isYellowLight) {
        ctx.strokeStyle = active ? 'rgba(34, 197, 94, 0.8)' : 'rgba(234, 179, 8, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(pos.x - 10, pos.y - 30, 20, 60);
      }
      ctx.restore();

      if (active) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px JetBrains Mono, monospace';
        ctx.fillText(`${signalState.countdown}s`, pos.x - (arm === 'E' ? -15 : 15), pos.y + 40);
      } else if (isYellowLight) {
        ctx.fillStyle = '#eab308';
        ctx.font = 'bold 11px JetBrains Mono, monospace';
        ctx.fillText(`${signalState.countdown}s`, pos.x - (arm === 'E' ? -15 : 15), pos.y + 40);
      }
    }

    // ─── Arm Labels ───
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillText('N O R T H', CENTER, 14);
    ctx.fillText('S O U T H', CENTER, CANVAS_SIZE - 14);
    ctx.save(); ctx.translate(14, CENTER); ctx.rotate(-Math.PI / 2); ctx.fillText('W E S T', 0, 0); ctx.restore();
    ctx.save(); ctx.translate(CANVAS_SIZE - 14, CENTER); ctx.rotate(Math.PI / 2); ctx.fillText('E A S T', 0, 0); ctx.restore();

    // ─── DRAW VEHICLES ───
    const dots = vehicleDotsRef.current;
    const globalPositions = []; // For 2D collision detection across ALL arms

    for (const arm of ARMS) {
      const armDots = dots[arm] || [];
      const isGreen = signalState.greenArm === arm && signalState.phase === 'green' && !signalState.emergency;
      const isEmergencyGreen = signalState.emergency && signalState.emergencyArm === arm;
      const canMove = isGreen || isEmergencyGreen;

      const freeLeftDots = [];
      const approachDots = []; // UNIFIED: both straight (lane 1) and right-turn approach (lane 2, rightTurnProgress < 0)
      const turningDots = []; // Right-turn vehicles actively in their curve (rightTurnProgress >= 0)

      for (const d of armDots) {
        if (d.lane === 0) freeLeftDots.push(d);
        else approachDots.push(d); // only straight lanes
      }

      // Sort queues
      approachDots.sort((a, b) => a.offset - b.offset);
      freeLeftDots.sort((a, b) => b.freeLeftProgress - a.freeLeftProgress);

      const activeDots = [];
      const renderQueue = [];

      // ════ 1. FREE-LEFT (always moving, faster) ════
      for (let i = 0; i < freeLeftDots.length; i++) {
        const dot = freeLeftDots[i];
        let maxProg = 2.0;
        if (i > 0) maxProg = freeLeftDots[i - 1].freeLeftProgress - 0.22;
        if (dot.freeLeftProgress < maxProg) {
          dot.freeLeftProgress += dot.speed * 0.008; // 2x faster
        }
        if (dot.freeLeftProgress > 1.8) continue;

        const t = dot.freeLeftProgress;
        let x, y;
        const curveR = 25;
        const cx = arm === 'N' || arm === 'E' ? CENTER + HALF_ROAD : CENTER - HALF_ROAD;
        const cy = arm === 'E' || arm === 'S' ? CENTER + HALF_ROAD : CENTER - HALF_ROAD;

        if (arm === 'N') {
          if (t < 0.4) { x = cx - 25; y = cy - (1 - t / 0.4) * 200; }
          else if (t < 0.75) { const a = Math.PI - ((t - 0.4) / 0.35) * (Math.PI / 2); x = cx + curveR * Math.cos(a); y = cy + curveR * Math.sin(a); }
          else { x = cx + ((t - 0.75) / 0.25) * 160; y = cy + 25; }
        } else if (arm === 'E') {
          if (t < 0.4) { x = cx + (1 - t / 0.4) * 200; y = cy - 25; }
          else if (t < 0.75) { const a = (Math.PI * 1.5) - ((t - 0.4) / 0.35) * (Math.PI / 2); x = cx + curveR * Math.cos(a); y = cy + curveR * Math.sin(a); }
          else { x = cx - 25; y = cy + ((t - 0.75) / 0.25) * 160; }
        } else if (arm === 'S') {
          if (t < 0.4) { x = cx + 25; y = cy + (1 - t / 0.4) * 200; }
          else if (t < 0.75) { const a = (Math.PI * 2) - ((t - 0.4) / 0.35) * (Math.PI / 2); x = cx + curveR * Math.cos(a); y = cy + curveR * Math.sin(a); }
          else { x = cx - ((t - 0.75) / 0.25) * 160; y = cy - 25; }
        } else if (arm === 'W') {
          if (t < 0.4) { x = cx - (1 - t / 0.4) * 200; y = cy + 25; }
          else if (t < 0.75) { const a = (Math.PI / 2) - ((t - 0.4) / 0.35) * (Math.PI / 2); x = cx + curveR * Math.cos(a); y = cy + curveR * Math.sin(a); }
          else { x = cx + 25; y = cy - ((t - 0.75) / 0.25) * 160; }
        }

        const startHeading = { 'N': 0, 'E': Math.PI / 2, 'S': Math.PI, 'W': -Math.PI / 2 }[arm];
        let rot = startHeading;
        if (t > 0.4 && t < 0.75) rot = startHeading - (Math.PI / 2) * ((t - 0.4) / 0.35);
        else if (t >= 0.75) rot = startHeading - Math.PI / 2;

        renderQueue.push({ dot, x, y, rot });
        activeDots.push(dot);
      }

      // ════ 2. UNIFIED APPROACH QUEUE (straight + right-turn approach share inner lane) ════
      for (let i = 0; i < approachDots.length; i++) {
        const dot = approachDots[i];

        let targetOffset = 20 + i * 45;
        const passedStopLine = dot.offset < 20;

        // Right-turn: when it reaches the stop line and can move, begin turning
        if (dot.lane === 2 && dot.rightTurnProgress < 0 && (canMove || passedStopLine)) {
          dot.rightTurnProgress = 0;
          turningDots.push(dot);
          activeDots.push(dot);
          continue; // Will be processed in the turning section
        }

        if (canMove || passedStopLine || (dot.type === 'ambulance' && signalState.emergencyArm === arm)) {
          targetOffset = -500;
        }
        // Strict barrier: CANNOT pass the vehicle in front, period
        if (i > 0) {
          targetOffset = Math.max(targetOffset, approachDots[i - 1].offset + 45);
        }
        if (dot.offset > targetOffset) {
          dot.offset = Math.max(targetOffset, dot.offset - dot.speed);
        }
        if (dot.offset < -420) continue;

        // ── Ambulance junction-crossing detection ──
        if (dot.type === 'ambulance' && dot.offset < -150 && onAmbulanceClear) {
          if (!dot._cleared) {
            dot._cleared = true;
            setTimeout(() => onAmbulanceClear(arm), 0);
          }
        }

        let x, y;
        switch (arm) {
          case 'N': x = CENTER + LANE_W * 0.5; y = CENTER - HALF_ROAD - dot.offset; break;
          case 'S': x = CENTER - LANE_W * 0.5; y = CENTER + HALF_ROAD + dot.offset; break;
          case 'E': x = CENTER + HALF_ROAD + dot.offset; y = CENTER + LANE_W * 0.5; break;
          case 'W': x = CENTER - HALF_ROAD - dot.offset; y = CENTER - LANE_W * 0.5; break;
        }
        const rot = { 'N': 0, 'E': Math.PI / 2, 'S': Math.PI, 'W': -Math.PI / 2 }[arm];
        renderQueue.push({ dot, x, y, rot });
        activeDots.push(dot);
      }

      // ════ 3. RIGHT TURN SECTION REMOVED ════
      // Right turns are no longer processed

      // Update dots ref for this arm
      dots[arm] = activeDots;

      // Collect positions for global collision check
      for (const rq of renderQueue) {
        globalPositions.push(rq);
      }

      // 3. Sprite Rendering for this arm
      for (const rq of renderQueue) {
        const { dot, x, y, rot } = rq;
        if (dot.type === 'ambulance') {
          dot.flash = (dot.flash || 0) + 1;
        }

        const imgKey = dot.type === 'auto' ? 'rickshaw' : (dot.type === 'ambulance' ? 'bus' : dot.type);
        const img = vehicleImages[imgKey];

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);

        if (img && img.complete && dot.type !== 'ambulance') {
          let w = 18, h = 36;
          if (dot.type === 'bus') { w = 24; h = 50; }
          else if (dot.type === 'bike') { w = 10; h = 22; }
          else if (dot.type === 'auto') { w = 18; h = 30; }

          ctx.shadowColor = 'rgba(0,0,0,0.6)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 4;
          ctx.drawImage(img, -w / 2, -h / 2, w, h);
        } else if (dot.type === 'ambulance') {
          const w = 24, h = 48;
          ctx.shadowColor = dot.flash % 20 < 10 ? '#ef4444' : '#3b82f6';
          ctx.shadowBlur = 20;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-w / 2, -h / 2, w, h);
          ctx.strokeStyle = '#aaaaaa'; ctx.strokeRect(-w / 2, -h / 2, w, h);
          ctx.fillStyle = dot.flash % 20 < 10 ? '#ef4444' : '#1d4ed8';
          ctx.fillRect(-w / 2, -h / 2 + 6, w, 4);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(-3, -4 - 6, 6, 12); ctx.fillRect(-8, -1 - 6, 16, 6);
        } else {
          ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2);
          ctx.fillStyle = '#fff'; ctx.fill();
        }
        ctx.restore();
      }
    }

    // ─── Emergency overlay ───
    if (signalState.emergency) {
      const pulse = Math.sin(Date.now() / 200) * 0.12 + 0.12;
      ctx.fillStyle = `rgba(239, 68, 68, ${pulse})`;
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(CENTER - 170, 38, 340, 32);
      ctx.fillStyle = '#ef4444'; ctx.font = 'bold 16px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.fillText('🚑 EMERGENCY OVERRIDE ACTIVE', CENTER, 59);
    }

    // ─── Bottom info bar ───
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, CANVAS_SIZE - 26, CANVAS_SIZE, 26);
    ctx.font = 'bold 10px Inter, sans-serif'; ctx.textAlign = 'left';
    ctx.fillStyle = mode === 'ai' ? '#22c55e' : '#eab308';
    ctx.fillText(mode === 'ai' ? '● AI ADAPTIVE' : '● FIXED TIMER', 10, CANVAS_SIZE - 9);
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillText('Indian Left-Hand Traffic  ·  Yellow = center divider', CENTER, CANVAS_SIZE - 9);
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(34,197,94,0.65)';
    ctx.fillText('↰ FREE LEFT ALWAYS ON', CANVAS_SIZE - 10, CANVAS_SIZE - 9);

    animFrameRef.current = requestAnimationFrame(draw);
  }, [signalState, mode, onAmbulanceClear]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: CANVAS_SIZE, height: CANVAS_SIZE,
        borderRadius: '16px',
        border: '2px solid rgba(255,255,255,0.08)',
        boxShadow: '0 0 40px rgba(0,0,0,0.5)',
      }}
    />
  );
}
