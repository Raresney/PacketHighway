// World scale is metric-ish: 1 unit = 1 m.
export const LANES_PER_DIR = 4;
export const LANE_W = 4.4;
export const MEDIAN_HALF = 4.2;
export const ROAD_LEN = 520;
export const POOL = 600;

// protocol -> vehicle fleet mapping
export const PROTOS = {
  HTTPS: { color: '#2ee06a', cls: 'suv',       label: 'HTTPS' },
  HTTP:  { color: '#ff8c3b', cls: 'van',       label: 'HTTP'  },
  DNS:   { color: '#c792ff', cls: 'moto',      label: 'DNS'   },
  TCP:   { color: '#4da3ff', cls: 'sedan',     label: 'TCP'   },
  UDP:   { color: '#ffd33d', cls: 'sports',    label: 'UDP'   },
  ICMP:  { color: '#ff4d4d', cls: 'emergency', label: 'ICMP'  },
  OTHER: { color: '#9aa7b5', cls: 'utility',   label: 'OTHER' },
};

// Procedural low-poly vehicle blueprints. Local frame: +X forward, Y up.
// boxes: m = 'body' (tinted per protocol) | 'glass'
export const CLASSES = {
  sedan: {
    len: 4.7, speed: 33, lanePref: [1, 2, 0, 3],
    boxes: [
      { s: [4.7, 0.55, 1.9],  p: [0, 0.62, 0],     m: 'body'  },
      { s: [2.4, 0.52, 1.72], p: [-0.15, 1.12, 0], m: 'glass' },
    ],
    wheels: { r: 0.34, w: 0.26, pts: [[1.5, 0.85], [1.5, -0.85], [-1.5, 0.85], [-1.5, -0.85]] },
    lightY: 0.62, halfW: 0.95, halfL: 2.35,
  },
  suv: {
    len: 4.9, speed: 31, lanePref: [1, 2, 0, 3],
    boxes: [
      { s: [4.9, 0.95, 2.0],  p: [0, 0.85, 0],    m: 'body'  },
      { s: [2.9, 0.62, 1.86], p: [-0.2, 1.58, 0], m: 'glass' },
    ],
    wheels: { r: 0.42, w: 0.3, pts: [[1.55, 0.9], [1.55, -0.9], [-1.55, 0.9], [-1.55, -0.9]] },
    lightY: 0.85, halfW: 1.0, halfL: 2.45,
  },
  sports: {
    len: 4.4, speed: 41, lanePref: [0, 1, 2, 3],
    boxes: [
      { s: [4.4, 0.45, 1.95], p: [0, 0.52, 0],     m: 'body'  },
      { s: [1.9, 0.4, 1.6],   p: [-0.35, 0.92, 0], m: 'glass' },
      { s: [0.25, 0.1, 1.7],  p: [-2.0, 0.98, 0],  m: 'body'  },
    ],
    wheels: { r: 0.33, w: 0.3, pts: [[1.45, 0.88], [1.45, -0.88], [-1.45, 0.88], [-1.45, -0.88]] },
    lightY: 0.52, halfW: 0.97, halfL: 2.2,
  },
  van: {
    len: 6.4, speed: 26, lanePref: [2, 3, 1, 0],
    boxes: [
      { s: [6.4, 1.75, 2.15], p: [0, 1.18, 0],    m: 'body'  },
      { s: [0.12, 0.7, 1.9],  p: [3.16, 1.5, 0],  m: 'glass' },
    ],
    wheels: { r: 0.4, w: 0.3, pts: [[2.25, 0.95], [2.25, -0.95], [-2.25, 0.95], [-2.25, -0.95]] },
    lightY: 0.7, halfW: 1.05, halfL: 3.2,
  },
  moto: {
    len: 2.2, speed: 38, lanePref: [0, 1, 2, 3],
    boxes: [
      { s: [1.9, 0.42, 0.5], p: [0, 0.72, 0], m: 'body' },
    ],
    rider: { r: 0.3, p: [-0.2, 1.28, 0] },
    wheels: { r: 0.31, w: 0.12, pts: [[0.85, 0], [-0.85, 0]] },
    lightY: 0.72, halfW: 0.25, halfL: 1.1,
  },
  emergency: {
    len: 5.8, speed: 37, lanePref: [0, 1, 2, 3],
    boxes: [
      { s: [5.8, 1.5, 2.15], p: [0, 1.05, 0],   m: 'body'  },
      { s: [0.12, 0.6, 1.9], p: [2.86, 1.4, 0], m: 'glass' },
    ],
    beacon: { s: [1.1, 0.2, 0.95], p: [0.4, 1.92, 0] },
    wheels: { r: 0.4, w: 0.3, pts: [[2.0, 0.95], [2.0, -0.95], [-2.0, 0.95], [-2.0, -0.95]] },
    lightY: 0.7, halfW: 1.05, halfL: 2.9,
  },
  utility: {
    len: 5.5, speed: 27, lanePref: [2, 3, 1, 0],
    boxes: [
      { s: [5.5, 0.6, 1.95],  p: [0, 0.62, 0],    m: 'body'  },
      { s: [2.1, 1.0, 1.9],   p: [0.95, 1.32, 0], m: 'body'  },
      { s: [0.12, 0.55, 1.7], p: [2.02, 1.45, 0], m: 'glass' },
    ],
    wheels: { r: 0.38, w: 0.28, pts: [[1.85, 0.92], [1.85, -0.92], [-1.85, 0.92], [-1.85, -0.92]] },
    lightY: 0.62, halfW: 0.97, halfL: 2.7,
  },
};

export const LANE_FACTOR = [1.18, 1.05, 0.94, 0.84]; // lane 0 = fast lane
