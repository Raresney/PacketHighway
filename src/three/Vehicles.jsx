import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../state/store';
import { PROTOS, CLASSES, POOL } from '../sim/constants';
import { vehicles, step, worldX, headingOf } from '../sim/traffic';

// ---------------------------------------------------------------- assets

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const wheelGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
wheelGeo.rotateX(Math.PI / 2); // axle along Z
const riderGeo = new THREE.SphereGeometry(1, 12, 10);
const discGeo = new THREE.CircleGeometry(1, 24);
discGeo.rotateX(-Math.PI / 2);
const ringGeo = new THREE.RingGeometry(0.78, 1, 32);
ringGeo.rotateX(-Math.PI / 2);

const bodyMat = new THREE.MeshStandardMaterial({
  color: '#ffffff', metalness: 0.55, roughness: 0.32,
});
const glassMat = new THREE.MeshStandardMaterial({
  color: '#0b1220', metalness: 0.9, roughness: 0.08,
});
const darkMat = new THREE.MeshStandardMaterial({
  color: '#0b0e13', roughness: 0.75,
});
const mkLightMat = () => {
  const m = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  m.toneMapped = false;
  return m;
};
const headMat = mkLightMat();
const tailMat = mkLightMat();
const sigMat = mkLightMat();
const beaconMat = mkLightMat();
const shadowMat = new THREE.MeshBasicMaterial({
  color: '#000000', transparent: true, opacity: 0.45, depthWrite: false,
});
const glowMat = new THREE.MeshBasicMaterial({
  color: '#16ff70', transparent: true, opacity: 0.16,
  blending: THREE.AdditiveBlending, depthWrite: false,
});
glowMat.toneMapped = false;
const ringMat = new THREE.MeshBasicMaterial({
  color: '#ff2424', transparent: true, opacity: 0.9,
  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});
ringMat.toneMapped = false;

// precomputed local matrices for every class box part
const partCache = {};
for (const [name, def] of Object.entries(CLASSES)) {
  const body = [], glass = [];
  for (const b of def.boxes) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...b.p),
      new THREE.Quaternion(),
      new THREE.Vector3(...b.s),
    );
    (b.m === 'glass' ? glass : body).push(m);
  }
  partCache[name] = { body, glass };
}

const SETS = {
  body:   { geo: unitBox,  mat: bodyMat,   mult: 3, color: true  },
  glass:  { geo: unitBox,  mat: glassMat,  mult: 2, color: false },
  wheel:  { geo: wheelGeo, mat: darkMat,   mult: 4, color: false },
  rider:  { geo: riderGeo, mat: darkMat,   mult: 1, color: false },
  beacon: { geo: unitBox,  mat: beaconMat, mult: 1, color: true  },
  head:   { geo: unitBox,  mat: headMat,   mult: 2, color: true  },
  tail:   { geo: unitBox,  mat: tailMat,   mult: 2, color: true  },
  sig:    { geo: unitBox,  mat: sigMat,    mult: 2, color: true  },
  shadow: { geo: discGeo,  mat: shadowMat, mult: 1, color: false },
  glow:   { geo: discGeo,  mat: glowMat,   mult: 1, color: false },
  ring:   { geo: ringGeo,  mat: ringMat,   mult: 1, color: false },
};

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const base = new THREE.Object3D();
const part = new THREE.Object3D();
const outM = new THREE.Matrix4();
const col = new THREE.Color();
const BLACK = new THREE.Color(0, 0, 0);

// ---------------------------------------------------------------- component

