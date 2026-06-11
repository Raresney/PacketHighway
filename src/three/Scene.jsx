import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import Road from './Road';
import City from './City';
import Vehicles from './Vehicles';
import CameraRig from './CameraRig';

export default function Scene() {
  const { scene, gl } = useThree();

  // subtle PBR reflections without any network-fetched HDRI
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.25;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [scene, gl]);

  return (
    <>
      <color attach="background" args={['#04070d']} />
      <fogExp2 attach="fog" args={['#070b13', 0.0042]} />

      <hemisphereLight args={['#26304a', '#05070c', 0.5]} />
      <directionalLight
        position={[-180, 160, -120]}
        intensity={0.55}
        color="#aebbdd"
      />

      <Stars radius={420} depth={80} count={2600} factor={5}
             saturation={0} fade speed={0.5} />

      <Road />
      <City />
      <Vehicles />
      <CameraRig />

      <EffectComposer>
        <Bloom intensity={1.0} luminanceThreshold={0.32} mipmapBlur />
        <Vignette offset={0.22} darkness={0.62} />
      </EffectComposer>
    </>
  );
}
