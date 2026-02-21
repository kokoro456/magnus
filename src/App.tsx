// src/App.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/cannon';
import { OrbitControls, Environment, ContactShadows, Line, TransformControls } from '@react-three/drei';
import * as THREE from 'three';

import TennisBall from './components/TennisBall';
import type { TennisBallRef } from './components/TennisBall';
import Court from './components/Court';
import Player from './components/Player';
import Target from './components/Target';
import { calculateImpact, predictTrajectory } from './utils/physicsLogic';
import { soundManager } from './utils/SoundManager';

// --- Types & Constants ---
type PresetName = 'Forehand' | 'Backhand' | 'Volley' | 'Serve';

interface SwingParams {
  racketSpeed: number; // km/h
  racketAngle: number; // deg
  swingPathAngle: number; // deg
  impactLocation: number; // 0-1
  spinType: string;
}

const PRESETS: Record<PresetName, SwingParams> = {
  Forehand: { racketSpeed: 90, racketAngle: -5, swingPathAngle: 20, impactLocation: 0.1, spinType: 'Topspin' },
  Backhand: { racketSpeed: 80, racketAngle: -2, swingPathAngle: 15, impactLocation: 0.0, spinType: 'Topspin' },
  Volley: { racketSpeed: 50, racketAngle: 5, swingPathAngle: -10, impactLocation: 0.0, spinType: 'Flat' },
  Serve: { racketSpeed: 120, racketAngle: -15, swingPathAngle: -5, impactLocation: 0.2, spinType: 'Flat' },
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

// --- Main App ---
export default function App() {
  // State
  const [activePreset, setActivePreset] = useState<PresetName>('Forehand');
  const [params, setParams] = useState<SwingParams>({ ...PRESETS.Forehand }); 
  
  const [trajectoryPoints, setTrajectoryPoints] = useState<THREE.Vector3[]>([]);
  const [lastImpactData, setLastImpactData] = useState<{ speed: number; rpm: number, force: number } | null>(null);
  const [isSwinging, setIsSwinging] = useState(false);
  
  // 공의 초기 위치
  const [ballStartPos, setBallStartPos] = useState<THREE.Vector3>(new THREE.Vector3(0, 1, 11));
  const [showGizmo, setShowGizmo] = useState(false); 

  const ballRef = useRef<TennisBallRef>(null);

  // Preset Handler
  const applyPreset = (name: PresetName) => {
    setActivePreset(name);
    setParams(PRESETS[name]);
    
    if (name === 'Serve') {
        setBallStartPos(new THREE.Vector3(0, 2.8, 11));
    } else {
        setBallStartPos(new THREE.Vector3(0, 1.0, 11));
    }
  };

  // Parameter Change Handler
  const updateParam = (key: keyof SwingParams, value: any) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  // Trajectory Prediction (Effect)
  useEffect(() => {
    const speedMs = kmhToMs(params.racketSpeed);
    
    const impactData = calculateImpact(speedMs, params.racketAngle, params.swingPathAngle, params.impactLocation);
    const angularSpeedRad = (impactData.rpm * 2 * Math.PI) / 60;
    
    let spinAxis = new THREE.Vector3(-1, 0, 0); // Topspin
    if (params.spinType === 'Slice') spinAxis.set(1, 0, 0); // Slice
    else if (params.swingPathAngle < params.racketAngle) spinAxis.set(1, 0, 0); 

    const startVel = impactData.velocity.clone();
    const startAngVel = spinAxis.multiplyScalar(angularSpeedRad);

    const points = predictTrajectory(ballStartPos, startVel, startAngVel);
    setTrajectoryPoints(points);
  }, [params, ballStartPos]);

  // Swing Action
  const handleSwing = useCallback(() => {
    if (!ballRef.current) return;

    setIsSwinging(true);
    
    const delay = Math.max(150, 400 - params.racketSpeed * 2);

    setTimeout(() => {
        soundManager.playImpact();
        
        const speedMs = kmhToMs(params.racketSpeed);
        const impactData = calculateImpact(speedMs, params.racketAngle, params.swingPathAngle, params.impactLocation);
        const angularSpeedRad = (impactData.rpm * 2 * Math.PI) / 60;
        
        let spinAxis = new THREE.Vector3(-1, 0, 0);
        if (params.spinType === 'Slice') spinAxis.set(1, 0, 0);
        else if (params.swingPathAngle < params.racketAngle) spinAxis.set(1, 0, 0);

        if (ballRef.current) {
            ballRef.current.reset(
              [ballStartPos.x, ballStartPos.y, ballStartPos.z],
              [impactData.velocity.x, impactData.velocity.y, impactData.velocity.z],
              [spinAxis.x * angularSpeedRad, spinAxis.y * angularSpeedRad, spinAxis.z * angularSpeedRad]
            );
        }

        const liftCoeff = 1.5 * (0.033 * angularSpeedRad) / Math.max(speedMs, 1);
        const airDensity = 1.225;
        const area = Math.PI * 0.033 * 0.033;
        const force = 0.5 * airDensity * (speedMs * speedMs) * area * Math.abs(liftCoeff);

        setLastImpactData({
          speed: Math.round(impactData.velocity.length() * 3.6),
          rpm: Math.round(impactData.rpm),
          force: parseFloat(force.toFixed(2))
        });

    }, delay);
    
    setTimeout(() => setIsSwinging(false), delay + 400);

  }, [params, ballStartPos]);

  return (
    <div className="h-full flex flex-col overflow-hidden bg-neutral-950 text-white font-sans" style={{ height: '100%', width: '100%' }}>
      {/* BEGIN: Navigation Header */}
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
        <nav className="hidden md:flex gap-8 text-sm font-medium text-neutral-400">
          <a className="text-tennis-neon border-b-2 border-tennis-neon pb-1" href="#">SIMULATOR</a>
          <a className="hover:text-white transition-colors" href="#">HISTORY</a>
          <a className="hover:text-white transition-colors" href="#">ACADEMY</a>
          <a className="hover:text-white transition-colors" href="#">SETTINGS</a>
        </nav>
        <div className="flex items-center gap-4">
          <button className="p-2 rounded-custom bg-neutral-800 hover:bg-neutral-700 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
            </svg>
          </button>
          <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 overflow-hidden">
             <div className="w-full h-full bg-neutral-700 flex items-center justify-center text-xs">U</div>
          </div>
        </div>
      </header>
      {/* END: Navigation Header */}

      <main className="flex-1 flex overflow-hidden">
        {/* BEGIN: 3D Visualization Area */}
        <section className="flex-1 relative bg-neutral-900 overflow-hidden">
            <div className="absolute inset-0 z-0 bg-gradient-to-b from-black via-neutral-900 to-black">
                <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #ffff00 1px, transparent 1px)', backgroundSize: '50px 50px' }}></div>
                
                {/* 3D Canvas */}
                <Canvas shadows camera={{ position: [5, 4, 16], fov: 50 }}>
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

                    <Player 
                        swingPathAngle={params.swingPathAngle} 
                        racketAngle={params.racketAngle} 
                        onSwing={isSwinging} 
                        targetPosition={ballStartPos}
                        speed={kmhToMs(params.racketSpeed)} 
                    />

                    <TrajectoryLine points={trajectoryPoints} />
                    <ContactShadows position={[0, 0, 0]} opacity={0.4} scale={40} blur={2} far={4} />
                    <OrbitControls makeDefault minDistance={2} maxDistance={50} />
                </Canvas>
            </div>

            {/* Viewport Controls Overlay */}
            <div className="absolute top-6 left-6 flex flex-col gap-4 z-10 pointer-events-none">
                <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-neutral-700 flex items-center gap-2 w-fit">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                    <span className="text-[10px] font-bold tracking-widest text-white">LIVE RENDERING</span>
                </div>
            </div>

            <div className="absolute top-6 right-6 text-right z-10 pointer-events-none">
                <span className="text-[10px] font-bold text-neutral-400 block tracking-widest uppercase">Impact Delta</span>
                <div className="flex items-baseline justify-end gap-1">
                    <span className="text-4xl font-black text-white leading-none tabular-nums">0.0024</span>
                    <span className="text-neutral-500 font-bold text-sm">ms</span>
                </div>
            </div>
            
             {/* Gizmo Toggle Button */}
             <div className="absolute bottom-6 left-6 z-10">
                <button 
                  onClick={() => setShowGizmo(!showGizmo)}
                  className="bg-neutral-800/80 hover:bg-neutral-700 text-white text-xs px-3 py-2 rounded-custom border border-neutral-700 transition-colors pointer-events-auto"
                >
                  {showGizmo ? 'Hide Gizmo' : 'Show Gizmo (Move Ball)'}
                </button>
             </div>
        </section>
        {/* END: 3D Visualization Area */}

        {/* BEGIN: Control Sidebar */}
        <aside className="w-[400px] bg-neutral-950 border-l border-neutral-800 flex flex-col p-8 overflow-y-auto custom-scrollbar">
            {/* Input Parameters Section */}
            <section className="space-y-8 mb-10">
                {/* Racket Speed */}
                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <label className="text-[11px] font-bold text-neutral-400 tracking-widest uppercase">Racket Speed</label>
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-black text-tennis-neon leading-none neon-text-glow">{params.racketSpeed}</span>
                            <span className="text-[10px] text-neutral-500 font-bold">KM/H</span>
                        </div>
                    </div>
                    <input 
                        className="w-full cursor-pointer" 
                        type="range" 
                        min="30" max="150" 
                        value={params.racketSpeed}
                        onChange={(e) => updateParam('racketSpeed', parseInt(e.target.value))}
                    />
                    <div className="flex justify-between text-[10px] font-bold text-neutral-600">
                        <span>30 KM/H</span>
                        <span>150 KM/H</span>
                    </div>
                </div>

                {/* Impact Angle */}
                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <label className="text-[11px] font-bold text-neutral-400 tracking-widest uppercase">Impact Angle</label>
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-black text-white leading-none">{params.racketAngle > 0 ? '+' : ''}{params.racketAngle}</span>
                            <span className="text-[10px] text-neutral-500 font-bold uppercase">deg</span>
                        </div>
                    </div>
                    <input 
                        className="w-full cursor-pointer" 
                        type="range" 
                        min="-20" max="20" step="0.5" 
                        value={params.racketAngle}
                        onChange={(e) => updateParam('racketAngle', parseFloat(e.target.value))}
                    />
                    <div className="flex justify-between text-[10px] font-bold text-neutral-600">
                        <span>-20°</span>
                        <span>0°</span>
                        <span>+20°</span>
                    </div>
                </div>

                {/* Modes Grid */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                        <label className="text-[10px] font-bold text-neutral-500 tracking-widest uppercase">Rotation Mode</label>
                        <div className="flex bg-neutral-900 p-1 rounded-custom">
                            <button 
                                onClick={() => updateParam('spinType', 'Topspin')}
                                className={`flex-1 py-2 text-[10px] font-black rounded-custom uppercase transition-all ${params.spinType === 'Topspin' ? 'bg-tennis-neon text-black' : 'text-neutral-500 hover:text-neutral-300'}`}
                            >
                                Topspin
                            </button>
                            <button 
                                onClick={() => updateParam('spinType', 'Slice')}
                                className={`flex-1 py-2 text-[10px] font-black rounded-custom uppercase transition-all ${params.spinType === 'Slice' ? 'bg-tennis-neon text-black' : 'text-neutral-500 hover:text-neutral-300'}`}
                            >
                                Slice
                            </button>
                        </div>
                    </div>
                    <div className="space-y-3">
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
                </div>
            </section>

            {/* Primary Action */}
            <button 
                onClick={handleSwing}
                disabled={isSwinging}
                className="w-full py-5 bg-tennis-neon hover:bg-[#e6e600] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all rounded-custom flex items-center justify-center gap-3 text-black font-black uppercase tracking-widest text-sm neon-shadow mb-12"
            >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71L12 2z"></path></svg>
                {isSwinging ? 'Simulating...' : 'Simulate Impact'}
            </button>

            {/* Analytics Section */}
            <div className="flex-1">
                <h3 className="text-[11px] font-bold text-neutral-400 tracking-widest uppercase mb-6 flex items-center gap-2">
                    <span className="w-4 h-[1px] bg-neutral-800"></span>
                    Impact Analytics
                </h3>
                <div className="grid grid-cols-2 gap-3 mb-3">
                    {/* Exit Speed Card */}
                    <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-custom hover:border-tennis-neon/30 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center mb-3">
                            <svg className="w-4 h-4 text-tennis-neon" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
                        </div>
                        <span className="text-[9px] font-bold text-neutral-500 uppercase block mb-1">Exit Speed</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-black text-white">{lastImpactData ? lastImpactData.speed : '--'}</span>
                            <span className="text-[9px] text-neutral-600 font-bold">KM/H</span>
                        </div>
                    </div>
                    {/* Spin Card */}
                    <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-custom hover:border-tennis-neon/30 transition-colors">
                        <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center mb-3">
                            <svg className="w-4 h-4 text-tennis-neon" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path><path d="M15.5 12h-7"></path></svg>
                        </div>
                        <span className="text-[9px] font-bold text-neutral-500 uppercase block mb-1">Spin (RPM)</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-black text-white">{lastImpactData ? lastImpactData.rpm : '--'}</span>
                            <span className="text-[9px] text-neutral-600 font-bold">RPM</span>
                        </div>
                    </div>
                </div>
                {/* Magnus Force Card */}
                <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-custom flex items-center justify-between hover:border-tennis-neon/30 transition-colors">
                    <div>
                        <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center mb-3">
                            <svg className="w-4 h-4 text-tennis-neon" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M2 12h20M2 12c0-5.523 4.477-10 10-10s10 4.477 10 10M2 12c0 5.523 4.477 10 10 10s10-4.477 10-10"></path></svg>
                        </div>
                        <span className="text-[9px] font-bold text-neutral-500 uppercase block mb-1">Magnus Force</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-black text-white">{lastImpactData ? lastImpactData.force : '--'}</span>
                            <span className="text-[9px] text-neutral-600 font-bold uppercase">Newtons</span>
                        </div>
                    </div>
                    <div className="w-32 h-16 bg-black/40 rounded border border-neutral-800 flex items-center justify-center p-2">
                        <svg className="w-full h-full text-tennis-neon opacity-80" viewBox="0 0 100 40">
                            <path d="M0 20 Q 25 5, 50 20 T 100 20" fill="none" stroke="currentColor" strokeWidth="2"></path>
                        </svg>
                    </div>
                </div>
            </div>
        </aside>
        {/* END: Control Sidebar */}
      </main>

      {/* BEGIN: Bottom Interaction Bar (Mobile Viewport) */}
      <footer className="md:hidden h-20 bg-neutral-950 border-t border-neutral-800 flex items-center justify-around px-4 z-50">
          <button className="flex flex-col items-center gap-1 text-tennis-neon">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71L12 2z"></path></svg>
              <span className="text-[10px] font-bold tracking-widest uppercase">Sim</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-neutral-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>
              <span className="text-[10px] font-bold tracking-widest uppercase">History</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-neutral-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
              <span className="text-[10px] font-bold tracking-widest uppercase">Academy</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-neutral-500">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              <span className="text-[10px] font-bold tracking-widest uppercase">Settings</span>
          </button>
      </footer>
      {/* END: Bottom Interaction Bar */}
    </div>
  );
}