export default function Vehicles() {
  const refs = useRef({});
  const wasActive = useRef(new Set());
  const lastHover = useRef({ slot: -1, t: 0 });
  const outline = useRef();

  const outlineGeo = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), []);

  // start every instance collapsed
  useEffect(() => {
    for (const [name, cfg] of Object.entries(SETS)) {
      const mesh = refs.current[name];
      if (!mesh) continue;
      for (let i = 0; i < POOL * cfg.mult; i++) {
        mesh.setMatrixAt(i, ZERO);
        if (cfg.color) mesh.setColorAt(i, BLACK);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, []);

  function zeroSlot(slot) {
    for (const [name, cfg] of Object.entries(SETS)) {
      const mesh = refs.current[name];
      if (!mesh) continue;
      for (let k = 0; k < cfg.mult; k++) mesh.setMatrixAt(slot * cfg.mult + k, ZERO);
    }
  }

  useFrame((state, rawDt) => {
    const st = useStore.getState();
    const dt = Math.min(rawDt, 0.05) * st.timeScale;
    if (!st.paused) step(dt);

    const t = state.clock.elapsedTime;
    const blinkOn = (t * 2.6) % 1 < 0.55;
    const beaconPhase = Math.floor(t * 5) % 2;
    const R = refs.current;
    if (!R.body) return;

    const search = st.search.trim();
    const nowActive = wasActive.current;
    let outlined = false;

    for (let slot = 0; slot < POOL; slot++) {
      const v = vehicles[slot];

      if (!v.active) {
        if (nowActive.has(slot)) { zeroSlot(slot); nowActive.delete(slot); }
        continue;
      }
      nowActive.add(slot);

      const def = v.def;
      const x = worldX(v);
      const heading = headingOf(v.dir);
      base.position.set(x, 0, v.z);
      base.rotation.set(0, heading, 0);
      base.scale.set(1, 1, 1);
      base.updateMatrix();

      // chassis + glasshouse
      const parts = partCache[v.cls];
      for (let k = 0; k < 3; k++) {
        if (k < parts.body.length) {
          outM.multiplyMatrices(base.matrix, parts.body[k]);
          R.body.setMatrixAt(slot * 3 + k, outM);
        } else R.body.setMatrixAt(slot * 3 + k, ZERO);
      }
      for (let k = 0; k < 2; k++) {
        if (k < parts.glass.length) {
          outM.multiplyMatrices(base.matrix, parts.glass[k]);
          R.glass.setMatrixAt(slot * 2 + k, outM);
        } else R.glass.setMatrixAt(slot * 2 + k, ZERO);
      }

      // body tint: protocol color, dimmed by threat view / IP search
      col.set(PROTOS[v.proto].color);
      let f = 1;
      if (st.threatView) f = v.pkt.x ? 1.7 : 0.14;
      if (search) {
        f = (v.pkt.s && v.pkt.s.includes(search)) ||
            (v.pkt.d && v.pkt.d.includes(search)) ? 1.8 : 0.08;
      }
      if (st.selected === slot || st.hover?.slot === slot) f *= 1.35;
      col.multiplyScalar(f);
      for (let k = 0; k < 3; k++) R.body.setColorAt(slot * 3 + k, col);

      // spinning wheels
      const wd = def.wheels;
      for (let k = 0; k < 4; k++) {
        if (k < wd.pts.length) {
          part.position.set(wd.pts[k][0], wd.r, wd.pts[k][1]);
          part.rotation.set(0, 0, -v.wheelA);
          part.scale.set(wd.r, wd.r, wd.w);
          part.updateMatrix();
          outM.multiplyMatrices(base.matrix, part.matrix);
          R.wheel.setMatrixAt(slot * 4 + k, outM);
        } else R.wheel.setMatrixAt(slot * 4 + k, ZERO);
      }

      // motorcycle rider
      if (def.rider) {
        part.position.set(...def.rider.p);
        part.rotation.set(0, 0, 0);
        part.scale.setScalar(def.rider.r);
        part.updateMatrix();
        outM.multiplyMatrices(base.matrix, part.matrix);
        R.rider.setMatrixAt(slot, outM);
      } else R.rider.setMatrixAt(slot, ZERO);

      // emergency lightbar, alternating red / blue
      if (def.beacon) {
        part.position.set(...def.beacon.p);
        part.rotation.set(0, 0, 0);
        part.scale.set(...def.beacon.s);
        part.updateMatrix();
        outM.multiplyMatrices(base.matrix, part.matrix);
        R.beacon.setMatrixAt(slot, outM);
        col.setRGB(...(beaconPhase ? [5, 0.25, 0.2] : [0.3, 0.6, 5.5]));
        R.beacon.setColorAt(slot, col);
      } else R.beacon.setMatrixAt(slot, ZERO);

      // headlights / taillights (brighter under braking)
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? 1 : -1;
        part.position.set(def.halfL + 0.05, def.lightY, side * def.halfW * 0.78);
        part.rotation.set(0, 0, 0);
        part.scale.set(0.08, 0.16, 0.3);
        part.updateMatrix();
        outM.multiplyMatrices(base.matrix, part.matrix);
        R.head.setMatrixAt(slot * 2 + k, outM);
        col.setRGB(2.6, 2.5, 2.0);
        R.head.setColorAt(slot * 2 + k, col);

        part.position.set(-def.halfL - 0.05, def.lightY, side * def.halfW * 0.78);
        part.scale.set(0.08, 0.18, 0.34);
        part.updateMatrix();
        outM.multiplyMatrices(base.matrix, part.matrix);
        R.tail.setMatrixAt(slot * 2 + k, outM);
        if (v.brake) col.setRGB(4.5, 0.3, 0.24);
        else col.setRGB(1.3, 0.1, 0.1);
        R.tail.setColorAt(slot * 2 + k, col);
      }

      // turn signals while changing lanes
      for (let k = 0; k < 2; k++) {
        const side = k === 0 ? 1 : -1;
        const want = v.blinker !== 0 &&
          ((v.blinker > 0 && side > 0) || (v.blinker < 0 && side < 0));
        if (want && blinkOn) {
          part.position.set(0.3, def.lightY + 0.3, side * (def.halfW + 0.05));
          part.rotation.set(0, 0, 0);
          part.scale.set(0.55, 0.1, 0.07);
          part.updateMatrix();
          outM.multiplyMatrices(base.matrix, part.matrix);
          R.sig.setMatrixAt(slot * 2 + k, outM);
          col.setRGB(3.4, 1.9, 0.25);
          R.sig.setColorAt(slot * 2 + k, col);
        } else R.sig.setMatrixAt(slot * 2 + k, ZERO);
      }

      // soft blob shadow
      part.position.set(x, 0.05, v.z);
      part.rotation.set(0, heading, 0);
      part.scale.set(def.halfL * 1.18, 1, def.halfW * 1.9 + 0.3);
      part.updateMatrix();
      R.shadow.setMatrixAt(slot, part.matrix);

      // encrypted traffic: green under-glow
      if (v.pkt.e) {
        part.position.set(x, 0.08, v.z);
        part.scale.set(def.halfL * 1.6, 1, def.halfW * 2.6 + 0.6);
        part.updateMatrix();
        R.glow.setMatrixAt(slot, part.matrix);
      } else R.glow.setMatrixAt(slot, ZERO);

      // suspicious traffic: pulsing red ring
      if (v.pkt.x) {
        const pulse = 1 + 0.18 * Math.sin(t * 7 + slot);
        part.position.set(x, 0.11, v.z);
        part.scale.set(def.halfL * 1.7 * pulse, 1, (def.halfW * 2.4 + 0.8) * pulse);
        part.updateMatrix();
        R.ring.setMatrixAt(slot, part.matrix);
      } else R.ring.setMatrixAt(slot, ZERO);

      // hover / selection outline
      const focus = st.selected ?? st.hover?.slot;
      if (!outlined && focus === slot && outline.current) {
        outline.current.visible = true;
        outline.current.position.set(x, 1.0, v.z);
        outline.current.rotation.set(0, heading, 0);
        outline.current.scale.set(def.len + 0.7, 2.4, def.halfW * 2 + 0.7);
        outlined = true;
      }
    }

    if (!outlined && outline.current) outline.current.visible = false;

    // clear selection when the selected packet leaves the highway
    if (st.selected != null && !vehicles[st.selected].active) {
      useStore.setState({ selected: null });
    }

    for (const [name, cfg] of Object.entries(SETS)) {
      const mesh = R[name];
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (cfg.color && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  // ------------------------------------------------------------ picking

  function onMove(e) {
    const slot = Math.floor(e.instanceId / 3);
    const now = performance.now();
    if (slot === lastHover.current.slot && now - lastHover.current.t < 80) return;
    if (!vehicles[slot].active) return;
    lastHover.current = { slot, t: now };
    useStore.setState({
      hover: { slot, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY },
    });
  }
  function onOut() {
    lastHover.current.slot = -1;
    useStore.setState({ hover: null });
  }
  function onClick(e) {
    e.stopPropagation();
    const slot = Math.floor(e.instanceId / 3);
    if (vehicles[slot].active) useStore.setState({ selected: slot });
  }

  return (
    <group>
      {Object.entries(SETS).map(([name, cfg]) => (
        <instancedMesh
          key={name}
          ref={(m) => { refs.current[name] = m; }}
          args={[cfg.geo, cfg.mat, POOL * cfg.mult]}
          frustumCulled={false}
          {...(name === 'body'
            ? { onPointerMove: onMove, onPointerOut: onOut, onClick }
            : {})}
        />
      ))}
      <lineSegments ref={outline} geometry={outlineGeo} visible={false}>
        <lineBasicMaterial color="#7ad7ff" toneMapped={false} />
      </lineSegments>
    </group>
  );
}
