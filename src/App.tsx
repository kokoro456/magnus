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
  racketSpeed: number;        // km/h
  racketAngle: number;        // deg (Vertical - 상하)
  swingPathAngle: number;     // deg
  racketHorizontalAngle: number; // deg (Horizontal - 좌우) NEW!
  impactLocation: number;     // 0-1
}

const PRESETS: Record<PresetName, SwingParams> = {
  Forehand: { racketSpeed: 90, racketAngle: -5, swingPathAngle: 20, racketHorizontalAngle: 0, impactLocation: 0.1 },
  Backhand: { racketSpeed: 80, racketAngle: -2, swingPathAngle: 15, racketHorizontalAngle: 0, impactLocation: 0.0 },
  Volley: { racketSpeed: 50, racketAngle: 5, swingPathAngle: -10, racketHorizontalAngle: 0, impactLocation: 0.0 },
  Serve: { racketSpeed: 120, racketAngle: -15, swingPathAngle: -5, racketHorizontalAngle: 0, impactLocation: 0.2 },
};

// --- Helper Functions ---
const kmhToMs = (kmh: number) => kmh / 3.6;

// --- 3D Helper Components ---
const TrajectoryLine = ({ points }: { points: THREE.Vector3[] }) => {
  if (points.length < 2) return null;
  return (
    <Line
      points={points}
      color="#ccff00"
      lineWidth={3}
      dashed={true}
      dashScale={1}
      dashSize={0.5}
      gapSize={0.5}
      opacity={0.8}
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
      if (['w', 'a', 's', 'd'].includes(key)) {
        setKeys(prev => ({ ...prev, [key]: true }));
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd'].includes(key)) {
        setKeys(prev => ({ ...prev, [key]: false }));
      }
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

    const moveSpeed = 15 * delta; // 이동 속도
    
    // 카메라가 바라보는 방향 기준으로 전후좌우 벡터 계산 (Y축 제외)
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
      
      // 타겟과 카메라를 동시에 이동시켜서 Orbit 중심점을 옮김
      target.add(moveVector);
      position.add(moveVector);
    }
  });

  return (
    <OrbitControls 
      ref={controlsRef}
      makeDefault 
      minDistance={2} 
      maxDistance={50}
      enablePan={true} // 마우스 우클릭 팬도 허용
      enableZoom={true} // 휠 줌 허용
    />
  );
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

  const applyPreset = (name: PresetName) => {
    setActivePreset(name);
    setParams(PRESETS[name]);
    if (name === 'Serve') {
        setBallStartPos(new THREE.Vector3(0, 2.8, 11));
    } else {
        setBallStartPos(new THREE.Vector3(0, 1.0, 11));
    }
  };

  const updateParam = (key: keyof SwingParams, value: any) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  // 물리 계산 및 궤적 예측
  const calculatePhysics = useCallback(() => {
    const speedMs = kmhToMs(params.racketSpeed);
    
    // 1. 기본 브로디 모델 (상하 각도, 스피드, 스핀량 계산)
    const impactData = calculateImpact(speedMs, params.racketAngle, params.swingPathAngle, params.impactLocation);
    
    // 2. 좌우 각도 반영 (Horizontal Angle)
    // 수평 각도에 따라 X축(좌우), Z축(전후) 속도 성분 분배
    // 기본적으로 calculateImpact는 Z축으로만 발사한다고 가정 (velocity.x = 0)
    // 여기서 회전 행렬을 적용하여 방향을 틂
    
    const hRad = THREE.MathUtils.degToRad(params.racketHorizontalAngle);
    
    // 기존 속도 벡터 (Y축은 유지, Z축을 회전)
    const initialVel = new THREE.Vector3(0, impactData.velocity.y, impactData.velocity.z);
    
    // Y축 기준 회전 (좌우) -> X, Z 성분 변형
    // Three.js 좌표계: -Z가 전방. 
    // +Angle -> 오른쪽(+X)으로 갈지 왼쪽(-X)으로 갈지 결정.
    // 보통 라켓 면이 오른쪽을 보면 공은 오른쪽으로 감.
    
    // Vector3.applyAxisAngle(Y축, 각도)
    // 주의: initialVel.z는 음수(전방)임.
    initialVel.applyAxisAngle(new THREE.Vector3(0, 1, 0), -hRad); // 부호는 테스트 필요

    // 스핀 축도 회전해야 함
    const angularSpeedRad = (impactData.rpm * 2 * Math.PI) / 60;
    
    // 기본 스핀: Topspin은 X축 회전 (-1, 0, 0)
    // 스윙 궤적이 가파르면 Topspin, 완만하면 Slice 로직 유지
    let spinAxis = new THREE.Vector3(-1, 0, 0); 
    if (params.swingPathAngle < params.racketAngle) spinAxis.set(1, 0, 0); 

    // 스핀 축도 타격 방향에 맞춰 Y축 회전
    spinAxis.applyAxisAngle(new THREE.Vector3(0, 1, 0), -hRad);

    return {
        velocity: initialVel,
        angularVelocity: spinAxis.multiplyScalar(angularSpeedRad),
        rpm: impactData.rpm
    };
  }, [params]);

  useEffect(() => {
    const { velocity, angularVelocity } = calculatePhysics();
    const points = predictTrajectory(ballStartPos, velocity, angularVelocity);
    setTrajectoryPoints(points);
  }, [calculatePhysics, ballStartPos]);

  const handleSwing = useCallback(() => {
    if (!ballRef.current) return;

    setIsSwinging(true);
    const delay = Math.max(150, 400 - params.racketSpeed * 2);

    setTimeout(() => {
        soundManager.playImpact();
        
        const { velocity, angularVelocity, rpm } = calculatePhysics();

        if (ballRef.current) {
            ballRef.current.reset(
              [ballStartPos.x, ballStartPos.y, ballStartPos.z],
              [velocity.x, velocity.y, velocity.z],
              [angularVelocity.x, angularVelocity.y, angularVelocity.z]
            );
        }

        // Analytics
        const speedMs = kmhToMs(params.racketSpeed);
        const liftCoeff = 1.5 * (0.033 * angularVelocity.length()) / Math.max(speedMs, 1);
        const force = 0.5 * 1.225 * (speedMs * speedMs) * (Math.PI * 0.033 * 0.033) * Math.abs(liftCoeff);

        setLastImpactData({
          speed: Math.round(velocity.length() * 3.6),
          rpm: Math.round(rpm),
          force: parseFloat(force.toFixed(2))
        });

    }, delay);
    
    setTimeout(() => setIsSwinging(false), delay + 400);

  }, [calculatePhysics, ballStartPos]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-neutral-950 text-white font-sans">
      {/* HEADER */}
      <header className="h-16 border-b border-neutral-800 bg-neutral-950 flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-tennis-neon rounded-full flex items-center justify-center neon-shadow">
            <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M12 2a14.5 14.5 0 0 0 0 20"></path>
              <path d="M2 12h20"></path>
            </svg>
          </div>
          <div>
            <h1 className="font-black text-lg leading-none tracking-wider">UBUNTU TENNIS</h1>
            <p className="text-[10px] text-tennis-neon font-bold tracking-[0.2em] uppercase">Physics Simulator</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* 3D AREA */}
        <section className="flex-1 relative bg-neutral-900 overflow-hidden">
            <div className="absolute inset-0 z-0 bg-gradient-to-b from-black via-neutral-900 to-black">
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #ffff00 1px, transparent 1px)', backgroundSize: '50px 50px' }}></div>
                
                <Canvas shadows camera={{ position: [0, 5, 18], fov: 50 }}>
                    <fog attach="fog" args={['#050505', 10, 60]} />
                    <ambientLight intensity={0.4} />
                    <spotLight position={[10, 20, 10]} angle={0.3} penumbra={0.5} intensity={200} castShadow shadow-mapSize={[2048, 2048]} />
                    <Environment preset="night" />

                    <Physics gravity={[0, -9.81, 0]} defaultContactMaterial={{ restitution: 0.7, friction: 0.6 }}>
                        <Court />
                        <TennisBall ref={ballRef} position={[0, 1, 11]} />
                        <Target position={[0, 1.5, -12]} />
                        <Target position={[-3, 1.0, -10]} />
                        <Target position={[3, 2.0, -11]} />
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
                        <mesh onClick={() => setShowGizmo(!showGizmo)} visible={showGizmo}>
                            <sphereGeometry args={[0.05, 16, 16]} />
                            <meshBasicMaterial color="#ff0000" wireframe opacity={0.5} transparent />
                        </mesh>
                    </TransformControls>

                    <TrajectoryLine points={trajectoryPoints} />
                    <ContactShadows position={[0, 0, 0]} opacity={0.4} scale={40} blur={2} far={4} />
                    
                    {/* New WASD Controls */}
                    <WasdOrbitControls />
                </Canvas>
            </div>

            <div className="absolute top-6 left-6 flex flex-col gap-4 z-10 pointer-events-none">
                <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-neutral-700 flex items-center gap-2 w-fit">
                    <span className="text-[10px] font-bold tracking-widest text-white">WASD to Move • Scroll to Zoom</span>
                </div>
            </div>

             <div className="absolute bottom-6 left-6 z-10">
                <button 
                  onClick={() => setShowGizmo(!showGizmo)}
                  className="bg-neutral-800/80 hover:bg-neutral-700 text-white text-xs px-3 py-2 rounded-custom border border-neutral-700 transition-colors pointer-events-auto"
                >
                  {showGizmo ? 'Hide Ball Gizmo' : 'Move Ball Position'}
                </button>
             </div>
        </section>

        {/* SIDEBAR */}
        <aside className="w-[400px] bg-neutral-950 border-l border-neutral-800 flex flex-col p-8 overflow-y-auto custom-scrollbar">
            <section className="space-y-8 mb-10">
                {/* 1. Racket Speed */}
                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <label className="text-[11px] font-bold text-neutral-400 tracking-widest uppercase">1. Racket Speed</label>
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-black text-tennis-neon leading-none neon-text-glow">{params.racketSpeed}</span>
                            <span className="text-[10px] text-neutral-500 font-bold">KM/H</span>
                        </div>
                    </div>
                    <input 
                        className="w-full cursor-pointer" type="range" min="30" max="150" 
                        value={params.racketSpeed}
                        onChange={(e) => updateParam('racketSpeed', parseInt(e.target.value))}
                    />
                </div>

                {/* 2. Impact Angle (Vertical) */}
                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <label className="text-[11px] font-bold text-neutral-400 tracking-widest uppercase">2. Impact Angle (Vertical)</label>
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-black text-white leading-none">{params.racketAngle > 0 ? '+' : ''}{params.racketAngle}</span>
                            <span className="text-[10px] text-neutral-500 font-bold uppercase">deg</span>
                        </div>
                    </div>
                    <input 
                        className="w-full cursor-pointer" type="range" min="-20" max="20" step="0.5" 
                        value={params.racketAngle}
                        onChange={(e) => updateParam('racketAngle', parseFloat(e.target.value))}
                    />
                </div>

                {/* 3. Swing Path */}
                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <label className="text-[11px] font-bold text-neutral-400 tracking-widest uppercase">3. Swing Path</label>
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-black text-white leading-none">{params.swingPathAngle > 0 ? '+' : ''}{params.swingPathAngle}</span>
                            <span className="text-[10px] text-neutral-500 font-bold uppercase">deg</span>
                        </div>
                    </div>
                    <input 
                        className="w-full cursor-pointer" type="range" min="-20" max="60" step="1" 
                        value={params.swingPathAngle}
                        onChange={(e) => updateParam('swingPathAngle', parseInt(e.target.value))}
                    />
                    <div className="flex justify-between text-[10px] text-neutral-600">
                        <span>Down (Slice)</span>
                        <span>Up (Topspin)</span>
                    </div>
                </div>

                {/* 4. Racket Horizontal Angle (NEW) */}
                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <label className="text-[11px] font-bold text-tennis-neon tracking-widest uppercase">4. Racket Left/Right</label>
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-black text-white leading-none">{params.racketHorizontalAngle > 0 ? 'R' : params.racketHorizontalAngle < 0 ? 'L' : ''}{Math.abs(params.racketHorizontalAngle)}</span>
                            <span className="text-[10px] text-neutral-500 font-bold uppercase">deg</span>
                        </div>
                    </div>
                    <input 
                        className="w-full cursor-pointer" type="range" min="-30" max="30" step="1" 
                        value={params.racketHorizontalAngle}
                        onChange={(e) => updateParam('racketHorizontalAngle', parseInt(e.target.value))}
                    />
                    <div className="flex justify-between text-[10px] text-neutral-600">
                        <span>Left</span>
                        <span>Center</span>
                        <span>Right</span>
                    </div>
                </div>

                <div className="space-y-3 pt-6 border-t border-neutral-800">
                    <label className="text-[10px] font-bold text-neutral-500 tracking-widest uppercase">Presets</label>
                    <select 
                        className="w-full bg-neutral-900 text-white text-[10px] font-bold uppercase p-2 rounded-custom border border-neutral-800 focus:outline-none focus:border-tennis-neon"
                        value={activePreset}
                        onChange={(e) => applyPreset(e.target.value as PresetName)}
                    >
                        {Object.keys(PRESETS).map(name => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>
                </div>
            </section>

            <button 
                onClick={handleSwing}
                disabled={isSwinging}
                className="w-full py-5 bg-tennis-neon hover:bg-[#e6e600] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all rounded-custom flex items-center justify-center gap-3 text-black font-black uppercase tracking-widest text-sm neon-shadow mb-12"
            >
                {isSwinging ? 'Simulating...' : 'Simulate Impact'}
            </button>

            {/* Analytics Section (Same as before) */}
            <div className="flex-1">
                <h3 className="text-[11px] font-bold text-neutral-400 tracking-widest uppercase mb-6 flex items-center gap-2">
                    <span className="w-4 h-[1px] bg-neutral-800"></span>
                    Analytics
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-custom">
                        <span className="text-[9px] font-bold text-neutral-500 uppercase block mb-1">Exit Speed</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-black text-white">{lastImpactData ? lastImpactData.speed : '--'}</span>
                            <span className="text-[9px] text-neutral-600 font-bold">KM/H</span>
                        </div>
                    </div>
                    <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-custom">
                        <span className="text-[9px] font-bold text-neutral-500 uppercase block mb-1">Spin</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-black text-white">{lastImpactData ? lastImpactData.rpm : '--'}</span>
                            <span className="text-[9px] text-neutral-600 font-bold">RPM</span>
                        </div>
                    </div>
                </div>
            </div>
        </aside>
      </main>
    </div>
  );
}
