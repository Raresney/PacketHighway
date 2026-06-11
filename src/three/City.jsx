import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../state/store';
import { PROTOS } from '../sim/constants';

// ---------------------------------------------------------------- helpers

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function windowTexture(seed) {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 256;
  const c = cv.getContext('2d');
  const rand = mulberry32(seed);
  c.fillStyle = '#0a0e15';
  c.fillRect(0, 0, 128, 256);
  for (let y = 6; y < 250; y += 9) {
    for (let x = 5; x < 123; x += 9) {
      if (rand() < 0.26) {
        c.fillStyle = rand() < 0.6
          ? `rgba(255,210,130,${0.35 + rand() * 0.45})`
          : `rgba(140,190,255,${0.3 + rand() * 0.4})`;
        c.fillRect(x, y, 5, 6);
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const roofMat = new THREE.MeshStandardMaterial({ color: '#0a0d13', roughness: 0.9 });

function buildingMaterials(tex) {
  const side = new THREE.MeshStandardMaterial({
    color: '#151b25',
    emissive: '#ffffff',
    emissiveMap: tex,
    map: tex,
    emissiveIntensity: 0.7,
    roughness: 0.85,
  });
  return [side, side, roofMat, roofMat, side, side];
}

// ---------------------------------------------------------------- buildings

function Buildings() {
  const groupsRef = useRef([]);
  const variants = useMemo(() => [101, 202, 303].map(windowTexture), []);

  const lots = useMemo(() => {
    const rand = mulberry32(7);
    const out = [[], [], []];
    for (const side of [1, -1]) {
      for (let x = -300; x < 300; x += 16 + rand() * 14) {
        for (const band of [0, 1, 2]) {
          if (rand() < 0.32) continue;
          const z = side * (58 + band * 42 + rand() * 24);
          const near = Math.abs(z) < 92;
          const h = near ? 8 + rand() * 22 : 16 + rand() * rand() * 86;
          const sx = 9 + rand() * 12;
          const sz = 9 + rand() * 12;
          out[Math.floor(rand() * 3)].push({ x, z, sx, h, sz });
        }
      }
    }
    return out;
  }, []);

  useEffect(() => {
    const dummy = new THREE.Object3D();
    lots.forEach((list, vi) => {
      const mesh = groupsRef.current[vi];
      if (!mesh) return;
      list.forEach((b, i) => {
        dummy.position.set(b.x, b.h / 2, b.z);
        dummy.scale.set(b.sx, b.h, b.sz);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
  }, [lots]);

  return (
    <group>
      {lots.map((list, vi) => (
        <instancedMesh
          key={vi}
          ref={(m) => { groupsRef.current[vi] = m; }}
          args={[undefined, undefined, list.length]}
          material={buildingMaterials(variants[vi])}
          frustumCulled={false}
        >
          <boxGeometry />
        </instancedMesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- towers

function CommTower({ x, z, h }) {
  const beacon = useRef();
  useFrame(({ clock }) => {
    if (beacon.current) {
      const k = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 2.2 + x);
      beacon.current.material.color.setRGB(2 + 5 * k, 0.2, 0.2);
    }
  });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.5, 1.6, h, 6]} />
        <meshStandardMaterial color="#222a36" metalness={0.8} roughness={0.4} />
      </mesh>
      {[0.55, 0.75, 0.92].map((f) => (
        <mesh key={f} position={[0, h * f, 0]}>
          <boxGeometry args={[6 - f * 3, 0.25, 0.25]} />
          <meshStandardMaterial color="#2c3542" metalness={0.8} roughness={0.4} />
        </mesh>
      ))}
      <mesh ref={beacon} position={[0, h + 0.8, 0]}>
        <sphereGeometry args={[0.55, 10, 8]} />
        <meshBasicMaterial color="#ff3030" toneMapped={false} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- data centers

function DataCenter({ x, z }) {
  const leds = useRef();
  const count = 48;
  useEffect(() => {
    const dummy = new THREE.Object3D();
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      dummy.position.set(
        -11 + (i % 16) * 1.4,
        1.2 + Math.floor(i / 16) * 1.5,
        z > 0 ? -6.05 : 6.05,
      );
      dummy.scale.set(0.5, 0.18, 0.1);
      dummy.updateMatrix();
      leds.current.setMatrixAt(i, dummy.matrix);
      leds.current.setColorAt(i, c.setRGB(0.1, 0.5, 0.4));
    }
    leds.current.instanceMatrix.needsUpdate = true;
    leds.current.instanceColor.needsUpdate = true;
  }, [z]);

  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 0.18 || !leds.current) return;
    acc.current = 0;
    const c = new THREE.Color();
    for (let k = 0; k < 9; k++) {
      const i = Math.floor(Math.random() * count);
      const on = Math.random() < 0.55;
      const blue = Math.random() < 0.4;
      if (on) c.setRGB(blue ? 0.2 : 0.1, blue ? 1.4 : 2.6, blue ? 3.2 : 1.1);
      else c.setRGB(0.05, 0.18, 0.15);
      leds.current.setColorAt(i, c);
    }
    leds.current.instanceColor.needsUpdate = true;
  });

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 2.6, 0]}>
        <boxGeometry args={[26, 5.2, 12]} />
        <meshStandardMaterial color="#11161e" metalness={0.4} roughness={0.6} />
      </mesh>
      <mesh position={[0, 5.4, 0]}>
        <boxGeometry args={[24, 0.5, 10]} />
        <meshStandardMaterial color="#171e28" roughness={0.7} />
      </mesh>
      <instancedMesh ref={leds} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

// ---------------------------------------------------------------- billboards

function Billboard({ pos, rotY, w, h, paint, live = false }) {
  const texRef = useRef();
  const cv = useMemo(() => {
    const el = document.createElement('canvas');
    el.width = 1024; el.height = Math.round(1024 * (h / w));
    return el;
  }, [w, h]);

  useEffect(() => {
    paint(cv.getContext('2d'), cv.width, cv.height);
    if (texRef.current) texRef.current.needsUpdate = true;
  }, [cv, paint]);

  const acc = useRef(0);
  useFrame((_, dt) => {
    if (!live) return;
    acc.current += dt;
    if (acc.current < 1) return;
    acc.current = 0;
    paint(cv.getContext('2d'), cv.width, cv.height);
    if (texRef.current) texRef.current.needsUpdate = true;
  });

  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      <mesh position={[0, -h / 2 - 2.5, 0]}>
        <boxGeometry args={[0.7, h + 5, 0.7]} />
        <meshStandardMaterial color="#222a36" metalness={0.8} roughness={0.4} />
      </mesh>
      <mesh>
        <boxGeometry args={[w + 0.8, h + 0.8, 0.4]} />
        <meshStandardMaterial color="#1a212c" metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.25]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial toneMapped={false}>
          <canvasTexture
            ref={texRef}
            attach="map"
            image={cv}
            colorSpace={THREE.SRGBColorSpace}
          />
        </meshBasicMaterial>
      </mesh>
    </group>
  );
}

function paintLogo(c, W, H) {
  c.fillStyle = '#070b12';
  c.fillRect(0, 0, W, H);
  c.strokeStyle = '#1f2937';
  c.lineWidth = 10;
  c.strokeRect(5, 5, W - 10, H - 10);
  // mini road icon
  c.fillStyle = '#161c26';
  c.fillRect(60, 40, 180, H - 80);
  c.fillStyle = '#1c2128';
  c.fillRect(95, 40, 110, H - 80);
  c.strokeStyle = '#aab6c2';
  c.lineWidth = 5;
  c.setLineDash([22, 18]);
  c.beginPath(); c.moveTo(150, 40); c.lineTo(150, H - 40); c.stroke();
  c.setLineDash([]);
  for (const [x, y, col] of [[112, H * 0.52, '#2ee06a'], [168, H * 0.25, '#4da3ff'], [168, H * 0.66, '#ff8c3b']]) {
    c.fillStyle = col;
    c.beginPath(); c.roundRect(x, y, 30, 52, 8); c.fill();
    c.fillStyle = 'rgba(8,13,20,0.65)';
    c.fillRect(x + 5, y + 12, 20, 14);
  }
  c.fillStyle = '#e6edf3';
  c.font = '800 92px Segoe UI, Arial';
  c.fillText('PACKET', 290, H / 2 - 14);
  c.fillStyle = '#58a6ff';
  c.fillText('HIGHWAY', 290, H / 2 + 78);
  c.fillStyle = '#7d8896';
  c.font = '500 30px Segoe UI, Arial';
  c.fillText('LIVE NETWORK TRAFFIC VISUALIZER', 292, H - 46);
}

function paintGithub(c, W, H) {
  c.fillStyle = '#0a1e12';
  c.fillRect(0, 0, W, H);
  c.strokeStyle = '#e8f0e8';
  c.lineWidth = 8;
  c.strokeRect(14, 14, W - 28, H - 28);
  c.fillStyle = '#e8f0e8';
  c.font = '700 64px Consolas, monospace';
  c.textAlign = 'center';
  c.fillText('github.com/Raresney', W / 2, H / 2 - 24);
  c.fillText('/PacketHighway', W / 2, H / 2 + 56);
  c.textAlign = 'left';
}

function paintStats(c, W, H) {
  const st = useStore.getState();
  c.fillStyle = '#070b12';
  c.fillRect(0, 0, W, H);
  c.strokeStyle = '#1f2937';
  c.lineWidth = 8;
  c.strokeRect(4, 4, W - 8, H - 8);
  c.fillStyle = '#58a6ff';
  c.font = '800 54px Segoe UI, Arial';
  c.fillText('NETWORK TELEMETRY', 50, 86);
  c.fillStyle = '#e6edf3';
  c.font = '700 110px Segoe UI, Arial';
  c.fillText(String(st.pps), 50, 230);
  c.fillStyle = '#7d8896';
  c.font = '500 42px Segoe UI, Arial';
  c.fillText('PACKETS / SEC', 50, 286);
  // protocol bars
  const protos = Object.keys(PROTOS);
  const max = Math.max(1, ...protos.map((p) => st.counts[p]));
  protos.forEach((p, i) => {
    const bw = 30 + (st.counts[p] / max) * 380;
    const y = 360 + i * 44;
    c.fillStyle = PROTOS[p].color;
    c.fillRect(50, y, bw, 26);
    c.fillStyle = '#9aa7b5';
    c.font = '600 28px Segoe UI, Arial';
    c.fillText(p, 50 + bw + 16, y + 22);
  });
}

// ---------------------------------------------------------------- pulses

function PulseWaves() {
  const refs = useRef([]);
  const states = useRef([0, 1.4, 2.8].map((d, i) => ({
    t: -d, x: -120 + i * 130, z: 36,
  })));

  useFrame((_, dt) => {
    for (let i = 0; i < states.current.length; i++) {
      const s = states.current[i];
      s.t += dt * 0.55;
      if (s.t > 1) {
        s.t = -Math.random() * 1.5;
        s.x = -220 + Math.random() * 440;
        s.z = (Math.random() < 0.5 ? 1 : -1) * (32 + Math.random() * 60);
      }
      const m = refs.current[i];
      if (!m) continue;
      const k = Math.max(0, s.t);
      m.position.set(s.x, 0.3, s.z);
      m.scale.setScalar(2 + k * 55);
      m.material.opacity = (1 - k) * 0.35;
    }
  });

  return (
    <group>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(m) => { refs.current[i] = m; }}
              rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.92, 1, 48]} />
          <meshBasicMaterial
            color="#38e1ff" transparent opacity={0}
            blending={THREE.AdditiveBlending} depthWrite={false}
            side={THREE.DoubleSide} toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- moon

function Moon() {
  const halo = useMemo(() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(64, 64, 8, 64, 64, 64);
    g.addColorStop(0, 'rgba(214,226,255,0.5)');
    g.addColorStop(1, 'rgba(214,226,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(cv);
    return tex;
  }, []);

  return (
    <group position={[-230, 120, -260]}>
      <mesh>
        <sphereGeometry args={[10, 24, 18]} />
        <meshBasicMaterial color={[1.6, 1.7, 1.9]} toneMapped={false} />
      </mesh>
      <sprite scale={[70, 70, 1]}>
        <spriteMaterial
          map={halo} transparent depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </group>
  );
}

// ---------------------------------------------------------------- city root

export default function City() {
  return (
    <group>
      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, 0]}>
        <planeGeometry args={[1700, 1000]} />
        <meshStandardMaterial color="#05080d" roughness={1} />
      </mesh>

      <Buildings />

      <DataCenter x={-150} z={32} />
      <DataCenter x={60} z={-32} />
      <DataCenter x={210} z={32} />

      <CommTower x={-250} z={-60} h={56} />
      <CommTower x={130} z={70} h={48} />
      <CommTower x={280} z={-90} h={64} />

      <Billboard pos={[-80, 13, -33]} rotY={0.12} w={26} h={8}
                 paint={paintLogo} />
      <Billboard pos={[60, 12, 34]} rotY={Math.PI - 0.1} w={18} h={11}
                 paint={paintStats} live />
      <Billboard pos={[200, 11, -34]} rotY={-0.1} w={22} h={6.5}
                 paint={paintGithub} />

      <PulseWaves />
      <Moon />
    </group>
  );
}
