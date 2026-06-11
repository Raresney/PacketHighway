import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { PROTOS } from '../sim/constants';
import { vehicles, activeCount } from '../sim/traffic';
import { history, talkers } from '../net/socket';
import { simulateAttack } from '../net/socket';

// ---------------------------------------------------------------- charts

function Sparkline() {
  const ref = useRef();
  useEffect(() => {
    const cv = ref.current;
    const c = cv.getContext('2d');
    const id = setInterval(() => {
      const W = cv.width = cv.clientWidth * 2;
      const H = cv.height = cv.clientHeight * 2;
      const now = performance.now();
      const buckets = new Array(40).fill(0);
      for (const h of history) {
        const age = now - h.t;
        if (age > 40000) continue;
        buckets[39 - Math.floor(age / 1000)] += h.n;
      }
      const max = Math.max(10, ...buckets);
      c.clearRect(0, 0, W, H);
      const grad = c.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, 'rgba(88,166,255,0.45)');
      grad.addColorStop(1, 'rgba(88,166,255,0)');
      c.beginPath();
      c.moveTo(0, H);
      buckets.forEach((v, i) => {
        c.lineTo((i / 39) * W, H - (v / max) * (H - 8) - 2);
      });
      c.lineTo(W, H);
      c.closePath();
      c.fillStyle = grad;
      c.fill();
      c.beginPath();
      buckets.forEach((v, i) => {
        const x = (i / 39) * W, y = H - (v / max) * (H - 8) - 2;
        i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
      });
      c.strokeStyle = '#58a6ff';
      c.lineWidth = 2.5;
      c.stroke();
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return <canvas ref={ref} className="spark" />;
}

function Donut({ counts }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const R = 34, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <svg viewBox="0 0 100 100" className="donut">
      <circle cx="50" cy="50" r={R} fill="none" stroke="#1a212c" strokeWidth="13" />
      {Object.keys(PROTOS).map((p) => {
        const frac = counts[p] / total;
        const dash = `${frac * C} ${C}`;
        const off = -acc * C;
        acc += frac;
        return (
          <circle key={p} cx="50" cy="50" r={R} fill="none"
            stroke={PROTOS[p].color} strokeWidth="13"
            strokeDasharray={dash} strokeDashoffset={off}
            transform="rotate(-90 50 50)" style={{ transition: 'stroke-dasharray .6s' }} />
        );
      })}
      <text x="50" y="47" textAnchor="middle" className="donut-num">{total}</text>
      <text x="50" y="60" textAnchor="middle" className="donut-lbl">SAMPLED</text>
    </svg>
  );
}

function Health({ value }) {
  const R = 26, C = 2 * Math.PI * R;
  const color = value > 75 ? '#2ee06a' : value > 45 ? '#ffd33d' : '#ff4d4d';
  return (
    <svg viewBox="0 0 64 64" className="health">
      <circle cx="32" cy="32" r={R} fill="none" stroke="#1a212c" strokeWidth="6" />
      <circle cx="32" cy="32" r={R} fill="none" stroke={color} strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${(value / 100) * C} ${C}`}
        transform="rotate(-90 32 32)"
        style={{ transition: 'stroke-dasharray .8s, stroke .8s' }} />
      <text x="32" y="36" textAnchor="middle" className="health-num">{value}</text>
    </svg>
  );
}

// ---------------------------------------------------------------- panels

function TopBar() {
  const { mode, wsUp, pps, mbps, total, vehiclesActive, health } = useStore();
  return (
    <>
      <div className="brand glass">
        <img src="./logo.svg" alt="" height="34" />
        <span className={`badge ${wsUp ? mode : 'down'}`}>
          {wsUp ? mode : 'offline'}
        </span>
      </div>
      <div className="stats glass">
        <div className="stat"><b>{pps}</b><label>PKT/S</label></div>
        <div className="stat"><b>{mbps}</b><label>MBIT/S</label></div>
        <div className="stat"><b>{vehiclesActive}</b><label>VEHICLES</label></div>
        <div className="stat"><b>{total > 99999 ? Math.round(total / 1000) + 'k' : total}</b><label>TOTAL</label></div>
        <div className="stat health-tile"><Health value={health} /><label>HEALTH</label></div>
      </div>
    </>
  );
}

function LeftPanel() {
  const { counts, filters, toggleFilter, topTalkers } = useStore();
  return (
    <div className="left glass">
      <h3>THROUGHPUT <span>40s</span></h3>
      <Sparkline />
      <h3>PROTOCOL DISTRIBUTION</h3>
      <div className="dist">
        <Donut counts={counts} />
        <div className="chips">
          {Object.keys(PROTOS).map((p) => (
            <button key={p}
              className={`chip ${filters[p] ? 'off' : ''}`}
              onClick={() => toggleFilter(p)}>
              <i style={{ background: PROTOS[p].color }} />
              {p}<em>{counts[p] > 9999 ? (counts[p] / 1000).toFixed(1) + 'k' : counts[p]}</em>
            </button>
          ))}
        </div>
      </div>
      <h3>TOP TALKERS</h3>
      <div className="talkers">
        {topTalkers.length === 0 && <div className="empty">listening…</div>}
        {topTalkers.map((t) => (
          <div key={t.ip} className="talker">
            <span className="ip">{t.ip}</span>
            <span className="bar"><i style={{ width: `${t.pct}%` }} /></span>
            <span className="kb">{t.kb} KB</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RightPanel() {
  const { alerts, selected, set, camMode } = useStore();
  const v = selected != null ? vehicles[selected] : null;
  const pkt = v?.active ? v.pkt : null;

  return (
    <div className="right">
      {pkt && (
        <div className="inspector glass">
          <h3>
            PACKET INSPECTOR
            <button className="x" onClick={() => set({ selected: null })}>✕</button>
          </h3>
          <div className="kv"><label>Protocol</label>
            <b style={{ color: PROTOS[v.proto].color }}>{v.proto}</b></div>
          <div className="kv"><label>Source</label><b>{pkt.s}{pkt.sp ? ':' + pkt.sp : ''}</b></div>
          <div className="kv"><label>Destination</label><b>{pkt.d}{pkt.dp ? ':' + pkt.dp : ''}</b></div>
          <div className="kv"><label>Size</label><b>{pkt.b} B</b></div>
          <div className="kv"><label>Latency</label><b>{pkt.l != null ? pkt.l + ' ms' : '—'}</b></div>
          <div className="kv"><label>Captured</label>
            <b>{pkt.t ? new Date(pkt.t).toLocaleTimeString() : '—'}</b></div>
          <div className="flags">
            {pkt.e ? <span className="flag enc">ENCRYPTED</span> : null}
            {pkt.x ? <span className="flag sus">SUSPICIOUS</span> : null}
            <span className="flag dir">{pkt.o ? 'OUTBOUND' : 'INBOUND'}</span>
          </div>
          <button
            className={`btn follow ${camMode === 'follow' ? 'on' : ''}`}
            onClick={() => set({ camMode: camMode === 'follow' ? 'orbit' : 'follow' })}>
            {camMode === 'follow' ? '● FOLLOWING' : '◉ FOLLOW PACKET'}
          </button>
        </div>
      )}
      <div className="alerts glass">
        <h3>SECURITY ALERTS</h3>
        {alerts.length === 0 && <div className="empty">no anomalies detected</div>}
        {alerts.slice(0, 8).map((a) => (
          <div key={a.id} className={`alert ${a.sev}`}>
            <span className="t">{new Date(a.t).toLocaleTimeString()}</span>
            <span className="m">{a.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BottomBar() {
  const { paused, timeScale, camMode, threatView, attackActive, set } = useStore();
  return (
    <div className="bottom glass">
      <button className="btn" onClick={() => set({ paused: !paused })}>
        {paused ? '▶' : '⏸'}
      </button>
      <div className="ts">
        <label>×{timeScale.toFixed(2)}</label>
        <input type="range" min="0.25" max="3" step="0.25" value={timeScale}
          onChange={(e) => set({ timeScale: +e.target.value })} />
      </div>
      <div className="seg">
        {['orbit', 'cinematic', 'follow'].map((m) => (
          <button key={m} className={camMode === m ? 'on' : ''}
            onClick={() => set({ camMode: m })}>{m.toUpperCase()}</button>
        ))}
      </div>
      <button className={`btn toggle ${threatView ? 'on' : ''}`}
        onClick={() => set({ threatView: !threatView })}>
        ⚠ THREAT VIEW
      </button>
      <button className="btn attack" disabled={attackActive}
        onClick={simulateAttack}>
        {attackActive ? '⛔ ATTACK IN PROGRESS' : '☠ SIMULATE ATTACK'}
      </button>
    </div>
  );
}

function SearchBox() {
  const { search, set } = useStore();
  return (
    <div className="search glass">
      <input
        placeholder="search by IP…"
        value={search}
        onChange={(e) => set({ search: e.target.value })}
        spellCheck={false}
      />
      {search && <button onClick={() => set({ search: '' })}>✕</button>}
    </div>
  );
}

function Tooltip() {
  const hover = useStore((s) => s.hover);
  if (!hover) return null;
  const v = vehicles[hover.slot];
  if (!v?.active) return null;
  const p = v.pkt;
  return (
    <div className="tooltip glass"
      style={{ left: Math.min(hover.x + 16, window.innerWidth - 330), top: hover.y + 14 }}>
      <b style={{ color: PROTOS[v.proto].color }}>{v.proto}</b>
      {' '}{p.s}{p.sp ? ':' + p.sp : ''} → {p.d}{p.dp ? ':' + p.dp : ''}
      <div className="sub">
        {p.b} B · {p.l != null ? p.l + ' ms · ' : ''}
        {p.o ? 'outbound' : 'inbound'}
        {p.x ? ' · ⚠ suspicious' : ''}{p.e ? ' · 🔒 encrypted' : ''}
      </div>
    </div>
  );
}

function Splash() {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setGone(true), 2600);
    return () => clearTimeout(id);
  }, []);
  if (gone) return null;
  return (
    <div className="splash">
      <img src="./logo.svg" alt="PacketHighway" width="420" />
      <div className="boot">INITIALIZING TELEMETRY GRID</div>
    </div>
  );
}

// ---------------------------------------------------------------- root

export default function Hud() {
  // periodic aggregation of stats
  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now();
      let n = 0, bytes = 0;
      for (const h of history) {
        if (now - h.t <= 3000) { n += h.n; bytes += h.bytes; }
      }
      const st = useStore.getState();
      const warn60 = st.alerts.filter(
        (a) => Date.now() - a.t < 60000 && a.sev !== 'info').length;
      const health = Math.max(st.attackActive ? 12 : 38, Math.min(100,
        100 - warn60 * 4 - (st.attackActive ? 30 : 0)));

      const top = [...talkers.entries()]
        .sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 5);
      const maxB = top.length ? top[0][1].bytes : 1;
      const topTalkers = top.map(([ip, t]) => ({
        ip, kb: Math.round(t.bytes / 1024),
        pct: Math.round((t.bytes / maxB) * 100),
      }));

      useStore.setState({
        pps: Math.round(n / 3),
        mbps: +((bytes * 8) / 3 / 1e6).toFixed(2),
        vehiclesActive: activeCount(),
        health,
        topTalkers,
      });
    }, 600);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="hud">
      <TopBar />
      <SearchBox />
      <LeftPanel />
      <RightPanel />
      <BottomBar />
      <Tooltip />
      <Splash />
      <div className="hint">
        drag to orbit · scroll to zoom · hover a vehicle for packet data ·
        click to inspect
      </div>
    </div>
  );
}
