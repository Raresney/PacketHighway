import {
  PROTOS, CLASSES, LANES_PER_DIR, LANE_W, MEDIAN_HALF, ROAD_LEN, POOL,
  LANE_FACTOR,
} from './constants';

// ---------------------------------------------------------------- pool

export const vehicles = [];
const freeList = [];
for (let i = 0; i < POOL; i++) {
  vehicles.push({ active: false, slot: i });
  freeList.push(POOL - 1 - i);
}

const queues = { in: [], out: [] };
export const totals = { spawned: 0, dropped: 0 };

export function laneZ(dir, lane) {
  const off = MEDIAN_HALF + (lane + 0.5) * LANE_W;
  return dir === 'out' ? off : -off;
}

export function worldX(v) {
  return v.dir === 'out' ? v.s - ROAD_LEN / 2 : ROAD_LEN / 2 - v.s;
}

export function headingOf(dir) {
  return dir === 'out' ? 0 : Math.PI;
}

// ---------------------------------------------------------------- intake

export function enqueue(pkt) {
  const proto = PROTOS[pkt.p] ? pkt.p : 'OTHER';
  const dir = pkt.o ? 'out' : 'in';
  const q = queues[dir];
  if (q.length < 240) q.push({ pkt, proto });
  else totals.dropped++;
}

function spawnClear(dir, lane) {
  for (const v of vehicles) {
    if (!v.active || v.dir !== dir) continue;
    if (v.lane !== lane && v.targetLane !== lane) continue;
    if (v.s - v.def.len < 16) return false;
  }
  return true;
}

function spawn(dir) {
  const q = queues[dir];
  if (!q.length) return false;
  if (!freeList.length) { q.shift(); totals.dropped++; return true; }

  const { pkt, proto } = q[0];
  const def = CLASSES[PROTOS[proto].cls];
  for (const lane of def.lanePref) {
    if (!spawnClear(dir, lane)) continue;
    q.shift();
    const slot = freeList.pop();
    const v = vehicles[slot];
    v.active = true;
    v.proto = proto;
    v.cls = PROTOS[proto].cls;
    v.def = def;
    v.pkt = pkt;
    v.dir = dir;
    v.lane = lane;
    v.targetLane = lane;
    v.z = laneZ(dir, lane);
    v.s = 0;
    v.vel = def.speed * 0.55;
    v.wheelA = 0;
    v.brake = false;
    v.blinker = 0;
    v.cooldown = 3 + Math.random() * 6;
    v.jitter = 0.92 + Math.random() * 0.16;
    v.latF = pkt.l ? 1 - Math.min(pkt.l, 150) / 600 : 1;
    totals.spawned++;
    return true;
  }
  return false;
}

function release(v) {
  v.active = false;
  freeList.push(v.slot);
}

// ---------------------------------------------------------------- step

const buckets = [];
for (let d = 0; d < 2; d++) {
  buckets.push([]);
  for (let l = 0; l < LANES_PER_DIR; l++) buckets[d].push([]);
}

export function step(dt) {
  for (const dir of ['in', 'out']) {
    let n = 0;
    while (n < 3 && spawn(dir)) n++;
  }

  for (const row of buckets) for (const b of row) b.length = 0;

  for (const v of vehicles) {
    if (!v.active) continue;
    const d = v.dir === 'out' ? 1 : 0;
    buckets[d][v.lane].push(v);
    if (v.targetLane !== v.lane) buckets[d][v.targetLane].push(v);
    v._tgt = v.def.speed * LANE_FACTOR[v.targetLane] * v.jitter * v.latF;
    v._desired = v._tgt;
    v._gap = 1e9;
  }

  // car following: clamp target speed against the leader in every lane
  // the vehicle currently occupies
  for (const row of buckets) {
    for (const b of row) {
      b.sort((a, c) => c.s - a.s);
      for (let i = 1; i < b.length; i++) {
        const lead = b[i - 1], v = b[i];
        if (lead === v) continue;
        const gap = lead.s - lead.def.len - v.s;
        if (gap < v._gap) v._gap = gap;
        const headway = 6 + v.vel * 0.45;
        const safe = lead.vel + (gap - headway) * 1.2;
        if (safe < v._tgt) v._tgt = Math.max(0, safe);
      }
    }
  }

  for (const v of vehicles) {
    if (!v.active) continue;

    // smooth accelerate / brake, never teleport
    const dv = v._tgt - v.vel;
    v.brake = dv < -0.8;
    v.vel += Math.max(-13 * dt, Math.min(5.5 * dt, dv));
    if (v.vel < 0) v.vel = 0;
    v.s += v.vel * dt;
    v.wheelA += (v.vel * dt) / v.def.wheels.r;

    // lane changes: look for a better lane when stuck behind someone
    v.cooldown -= dt;
    if (v.lane === v.targetLane && v.cooldown < 0 && v._tgt < v._desired * 0.8) {
      const d = v.dir === 'out' ? 1 : 0;
      for (const cand of [v.lane - 1, v.lane + 1]) {
        if (cand < 0 || cand >= LANES_PER_DIR) continue;
        let ok = true;
        for (const o of buckets[d][cand]) {
          if (o === v) continue;
          const ahead = o.s - o.def.len - v.s;
          const behind = v.s - v.def.len - o.s;
          if (ahead > -2 && ahead < v._gap + 6 && ahead < 26) { ok = false; break; }
          if (behind > -2 && behind < 14) { ok = false; break; }
          if (Math.abs(o.s - v.s) < v.def.len + o.def.len) { ok = false; break; }
        }
        if (ok) {
          v.targetLane = cand;
          v.blinker = laneZ(v.dir, cand) > v.z === (v.dir === 'out') ? 1 : -1;
          v.cooldown = 5 + Math.random() * 6;
          break;
        }
      }
    }

    // glide between lane centers
    const tz = laneZ(v.dir, v.targetLane);
    if (Math.abs(tz - v.z) > 0.02) {
      const rate = (LANE_W / 1.3) * dt;
      v.z += Math.max(-rate, Math.min(rate, tz - v.z));
    } else if (v.lane !== v.targetLane) {
      v.z = tz;
      v.lane = v.targetLane;
      v.blinker = 0;
    }

    if (v.s > ROAD_LEN + 12) release(v);
  }
}

export function activeCount() {
  let n = 0;
  for (const v of vehicles) if (v.active) n++;
  return n;
}

export function queueDepth() {
  return queues.in.length + queues.out.length;
}
