import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import Scene from './three/Scene';
import Hud from './ui/Hud';
import { useStore } from './state/store';

export default function App() {
  return (
    <>
      <Canvas
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 50, position: [120, 170, 230], near: 0.5, far: 1600 }}
        onPointerMissed={() => useStore.setState({ selected: null })}
        style={{ position: 'fixed', inset: 0 }}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
      <Hud />
    </>
  );
}
