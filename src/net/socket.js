import { useStore } from '../state/store';
import { enqueue } from '../sim/traffic';

// rolling batch history for pps / bandwidth / sparkline
export const history = [];
// src ip -> { bytes, n } for top talkers
export const talkers = new Map();

let ws = null;
const lastAlertBySrc = new Map();
let lastAlertGlobal = 0;

export function connect() {
  const port = new URLSearchParams(location.search).get('ws') || 8765;
  const host = location.hostname || '127.0.0.1';
  ws = new WebSocket(`ws://${host}:${port}`);

  ws.onopen = () => useStore.setState({ wsUp: true });

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    const st = useStore.getState();

    if (msg.type === 'hello') {
      useStore.setState({ mode: msg.mode });
      return;
    }
    if (msg.type !== 'batch') return;

    const now = performance.now();
    history.push({ t: now, n: msg.n, bytes: msg.bytes });
    while (history.length && now - history[0].t > 60000) history.shift();

    const counts = { ...st.counts };
    for (const pkt of msg.packets) {
      const p = counts[pkt.p] !== undefined ? pkt.p : 'OTHER';
      counts[p]++;

      const talk = talkers.get(pkt.s) || { bytes: 0, n: 0 };
      talk.bytes += pkt.b;
      talk.n++;
      talkers.set(pkt.s, talk);

      if (pkt.x) {
        const now2 = Date.now();
        const last = lastAlertBySrc.get(pkt.s) || 0;
        if (now2 - last > 6000 &&
            (now2 - lastAlertGlobal > 2500 || st.attackActive)) {
          lastAlertBySrc.set(pkt.s, now2);
          lastAlertGlobal = now2;
          st.addAlert('warn',
            `Suspicious traffic from ${pkt.s} → port ${pkt.dp || '?'}`);
        }
      }

      if (!st.paused && !st.filters[p]) enqueue(pkt);
    }
    useStore.setState({ counts, total: st.total + msg.n });
  };

  ws.onclose = () => {
    useStore.setState({ wsUp: false, mode: 'reconnecting' });
    setTimeout(connect, 1500);
  };
}

export function simulateAttack() {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ cmd: 'attack' }));
  const st = useStore.getState();
  st.addAlert('crit', 'DDoS simulation initiated — flood signature incoming');
  useStore.setState({ attackActive: true });
  setTimeout(() => useStore.setState({ attackActive: false }), 10000);
}
