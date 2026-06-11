import { useMemo } from 'react';
import * as THREE from 'three';
import { LANES_PER_DIR, LANE_W, MEDIAN_HALF, ROAD_LEN } from '../sim/constants';

const HALF_ROAD = MEDIAN_HALF + LANES_PER_DIR * LANE_W + 2.6;
const FULL_LEN = ROAD_LEN + 200;

const dashGeo = new THREE.BoxGeometry(3, 0.02, 0.16);
const dashMat = new THREE.MeshBasicMaterial({ color: '#9aa7b5' });
const lineMat = new THREE.MeshBasicMaterial({ color: '#b9c4cf' });
const poolMat = new THREE.MeshBasicMaterial({
  color: '#ffd9a0', transparent: true, opacity: 0.05,
  blending: THREE.AdditiveBlending, depthWrite: false,
});
const poolGeo = new THREE.CircleGeometry(1, 24);
poolGeo.rotateX(-Math.PI / 2);

function Dashes() {
  const ref = useMemo(() => {
    const zs = [];
    for (let k = 1; k < LANES_PER_DIR; k++) {
      zs.push(MEDIAN_HALF + k * LANE_W);
      zs.push(-(MEDIAN_HALF + k * LANE_W));
    }
    const dummy = new THREE.Object3D();
    const list = [];
    for (const z of zs) {
      for (let x = -FULL_LEN / 2; x < FULL_LEN / 2; x += 7.5) {
        dummy.position.set(x, 0.02, z);
        dummy.updateMatrix();
        list.push(dummy.matrix.clone());
      }
    }
    return list;
  }, []);

  return (
    <instancedMesh
      args={[dashGeo, dashMat, ref.length]}
      frustumCulled={false}
      onUpdate={(mesh) => {
        ref.forEach((m, i) => mesh.setMatrixAt(i, m));
        mesh.instanceMatrix.needsUpdate = true;
      }}
    />
  );
}

function SolidLine({ z }) {
  return (
    <mesh position={[0, 0.02, z]} material={lineMat}>
      <boxGeometry args={[FULL_LEN, 0.02, 0.18]} />
    </mesh>
  );
}

function Streetlight({ x }) {
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, 4.6, 0]}>
        <cylinderGeometry args={[0.12, 0.16, 9.2, 8]} />
        <meshStandardMaterial color="#2c3440" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[0, 9.0, 0]}>
        <boxGeometry args={[0.18, 0.14, 21]} />
        <meshStandardMaterial color="#2c3440" metalness={0.7} roughness={0.4} />
      </mesh>
      {[1, -1].map((s) => (
        <mesh key={s} position={[0, 8.92, s * 10.2]}>
          <boxGeometry args={[0.8, 0.14, 0.45]} />
          <meshBasicMaterial color={[2.8, 2.3, 1.5]} toneMapped={false} />
        </mesh>
      ))}
      <pointLight
        position={[0, 8.4, 0]}
        intensity={110}
        distance={46}
        decay={2}
        color="#ffd9a0"
      />
      {[1, -1].map((s) => (
        <mesh key={s} geometry={poolGeo} material={poolMat}
              position={[0, 0.035, s * 10.2]} scale={[16, 1, 11]} />
      ))}
    </group>
  );
}

export default function Road() {
  const poles = useMemo(() => {
    const xs = [];
    for (let x = -240; x <= 240; x += 60) xs.push(x);
    return xs;
  }, []);

  return (
    <group>
      {/* asphalt deck */}
      <mesh position={[0, -0.3, 0]}>
        <boxGeometry args={[FULL_LEN, 0.6, HALF_ROAD * 2]} />
        <meshStandardMaterial color="#14181f" metalness={0.25} roughness={0.55} />
      </mesh>

      {/* raised median with twin guardrails */}
      <mesh position={[0, 0.14, 0]}>
        <boxGeometry args={[FULL_LEN, 0.3, MEDIAN_HALF * 1.15]} />
        <meshStandardMaterial color="#0d1117" roughness={0.8} />
      </mesh>
      {[1.5, -1.5].map((z) => (
        <mesh key={z} position={[0, 0.78, z]}>
          <boxGeometry args={[FULL_LEN, 0.16, 0.08]} />
          <meshStandardMaterial color="#75808f" metalness={0.9} roughness={0.3} />
        </mesh>
      ))}

      {/* outer concrete barriers */}
      {[HALF_ROAD + 0.3, -(HALF_ROAD + 0.3)].map((z) => (
        <mesh key={z} position={[0, 0.42, z]}>
          <boxGeometry args={[FULL_LEN, 0.85, 0.5]} />
          <meshStandardMaterial color="#1a212b" roughness={0.7} />
        </mesh>
      ))}

      {/* markings */}
      <SolidLine z={MEDIAN_HALF} />
      <SolidLine z={-MEDIAN_HALF} />
      <SolidLine z={MEDIAN_HALF + LANES_PER_DIR * LANE_W} />
      <SolidLine z={-(MEDIAN_HALF + LANES_PER_DIR * LANE_W)} />
      <Dashes />

      {poles.map((x) => <Streetlight key={x} x={x} />)}
    </group>
  );
}
