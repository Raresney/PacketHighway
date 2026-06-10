'use strict';

// ---------------------------------------------------------------- constants

const PROTO_COLORS = {
  HTTPS: '#3fb950',
  HTTP:  '#f0883e',
  DNS:   '#bc8cff',
  TCP:   '#58a6ff',
  UDP:   '#d29922',
  ICMP:  '#f85149',
  OTHER: '#8b949e',
};

// vehicle class by packet size (bytes)
const CLASSES = [
  { max: 120,      kind: 'moto',  len: 20, h: 9,  speed: 240, lanes: [0] },
  { max: 600,      kind: 'car',   len: 36, h: 17, speed: 185, lanes: [0, 1] },
  { max: 1200,     kind: 'van',   len: 50, h: 19, speed: 150, lanes: [1, 2] },
  { max: Infinity, kind: 'truck', len: 74, h: 21, speed: 115, lanes: [2] },
];

const LANE_SPEED = [1.15, 1.0, 0.88]; // inner lane fastest
const LANES = 3;
const LANE_H = 46;
const GRASS = 26;
const SHOULDER = 12;
const MEDIAN = 30;
const GAP = 12;            // min bumper-to-bumper distance
const MAX_CARS = 200;
const MAX_PENDING = 40;    // per-lane on-ramp queue

const COLORS = {
  grass: '#101b12',
  asphalt: '#1c2128',
  shoulderLine: '#c9d1d9',
  laneDash: '#8b949688',
  median: '#16241a',
  rail: '#4d5666',
};

// ---------------------------------------------------------------- state

const canvas = document.getElementById('road');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');
const roadwrap = document.getElementById('roadwrap');

let W = 0, H = 0, DPR = 1;
let medianTop = 0, medianBot = 0;

const cars = [];
const pending = new Map();   // "dir:lane" -> queued packet summaries
const filtered = new Set();  // protocols hidden via legend chips
const counts = {};           // per-protocol cumulative packet counts
const window3s = [];         // [{t, n, bytes}] for pps / bandwidth
let totalPackets = 0;
let paused = false;
let mouse = null;

// ---------------------------------------------------------------- layout

