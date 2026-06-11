import { create } from 'zustand';
import { PROTOS } from '../sim/constants';

const zeroCounts = () => {
  const c = {};
  for (const p of Object.keys(PROTOS)) c[p] = 0;
  return c;
};

let alertId = 0;

export const useStore = create((set) => ({
  mode: 'connecting',
  wsUp: false,

  paused: false,
  timeScale: 1,
  camMode: 'orbit',          // 'orbit' | 'cinematic' | 'follow'
  threatView: false,
  search: '',

  filters: {},               // proto -> true means hidden
  counts: zeroCounts(),
  pps: 0,
  mbps: 0,
  total: 0,
  vehiclesActive: 0,
  health: 100,
  alerts: [],
  topTalkers: [],
  attackActive: false,

  hover: null,               // { slot, x, y }
  selected: null,            // slot index

  set,
  toggleFilter: (p) =>
    set((s) => ({ filters: { ...s.filters, [p]: !s.filters[p] } })),
  addAlert: (sev, msg) =>
    set((s) => ({
      alerts: [
        { id: ++alertId, t: Date.now(), sev, msg },
        ...s.alerts,
      ].slice(0, 40),
    })),
}));
