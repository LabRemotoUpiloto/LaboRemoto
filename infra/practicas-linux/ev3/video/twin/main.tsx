/* eslint-disable @typescript-eslint/no-explicit-any */
// Renderiza el robot REAL del Gemelo 3D del cliente (components/ev3/Ev3Twin.tsx)
// fotograma a fotograma, para usarlo en el video. Se carga en un navegador sin
// pantalla (ver capture.mjs) y se maneja con `window.twin`:
//   twin.frame(shotName, t, params) -> avanza 1/30 s, coloca cámara y robot y
//   devuelve las posiciones en pantalla (0..1) de puntos clave del robot.
import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Ev3Robot, Floor } from '../../../../../Cliente-Rust/frontend/src/components/ev3/Ev3Twin';

const q = new URLSearchParams(location.search);
const W = Number(q.get('w') ?? 960);
const H = Number(q.get('h') ?? 600);
const FPS = 30;

function makeStatus(speeds: number[]) {
  const ports = ['outA', 'outB', 'outC', 'outD'];
  return {
    connected: true,
    ip: '172.16.112.215',
    battery: 8.1,
    reachable: true,
    alerts: [] as string[],
    motors: ports.map((port, i) => ({ port, connected: true, speed: speeds[i] ?? 0 })),
    sensors: [
      { port: 'in1', sensor_type: 'Touch', value: 0 },
      { port: 'in2', sensor_type: 'Ultrasonic', value: 42 },
      { port: 'in3', sensor_type: 'Color', value: 55 },
      { port: 'in4', sensor_type: 'Gyro', value: 0 },
    ],
  };
}

// Puntos del robot (coordenadas locales de Ev3Robot) cuya posición en pantalla se devuelve.
const KEY_POINTS: Record<string, [number, number, number]> = {
  screen: [0, 0.42, 0.6],
  buttons: [0, -0.5, 0.62],
  strip: [0, 1.36, 0.6],
  body: [0, -0.2, 0.6],
  battery: [0, 0.12, 0.6],
  wheelL: [-1.55, -2.15, 0.35],
  wheelR: [1.55, -2.15, 0.35],
  armL: [-1.52, 0.65, 0.3],
  armR: [1.52, 0.65, 0.3],
  sensor1: [-0.87, -0.95, 0.62],
  sensor2: [-0.29, -0.95, 0.62],
  sensor3: [0.29, -0.95, 0.62],
  sensor4: [0.87, -0.95, 0.62],
  antenna: [0, 2.3, 0.12],
};

const deg = (d: number) => (d * Math.PI) / 180;
const ease = (p: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, p)));

type Pose = { x: number; z: number; yaw: number };
const drive = { pose: { x: 0, z: 0, yaw: 0 } as Pose, seg: -1 };

/** Cámara y robot de cada plano, en función del tiempo `t` (s) dentro de la escena. */
function shot(name: string, t: number, dur: number, params: any) {
  const p = Math.min(1, t / Math.max(dur, 0.1));
  let cam: { pos: [number, number, number]; look: [number, number, number]; fov?: number };
  let speeds = [0, 0, 0, 0];
  let pose: Pose = { x: 0, z: 0, yaw: 0 };

  if (name === 'brick') {
    const az = deg(-26 + 52 * ease(p));
    const r = 9.8 - 1.4 * ease(p);
    cam = { pos: [Math.sin(az) * r, 1.0, Math.cos(az) * r], look: [0, 0.15, 0] };
  } else if (name === 'parts') {
    const az = deg(34 - 68 * ease(p));
    cam = { pos: [Math.sin(az) * 9.8, 1.0, Math.cos(az) * 9.8], look: [0, 0.0, 0] };
    speeds = [30 * Math.sin(t * 1.8), 0, -30 * Math.sin(t * 1.8), 0];
  } else if (name === 'ports') {
    cam = { pos: [0, 0.7, 9.6], look: [0, 0.0, 0] };
  } else if (name === 'still') {
    const az = deg(params?.az ?? 14);
    cam = { pos: [Math.sin(az) * 9, 1.2, Math.cos(az) * 9], look: [0, -0.3, 0] };
  } else if (name === 'drive') {
    cam = { pos: [0, 7.0, 7.6], look: [0, -2.3, 0.4], fov: 46 };
    const segs: { t0: number; t1: number; B: number; D: number; x: number; z: number; yaw: number }[] = params?.segments ?? [];
    const idx = segs.findIndex(s => t >= s.t0 && t < s.t1);
    if (idx < 0) {
      // Antes del primer caso: las ruedas giran de -100 a 100 rpm, el robot quieto.
      const k = params?.sweep ?? 1.6;
      const c0 = params?.c0 ?? 0;
      speeds = [0, 100 * Math.sin((t - c0) * k), 0, 100 * Math.sin((t - c0) * k + 1.2)];
      drive.pose = { x: 0, z: -1, yaw: 0 };
      drive.seg = -1;
    } else {
      const s = segs[idx];
      if (drive.seg !== idx) {
        drive.seg = idx;
        drive.pose = { x: s.x, z: s.z, yaw: s.yaw };
      } else {
        const dt = 1 / FPS;
        const v = ((s.B + s.D) / 2) * 0.012;
        const w = (s.D - s.B) * 0.0055;
        drive.pose.yaw += w * dt;
        drive.pose.x += Math.sin(drive.pose.yaw) * v * dt;
        drive.pose.z += Math.cos(drive.pose.yaw) * v * dt;
      }
      speeds = [0, s.B, 0, s.D];
    }
    pose = { ...drive.pose };
  } else {
    cam = { pos: [0, 5, 11], look: [0, 0, 0] };
  }
  return { cam, speeds, pose };
}

