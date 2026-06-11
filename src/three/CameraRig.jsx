import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../state/store';
import { vehicles, worldX } from '../sim/traffic';

const INTRO_FROM = new THREE.Vector3(120, 170, 230);
const INTRO_TO = new THREE.Vector3(42, 27, 47);
const tmp = new THREE.Vector3();
const tgt = new THREE.Vector3();

export default function CameraRig() {
  const controls = useRef();
  const introT = useRef(0);
  const cinT = useRef(0);

  useFrame(({ camera }, dt) => {
    const st = useStore.getState();
    const ctl = controls.current;
    if (!ctl) return;

    // cinematic fly-in on load
    if (introT.current < 4.4) {
      introT.current += dt;
      const k = Math.min(1, introT.current / 4.4);
      const e = 1 - Math.pow(1 - k, 3);
      camera.position.lerpVectors(INTRO_FROM, INTRO_TO, e);
      ctl.target.set(0, 2, 0);
      ctl.enabled = false;
      ctl.update();
      return;
    }

    if (st.camMode === 'follow' && st.selected != null &&
        vehicles[st.selected].active) {
      const v = vehicles[st.selected];
      const x = worldX(v);
      const fwd = v.dir === 'out' ? 1 : -1;
      const side = v.z > 0 ? 1 : -1;
      tmp.set(x - fwd * 15, 7.5, v.z + side * 11);
      const a = 1 - Math.pow(0.002, dt);
      camera.position.lerp(tmp, a);
      tgt.set(x + fwd * 8, 1.4, v.z);
      ctl.target.lerp(tgt, a);
      ctl.enabled = false;
      ctl.update();
      return;
    }

    if (st.camMode === 'cinematic') {
      cinT.current += dt;
      const t = cinT.current * 0.16;
      tmp.set(
        Math.sin(t * 0.7) * 130,
        18 + 6 * Math.sin(t * 1.6),
        44 + 8 * Math.sin(t),
      );
      camera.position.lerp(tmp, 0.018);
      tgt.set(camera.position.x * 0.4, 1.5, 0);
      ctl.target.lerp(tgt, 0.04);
      ctl.enabled = false;
      ctl.update();
      return;
    }

    ctl.enabled = true;
    ctl.update();
  });

  return (
    <OrbitControls
      ref={controls}
      enableDamping
      dampingFactor={0.08}
      maxPolarAngle={1.45}
      minDistance={10}
      maxDistance={340}
      target={[0, 2, 0]}
    />
  );
}
