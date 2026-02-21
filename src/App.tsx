// src/App.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/cannon';
import { OrbitControls, Environment, ContactShadows, Line, TransformControls } from '@react-three/drei';
import * as THREE from 'three';

import TennisBall from './components/TennisBall';
import type { TennisBallRef } from './components/TennisBall';
import Court from './components/Court';
import Target from './components/Target';
import { calculateImpact, predictTrajectory } from './utils/physicsLogic';
import { soundManager } from './utils/SoundManager';

// --- Types & Constants ---
type PresetName = 'Forehand' | 'Backhand' | 'Volley' | 'Serve';

interface SwingParams {
  racketSpeed: number;        
  racketAngle: number;        
  swingPathAngle: number;     
  racketHorizontalAngle: number; 
  impactLocation: number;     
}

const PRESETS: Record<PresetName, SwingParams> = {
  Forehand: { racketSpeed: 90, racketAngle: -5, swingPathAngle: 20, racketHorizontalAngle: 0, impactLocation: 0.1 },
  Backhand: { racketSpeed: 80, racketAngle: -2, swingPathAngle: 15, racketHorizontalAngle: 0, impactLocation: 0.0 },
  Volley: { racketSpeed: 50, racketAngle: 5, swingPathAngle: -10, racketHorizontalAngle: 0, impactLocation: 0.0 },
  Serve: { racketSpeed: 120, racketAngle: -15, swingPathAngle: -5, racketHorizontalAngle: 0, impactLocation: 0.2 },
};

const kmhToMs = (kmh: number) => kmh / 3.6;

// --- 3D Helper Components ---
const TrajectoryLine = ({ points }: { points: THREE.Vector3[] }) => {
  if (points.length < 2) return null;
  return (
    <Line
      points={points}
      color="#ffff00" // 더 밝은 노란색
      lineWidth={4} // 더 굵게
      opacity={0.9}
      transparent
    />
  );
};

// --- WASD Camera Controls ---
const WasdOrbitControls = () => {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const [keys, setKeys] = useState({ w: false, a: false, s: false, d: false });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(key)) setKeys(prev => ({ ...prev, [key]: true }));
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(key)) setKeys(prev => ({ ...prev, [key]: false }));
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useFrame((_, delta) => {
    if (!controlsRef.current) return;
    const moveSpeed = 15 * delta;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    right.y = 0;
    right.normalize();

    const target = controlsRef.current.target;
    const position = camera.position;
    const moveVector = new THREE.Vector3(0, 0, 0);

    if (keys.w) moveVector.add(forward);
    if (keys.s) moveVector.sub(forward);
    if (keys.d) moveVector.add(right);
    if (keys.a) moveVector.sub(right);

    if (moveVector.lengthSq() > 0) {
      moveVector.normalize().multiplyScalar(moveSpeed);
      target.add(moveVector);
      position.add(moveVector);
    }
  });

  return <OrbitControls ref={controlsRef} makeDefault minDistance={2} maxDistance={100} />;
};