function Lights() {
  return (
    <>
      <ambientLight intensity={1.5} />
      <directionalLight position={[6, 12, 6]} intensity={2.5} castShadow shadow-mapSize={[1536, 1536]} shadow-camera-far={40}
        shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={10} shadow-camera-bottom={-10} />
      <directionalLight position={[-6, 8, -4]} intensity={1.2} color="#aabbff" />
      <directionalLight position={[0, -4, 6]} intensity={0.8} color="#ffffff" />
      <pointLight position={[0, 6, 6]} intensity={1.5} color="#ffffff" />
      <pointLight position={[0, 2, 9]} intensity={2.2} color="#ffffff" />
      <pointLight position={[-4, 4, 4]} intensity={0.8} color="#88aaff" />
      <pointLight position={[4, 4, 4]} intensity={0.8} color="#ffddaa" />
    </>
  );
}

function Controller({ groupRef, setStatus }: { groupRef: React.RefObject<THREE.Group | null>; setStatus: (s: any) => void }) {
  const { advance, camera } = useThree();
  const state = useRef({ elapsed: 0 });
  useEffect(() => {
    (window as any).twin = {
      ready: true,
      /** Avanza un fotograma. Devuelve {points} con posiciones normalizadas (0..1). */
      frame(name: string, t: number, dur: number, params: any) {
        const s = shot(name, t, dur, params);
        flushSync(() => setStatus(makeStatus(s.speeds)));
        const g = groupRef.current!;
        g.position.set(s.pose.x, 0, s.pose.z);
        g.rotation.y = s.pose.yaw;
        camera.position.set(...s.cam.pos);
        if (s.cam.fov && (camera as THREE.PerspectiveCamera).fov !== s.cam.fov) {
          (camera as THREE.PerspectiveCamera).fov = s.cam.fov;
          (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
        }
        camera.lookAt(...s.cam.look);
        camera.updateMatrixWorld();
        state.current.elapsed += 1 / FPS;
        advance(state.current.elapsed, true); // segundos (frameloop='never')
        g.updateMatrixWorld(true);
        const points: Record<string, [number, number]> = {};
        for (const [k, v] of Object.entries(KEY_POINTS)) {
          const w = g.localToWorld(new THREE.Vector3(...v)).project(camera);
          points[k] = [(w.x + 1) / 2, (1 - w.y) / 2];
        }
        return { points, elapsed: state.current.elapsed };
      },
    };
  }, [advance, camera, groupRef, setStatus]);
  return null;
}

function App() {
  const [status, setStatus] = useState(makeStatus([0, 0, 0, 0]));
  const groupRef = useRef<THREE.Group>(null);
  return (
    <div id="stage" style={{ width: W, height: H, position: 'relative', background: 'linear-gradient(180deg, #1a1a2e 0%, #0d0d1a 100%)' }}>
      <Canvas
        frameloop="never"
        shadows
        camera={{ position: [0, 5, 11], fov: 46 }}
        style={{ width: W, height: H, background: 'transparent' }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.6, preserveDrawingBuffer: true, alpha: true }}
      >
        <Lights />
        <Floor offsetX={0} offsetZ={0} />
        <group ref={groupRef}>
          <Ev3Robot status={status as any} />
        </group>
        <Controller groupRef={groupRef} setStatus={setStatus} />
      </Canvas>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