function resize() {
  DPR = window.devicePixelRatio || 1;
  W = roadwrap.clientWidth;
  H = 2 * GRASS + 2 * SHOULDER + 2 * LANES * LANE_H + MEDIAN;
  medianTop = GRASS + SHOULDER + LANES * LANE_H;
  medianBot = medianTop + MEDIAN;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();

function laneCenterY(dir, lane) {
  // lane 0 is the fast lane, next to the median
  return dir === 'in'
    ? medianTop - (lane + 0.5) * LANE_H
    : medianBot + (lane + 0.5) * LANE_H;
}

// inbound drives right-to-left on top, outbound left-to-right on bottom.
// s = distance the vehicle's front has traveled since entering the screen.
function leftEdgeX(car) {
  return car.dir === 'out' ? car.s - car.len : W - car.s;
}

// ---------------------------------------------------------------- spawning

function classify(bytes) {
  return CLASSES.find(c => bytes <= c.max);
}

function enqueue(pkt) {
  if (filtered.has(pkt.p)) return;
  const cls = classify(pkt.b);
  const dir = pkt.o ? 'out' : 'in';
  const lane = cls.lanes[Math.floor(Math.random() * cls.lanes.length)];
  const key = dir + ':' + lane;
  let q = pending.get(key);
  if (!q) { q = []; pending.set(key, q); }
  if (q.length < MAX_PENDING) q.push({ pkt, cls, dir, lane });
}

function laneClear(dir, lane) {
  for (const c of cars) {
    if (c.dir === dir && c.lane === lane && c.s - c.len < GAP) return false;
  }
  return true;
}

function spawnFromQueues() {
  for (const [, q] of pending) {
    if (!q.length || cars.length >= MAX_CARS) continue;
    const { pkt, cls, dir, lane } = q[0];
    if (!laneClear(dir, lane)) continue;
    q.shift();
    cars.push({
      dir, lane,
      s: 0,
      len: cls.len,
      h: cls.h,
      kind: cls.kind,
      v: cls.speed * LANE_SPEED[lane] * (0.92 + Math.random() * 0.16),
      color: PROTO_COLORS[pkt.p] || PROTO_COLORS.OTHER,
      pkt,
      hover: false,
    });
  }
}

// ---------------------------------------------------------------- physics

function update(dt) {
  for (const c of cars) c.s += c.v * dt;

  // simple car-following per lane: never overlap the vehicle ahead
  const groups = new Map();
  for (const c of cars) {
    const key = c.dir + ':' + c.lane;
    (groups.get(key) || groups.set(key, []).get(key)).push(c);
  }
  for (const [, group] of groups) {
    group.sort((a, b) => b.s - a.s);
    for (let i = 1; i < group.length; i++) {
      const ahead = group[i - 1], c = group[i];
      const maxS = ahead.s - ahead.len - GAP;
      if (c.s > maxS) {
        c.s = maxS;
        c.v = Math.min(c.v, ahead.v);
      }
    }
  }

  for (let i = cars.length - 1; i >= 0; i--) {
    if (cars[i].s - cars[i].len > W + 60) cars.splice(i, 1);
  }
}

// ---------------------------------------------------------------- drawing

function drawRoad() {
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = COLORS.asphalt;
  ctx.fillRect(0, GRASS, W, SHOULDER + LANES * LANE_H);
  ctx.fillRect(0, medianBot, W, LANES * LANE_H + SHOULDER);

  ctx.fillStyle = COLORS.median;
  ctx.fillRect(0, medianTop, W, MEDIAN);

  // guardrails on the median
  ctx.strokeStyle = COLORS.rail;
  ctx.lineWidth = 2;
  for (const y of [medianTop + 7, medianBot - 7]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // solid edge lines
  ctx.strokeStyle = COLORS.shoulderLine;
  ctx.lineWidth = 2;
  for (const y of [GRASS + SHOULDER, medianTop - 2,
                   medianBot + 2, medianBot + LANES * LANE_H]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // dashed lane dividers
  ctx.strokeStyle = COLORS.laneDash;
  ctx.setLineDash([26, 30]);
  ctx.lineWidth = 3;
  for (let l = 1; l < LANES; l++) {
    for (const y of [GRASS + SHOULDER + l * LANE_H,
                     medianBot + l * LANE_H]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
}

function drawVehicle(c) {
  const x = leftEdgeX(c);
  const y = laneCenterY(c.dir, c.lane);
  const facing = c.dir === 'out' ? 1 : -1;   // 1: front on the right
  const frontX = facing === 1 ? x + c.len : x;

  // headlight glow
  const gx = frontX + facing * 9;
  const glow = ctx.createRadialGradient(gx, y, 1, gx, y, 22);
  glow.addColorStop(0, 'rgba(255,244,200,0.22)');
  glow.addColorStop(1, 'rgba(255,244,200,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(gx, y, 22, 0, Math.PI * 2);
  ctx.fill();

  if (c.kind === 'moto') {
    ctx.fillStyle = c.color;
    roundRect(x, y - 2.5, c.len, 5, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + c.len / 2, y, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = c.color;
    roundRect(x, y - c.h / 2, c.len, c.h, 3);
    ctx.fill();
    if (c.kind === 'truck') {
      // cab / trailer separation
      const cabW = 20;
      const sepX = facing === 1 ? x + c.len - cabW : x + cabW;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sepX, y - c.h / 2 + 1);
      ctx.lineTo(sepX, y + c.h / 2 - 1);
      ctx.stroke();
    } else {
      // windshield
      ctx.fillStyle = 'rgba(10,14,20,0.55)';
      const wsW = c.len * 0.16;
      const wsX = facing === 1 ? x + c.len * 0.62 : x + c.len * 0.22;
      roundRect(wsX, y - c.h / 2 + 2.5, wsW, c.h - 5, 2);
      ctx.fill();
    }
  }

  // headlights and taillights
  const rearX = facing === 1 ? x : x + c.len;
  ctx.fillStyle = '#fff4c8';
  dot(frontX, y - c.h / 2 + 2.5);
  if (c.kind !== 'moto') dot(frontX, y + c.h / 2 - 2.5);
  ctx.fillStyle = '#ff5252';
  dot(rearX, y - c.h / 2 + 2.5);
  if (c.kind !== 'moto') dot(rearX, y + c.h / 2 - 2.5);

  if (c.hover) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    roundRect(x - 3, y - c.h / 2 - 3, c.len + 6, c.h + 6, 4);
    ctx.stroke();
  }
}

function dot(x, y) {
  ctx.beginPath();
  ctx.arc(x, y, 1.8, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------- tooltip

canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouse = { x: e.clientX - r.left, y: e.clientY - r.top,
            px: e.clientX - roadwrap.getBoundingClientRect().left,
            py: e.clientY - roadwrap.getBoundingClientRect().top };
});
canvas.addEventListener('mouseleave', () => { mouse = null; });

function hitTest() {
  let hit = null;
  if (mouse) {
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i];
      const x = leftEdgeX(c);
      const y = laneCenterY(c.dir, c.lane);
      if (mouse.x >= x - 3 && mouse.x <= x + c.len + 3 &&
          mouse.y >= y - LANE_H / 2 && mouse.y <= y + LANE_H / 2) {
        hit = c;
        break;
      }
    }
  }
  for (const c of cars) c.hover = c === hit;

  if (hit) {
    const p = hit.pkt;
    const port = p.dp ? ':' + p.dp : '';
    const sport = p.sp ? ':' + p.sp : '';
    tooltip.innerHTML =
      `<b>${p.p}</b> ${p.s}${sport} &rarr; ${p.d}${port}` +
      ` &middot; ${p.b} B &middot; ${p.o ? 'outbound' : 'inbound'}`;
    tooltip.style.display = 'block';
    tooltip.style.left = Math.min(mouse.px + 14, W - 330) + 'px';
    tooltip.style.top = (mouse.py + 14) + 'px';
  } else {
    tooltip.style.display = 'none';
  }
}

// ---------------------------------------------------------------- legend

const legend = document.getElementById('legend');
for (const proto of Object.keys(PROTO_COLORS)) {
  counts[proto] = 0;
  const chip = document.createElement('div');
  chip.className = 'chip';
  chip.innerHTML = `<span class="dot" style="background:${
    PROTO_COLORS[proto]}"></span>${proto} <span class="count">0</span>`;
  chip.addEventListener('click', () => {
    if (filtered.has(proto)) filtered.delete(proto);
    else filtered.add(proto);
    chip.classList.toggle('off');
  });
  legend.appendChild(chip);
}

function updateLegend() {
  const chips = legend.children;
  Object.keys(PROTO_COLORS).forEach((proto, i) => {
    chips[i].querySelector('.count').textContent =
      counts[proto] > 9999 ? (counts[proto] / 1000).toFixed(1) + 'k'
                           : counts[proto];
  });
}

// ---------------------------------------------------------------- stats

function updateStats() {
  const now = performance.now();
  while (window3s.length && now - window3s[0].t > 3000) window3s.shift();
  const n = window3s.reduce((a, b) => a + b.n, 0);
  const bytes = window3s.reduce((a, b) => a + b.bytes, 0);
  document.getElementById('pps').textContent = Math.round(n / 3);
  document.getElementById('bw').textContent =
    Math.round((bytes * 8) / 3 / 1000);
  document.getElementById('cars').textContent = cars.length;
  document.getElementById('total').textContent =
    totalPackets > 99999 ? (totalPackets / 1000).toFixed(0) + 'k'
                         : totalPackets;
  updateLegend();
}
setInterval(updateStats, 250);

// ---------------------------------------------------------------- controls

const pauseBtn = document.getElementById('pause');
pauseBtn.addEventListener('click', togglePause);
document.addEventListener('keydown', e => {
  if (e.code === 'Space') { e.preventDefault(); togglePause(); }
});
function togglePause() {
  paused = !paused;
  pauseBtn.innerHTML = paused ? '&#9654;' : '&#10074;&#10074;';
}

// ---------------------------------------------------------------- websocket

const modeBadge = document.getElementById('mode');
const wsPort = new URLSearchParams(location.search).get('ws') || 8765;

function connect() {
  const ws = new WebSocket(`ws://${location.hostname || '127.0.0.1'}:${wsPort}`);
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'hello') {
      modeBadge.textContent = msg.mode;
      modeBadge.className = 'badge ' + msg.mode;
    } else if (msg.type === 'batch') {
      totalPackets += msg.n;
      window3s.push({ t: performance.now(), n: msg.n, bytes: msg.bytes });
      for (const pkt of msg.packets) {
        counts[pkt.p] = (counts[pkt.p] || 0) + 1;
        if (!paused) enqueue(pkt);
      }
    }
  };
  ws.onclose = () => {
    modeBadge.textContent = 'reconnecting';
    modeBadge.className = 'badge down';
    setTimeout(connect, 1500);
  };
}
connect();

// ---------------------------------------------------------------- main loop

let lastT = performance.now();
function frame(now) {
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;

  if (!paused) {
    spawnFromQueues();
    update(dt);
  }
  drawRoad();
  for (const c of cars) drawVehicle(c);
  hitTest();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