// --- Main App ---
export default function App() {
  const [activePreset, setActivePreset] = useState<PresetName>('Forehand');
  const [params, setParams] = useState<SwingParams>({ ...PRESETS.Forehand });
  const [trajectoryPoints, setTrajectoryPoints] = useState<THREE.Vector3[]>([]);
  const [lastImpactData, setLastImpactData] = useState<{ speed: number; rpm: number, force: number } | null>(null);
  const [isSwinging, setIsSwinging] = useState(false);
  const [ballStartPos, setBallStartPos] = useState<THREE.Vector3>(new THREE.Vector3(0, 1, 11));
  const [showGizmo, setShowGizmo] = useState(false);

  const ballRef = useRef<TennisBallRef>(null);

  const updateParam = (key: keyof SwingParams, value: any) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const applyPreset = (name: PresetName) => {
    setActivePreset(name);
    const newParams = { ...PRESETS[name] };
    setParams(newParams);
    if (name === 'Serve') setBallStartPos(new THREE.Vector3(0, 2.8, 11));
    else setBallStartPos(new THREE.Vector3(0, 1.0, 11));
  };

  // 실시간 물리 계산 함수 (의존성: params)
  const calculateCurrentState = useCallback(() => {
    const speedMs = kmhToMs(params.racketSpeed);
    const impactData = calculateImpact(speedMs, params.racketAngle, params.swingPathAngle, params.impactLocation);
    
    // 좌우 각도 적용
    const hRad = THREE.MathUtils.degToRad(params.racketHorizontalAngle);
    const velocity = new THREE.Vector3(0, impactData.velocity.y, impactData.velocity.z);
    velocity.applyAxisAngle(new THREE.Vector3(0, 1, 0), -hRad);

    // 스핀 축 적용
    const angularSpeedRad = (impactData.rpm * 2 * Math.PI) / 60;
    let spinAxis = new THREE.Vector3(-1, 0, 0); 
    if (params.swingPathAngle < params.racketAngle) spinAxis.set(1, 0, 0); 
    spinAxis.applyAxisAngle(new THREE.Vector3(0, 1, 0), -hRad);

    return { 
        velocity, 
        angularVelocity: spinAxis.multiplyScalar(angularSpeedRad), 
        rpm: impactData.rpm 
    };
  }, [params]);

  // 파라미터 또는 공 위치 변경 시 유도선 업데이트
  useEffect(() => {
    const { velocity, angularVelocity } = calculateCurrentState();
    const points = predictTrajectory(ballStartPos, velocity, angularVelocity);
    setTrajectoryPoints(points);
  }, [calculateCurrentState, ballStartPos]);

  const handleSwing = useCallback(() => {
    if (!ballRef.current) return;
    setIsSwinging(true);
    const delay = Math.max(150, 400 - params.racketSpeed * 2);

    setTimeout(() => {
        soundManager.playImpact();
        const { velocity, angularVelocity, rpm } = calculateCurrentState();
        if (ballRef.current) {
            ballRef.current.reset(
              [ballStartPos.x, ballStartPos.y, ballStartPos.z],
              [velocity.x, velocity.y, velocity.z],
              [angularVelocity.x, angularVelocity.y, angularVelocity.z]
            );
        }
        // 통계 업데이트
        const force = 0.5 * 1.225 * (velocity.lengthSq()) * (Math.PI * 0.033 * 0.033) * 0.0006 * angularVelocity.length();
        setLastImpactData({
          speed: Math.round(velocity.length() * 3.6),
          rpm: Math.round(rpm),
          force: parseFloat(force.toFixed(2))
        });
    }, delay);
    
    setTimeout(() => setIsSwinging(false), delay + 400);
  }, [calculateCurrentState, ballStartPos, params.racketSpeed]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-neutral-950 text-white font-sans" style={{ height: '100%', width: '100%' }}>
      <header className="h-16 border-b border-neutral-800 bg-neutral-950 flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-tennis-neon rounded-full flex items-center justify-center neon-shadow">
            <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 2a14.5 14.5 0 0 0 0 20"></path>
              <path d="M2 12h20"></path>
            </svg>
          </div>
          <div>
            <h1 className="font-black text-lg leading-none tracking-wider uppercase">Ubuntu Tennis</h1>
            <p className="text-[10px] text-tennis-neon font-bold tracking-[0.2em] uppercase text-left">Physics Simulator</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <section className="flex-1 relative bg-neutral-900 overflow-hidden">
            <div className="absolute inset-0 z-0 bg-gradient-to-b from-black via-neutral-900 to-black">
                <Canvas shadows camera={{ position: [0, 5, 18], fov: 50 }}>
                    <fog attach="fog" args={['#050505', 10, 80]} />
                    <ambientLight intensity={0.4} />
                    <spotLight position={[10, 20, 10]} angle={0.3} penumbra={0.5} intensity={200} castShadow />
                    <Environment preset="night" />

                    <Physics gravity={[0, -9.81, 0]}>
                        <Court />
                        <TennisBall ref={ballRef} position={[0, 1, 11]} />
                        <Target position={[0, 1.5, -15]} />
                        <Target position={[-4, 1.0, -12]} />
                        <Target position={[4, 2.0, -13]} />
                    </Physics>

                    <TransformControls 
                        position={[ballStartPos.x, ballStartPos.y, ballStartPos.z]}
                        mode="translate"
                        translationSnap={0.1}
                        size={0.8}
                        visible={showGizmo}
                        onObjectChange={(e: any) => {
                            if (e?.target?.object) {
                                const newPos = e.target.object.position.clone();
                                if (newPos.y < 0.1) newPos.y = 0.1; 
                                setBallStartPos(newPos);
                            }
                        }}
                    >
                        <mesh visible={showGizmo}>
                            <sphereGeometry args={[0.05, 16, 16]} />
                            <meshBasicMaterial color="#ff0000" wireframe opacity={0.5} transparent />
                        </mesh>
                    </TransformControls>

                    <TrajectoryLine points={trajectoryPoints} />
                    <ContactShadows position={[0, 0, 0]} opacity={0.4} scale={40} blur={2} far={4} />
                    <WasdOrbitControls />
                </Canvas>
            </div>

            <div className="absolute top-6 left-6 flex flex-col gap-4 z-10 pointer-events-none text-left">
                <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-neutral-700 flex items-center gap-2 w-fit">
                    <span className="text-[10px] font-bold tracking-widest text-white uppercase italic">Live Simulation</span>
                </div>
                <div className="bg-black/40 backdrop-blur-sm p-3 rounded-lg border border-neutral-800">
                    <p className="text-[9px] font-bold text-neutral-400 uppercase mb-1">Controls</p>
                    <p className="text-[10px] text-white">WASD: Move Court</p>
                    <p className="text-[10px] text-white">Scroll: Zoom In/Out</p>
                    <p className="text-[10px] text-white">Right Click: Rotate View</p>
                </div>
            </div>

             <div className="absolute bottom-6 left-6 z-10">
                <button 
                  onClick={() => setShowGizmo(!showGizmo)}
                  className="bg-neutral-800/80 hover:bg-neutral-700 text-white text-[10px] font-bold uppercase px-4 py-2 rounded-custom border border-neutral-700 transition-colors pointer-events-auto shadow-lg"
                >
                  {showGizmo ? 'Lock Ball Position' : 'Change Impact Point'}
                </button>
             </div>
        </section>

        <aside className="w-[400px] bg-neutral-950 border-l border-neutral-800 flex flex-col p-8 overflow-y-auto custom-scrollbar">
            <section className="space-y-8 mb-10 text-left">
                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <label className="text-[11px] font-bold text-neutral-400 tracking-widest uppercase">1. Racket Speed</label>
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-black text-tennis-neon leading-none neon-text-glow">{params.racketSpeed}</span>
                            <span className="text-[10px] text-neutral-500 font-bold uppercase">KM/H</span>
                        </div>
                    </div>
                    <input className="w-full cursor-pointer" type="range" min="30" max="150" value={params.racketSpeed} onChange={(e) => updateParam('racketSpeed', parseInt(e.target.value))} />
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <label className="text-[11px] font-bold text-neutral-400 tracking-widest uppercase">2. Impact Angle (V)</label>
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-black text-white">{params.racketAngle > 0 ? '+' : ''}{params.racketAngle}</span>
                            <span className="text-[10px] text-neutral-500 font-bold uppercase">deg</span>
                        </div>
                    </div>
                    <input className="w-full cursor-pointer" type="range" min="-20" max="20" step="0.5" value={params.racketAngle} onChange={(e) => updateParam('racketAngle', parseFloat(e.target.value))} />
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <label className="text-[11px] font-bold text-neutral-400 tracking-widest uppercase">3. Swing Path</label>
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-black text-white">{params.swingPathAngle > 0 ? '+' : ''}{params.swingPathAngle}</span>
                            <span className="text-[10px] text-neutral-500 font-bold uppercase">deg</span>
                        </div>
                    </div>
                    <input className="w-full cursor-pointer" type="range" min="-20" max="60" step="1" value={params.swingPathAngle} onChange={(e) => updateParam('swingPathAngle', parseInt(e.target.value))} />
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <label className="text-[11px] font-bold text-tennis-neon tracking-widest uppercase">4. Racket Angle (H)</label>
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-black text-white">{params.racketHorizontalAngle > 0 ? 'R' : params.racketHorizontalAngle < 0 ? 'L' : ''}{Math.abs(params.racketHorizontalAngle)}</span>
                            <span className="text-[10px] text-neutral-500 font-bold uppercase">deg</span>
                        </div>
                    </div>
                    <input className="w-full cursor-pointer" type="range" min="-30" max="30" step="1" value={params.racketHorizontalAngle} onChange={(e) => updateParam('racketHorizontalAngle', parseInt(e.target.value))} />
                </div>

                <div className="pt-6 border-t border-neutral-800">
                    <label className="text-[10px] font-bold text-neutral-500 tracking-widest uppercase mb-3 block">Quick Presets</label>
                    <div className="grid grid-cols-2 gap-2">
                        {(Object.keys(PRESETS) as PresetName[]).map(name => (
                            <button key={name} onClick={() => applyPreset(name)} className={`py-2 text-[10px] font-black rounded-custom border transition-all uppercase ${activePreset === name ? 'bg-tennis-neon text-black border-tennis-neon' : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'}`}>
                                {name}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            <button onClick={handleSwing} disabled={isSwinging} className="w-full py-5 bg-tennis-neon hover:bg-[#e6e600] active:scale-[0.98] disabled:opacity-50 transition-all rounded-custom flex items-center justify-center gap-3 text-black font-black uppercase tracking-widest text-sm neon-shadow mb-12">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71L12 2z"></path></svg>
                {isSwinging ? 'Calculating...' : 'Simulate Impact'}
            </button>

            <div className="flex-1 text-left">
                <h3 className="text-[11px] font-bold text-neutral-400 tracking-widest uppercase mb-6 flex items-center gap-2">
                    <span className="w-4 h-[1px] bg-neutral-800"></span>
                    Live Data
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-custom">
                        <span className="text-[9px] font-bold text-neutral-500 uppercase block mb-1">Exit Speed</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-black text-white">{lastImpactData ? lastImpactData.speed : '--'}</span>
                            <span className="text-[9px] text-neutral-600 font-bold uppercase">km/h</span>
                        </div>
                    </div>
                    <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-custom">
                        <span className="text-[9px] font-bold text-neutral-500 uppercase block mb-1">Magnus Force</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-black text-white">{lastImpactData ? lastImpactData.force : '--'}</span>
                            <span className="text-[9px] text-neutral-600 font-bold uppercase">N</span>
                        </div>
                    </div>
                </div>
            </div>
        </aside>
      </main>
    </div>
  );
}