// src/App.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/cannon';
import { OrbitControls, Environment, ContactShadows, Line } from '@react-three/drei';
import * as THREE from 'three';

import TennisBall from './components/TennisBall';
import type { TennisBallRef } from './components/TennisBall';
import Court from './components/Court'; // 새로 만든 코트 컴포넌트
import { calculateImpact, predictTrajectory } from './utils/physicsLogic';

// --- Types & Constants ---
type PresetName = 'Forehand' | 'Backhand' | 'Volley' | 'Serve';

interface SwingParams {
  racketSpeed: number; // m/s
  racketAngle: number; // deg
  swingPathAngle: number; // deg
  impactLocation: number; // 0-1
  spinType: string;
}

const PRESETS: Record<PresetName, SwingParams> = {
  Forehand: { racketSpeed: 35, racketAngle: -5, swingPathAngle: 20, impactLocation: 0.1, spinType: 'Topspin' },
  Backhand: { racketSpeed: 30, racketAngle: -2, swingPathAngle: 15, impactLocation: 0.0, spinType: 'Topspin' },
  Volley: { racketSpeed: 15, racketAngle: 5, swingPathAngle: -10, impactLocation: 0.0, spinType: 'Flat' },
  Serve: { racketSpeed: 55, racketAngle: -15, swingPathAngle: -5, impactLocation: 0.2, spinType: 'Flat' },
};

// --- UI Components ---
const RangeControl = ({ label, value, min, max, step, onChange, unit }: any) => (
  <div className="control-group">
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
      <label className="label">{label}</label>
      <span className="label" style={{ color: 'var(--primary)' }}>{value} {unit}</span>
    </div>
    <input 
      type="range" 
      min={min} 
      max={max} 
      step={step} 
      value={value} 
      onChange={(e) => onChange(parseFloat(e.target.value))} 
    />
  </div>
);

// --- 3D Helper Components ---
const TrajectoryLine = ({ points }: { points: THREE.Vector3[] }) => {
  if (points.length < 2) return null;
  return (
    <Line
      points={points}
      color="#ccff00"
      lineWidth={2}
      dashed={true}
      dashScale={1}
      dashSize={0.5}
      gapSize={0.5}
      opacity={0.6}
      transparent
    />
  );
};

// --- Main App ---
export default function App() {
  // State
  const [activePreset, setActivePreset] = useState<PresetName>('Forehand');
  const [params, setParams] = useState<SwingParams>(PRESETS.Forehand);
  const [trajectoryPoints, setTrajectoryPoints] = useState<THREE.Vector3[]>([]);
  const [lastImpactData, setLastImpactData] = useState<{ speed: number; rpm: number } | null>(null);

  const ballRef = useRef<TennisBallRef>(null);

  // Preset Handler
  const applyPreset = (name: PresetName) => {
    setActivePreset(name);
    setParams(PRESETS[name]);
  };

  // Parameter Change Handler
  const updateParam = (key: keyof SwingParams, value: any) => {
    setParams(prev => ({ ...prev, [key]: value }));
    setActivePreset('Forehand'); // Custom 상태로 변경 시 하이라이트 해제 (선택 사항)
  };

  // Trajectory Prediction (Effect)
  useEffect(() => {
    const impactData = calculateImpact(params.racketSpeed, params.racketAngle, params.swingPathAngle, params.impactLocation);
    const angularSpeedRad = (impactData.rpm * 2 * Math.PI) / 60;
    
    let spinAxis = new THREE.Vector3(-1, 0, 0); // Topspin base
    if (params.swingPathAngle < params.racketAngle) spinAxis.set(1, 0, 0); // Slice
    // Side spin logic could be added here

    const startVel = impactData.velocity.clone();
    const startAngVel = spinAxis.multiplyScalar(angularSpeedRad);
    // Serve starts higher
    const startY = activePreset === 'Serve' ? 2.8 : 1.0;
    const startPos = new THREE.Vector3(0, startY, 11); // 네트(0) 기준 뒤쪽(11m)

    const points = predictTrajectory(startPos, startVel, startAngVel);
    setTrajectoryPoints(points);
  }, [params, activePreset]);

  // Swing Action
  const handleSwing = useCallback(() => {
    if (!ballRef.current) return;

    const impactData = calculateImpact(params.racketSpeed, params.racketAngle, params.swingPathAngle, params.impactLocation);
    const angularSpeedRad = (impactData.rpm * 2 * Math.PI) / 60;
    
    let spinAxis = new THREE.Vector3(-1, 0, 0);
    if (params.swingPathAngle < params.racketAngle) spinAxis.set(1, 0, 0);

    const startY = activePreset === 'Serve' ? 2.8 : 1.0;
    const startPos: [number, number, number] = [0, startY, 11];

    ballRef.current.reset(
      startPos,
      [impactData.velocity.x, impactData.velocity.y, impactData.velocity.z],
      [spinAxis.x * angularSpeedRad, spinAxis.y * angularSpeedRad, spinAxis.z * angularSpeedRad]
    );

    setLastImpactData({
      speed: Math.round(impactData.velocity.length() * 3.6), // km/h
      rpm: Math.round(impactData.rpm)
    });
  }, [params, activePreset]);

  const handleReset = () => {
    if (ballRef.current) {
        const startY = activePreset === 'Serve' ? 2.8 : 1.0;
        ballRef.current.reset([0, startY, 11], [0,0,0], [0,0,0]);
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#050505' }}>
      
      {/* 3D Scene */}
      <Canvas shadows camera={{ position: [8, 6, 18], fov: 45 }}>
        <fog attach="fog" args={['#050505', 10, 50]} />
        <ambientLight intensity={0.4} />
        <spotLight 
            position={[10, 20, 10]} 
            angle={0.3} 
            penumbra={0.5} 
            intensity={200} 
            castShadow 
            shadow-mapSize={[2048, 2048]} 
        />
        <Environment preset="night" />

        <Physics gravity={[0, -9.81, 0]} defaultContactMaterial={{ restitution: 0.7, friction: 0.6 }}>
          <Court />
          <TennisBall ref={ballRef} position={[0, 1, 11]} />
        </Physics>

        <TrajectoryLine points={trajectoryPoints} />
        
        <ContactShadows position={[0, 0, 0]} opacity={0.4} scale={40} blur={2} far={4} />
        <OrbitControls 
            minPolarAngle={0} 
            maxPolarAngle={Math.PI / 2 - 0.1} 
            maxDistance={30}
            minDistance={5}
        />
      </Canvas>

      {/* UI Overlay */}
      <div className="ui-overlay">
        {/* Header */}
        <div className="header">
          <div className="brand">Ubuntu <span>Tennis</span></div>
          <div className="stats">
            {lastImpactData && (
              <>
                <div className="stat-item">
                  <div className="stat-value" style={{ color: 'var(--primary)' }}>{lastImpactData.speed}</div>
                  <div className="stat-label">KM/H</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{lastImpactData.rpm}</div>
                  <div className="stat-label">RPM</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Main Content Area (Left: Controls) */}
        <div style={{ display: 'flex', height: '100%', alignItems: 'center' }}>
          <div className="panel controls">
            <div className="control-group">
              <label className="label">Shot Presets</label>
              <div className="presets">
                {(Object.keys(PRESETS) as PresetName[]).map(name => (
                  <button 
                    key={name}
                    className={`btn ${activePreset === name ? 'active' : ''}`}
                    onClick={() => applyPreset(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <hr style={{ border: 0, borderBottom: '1px solid var(--glass-border)', width: '100%', margin: '1rem 0' }} />

            <RangeControl 
              label="Racket Speed" 
              value={params.racketSpeed} 
              min={10} max={100} step={1} unit="m/s"
              onChange={(v: number) => updateParam('racketSpeed', v)} 
            />
            <RangeControl 
              label="Face Angle" 
              value={params.racketAngle} 
              min={-30} max={30} step={1} unit="deg"
              onChange={(v: number) => updateParam('racketAngle', v)} 
            />
            <RangeControl 
              label="Swing Path" 
              value={params.swingPathAngle} 
              min={-20} max={60} step={1} unit="deg"
              onChange={(v: number) => updateParam('swingPathAngle', v)} 
            />
            
            <button className="btn btn-large" onClick={handleSwing}>
              Swing Racket
            </button>
             <button className="btn" style={{ marginTop: '0.5rem', opacity: 0.7 }} onClick={handleReset}>
              Reset Ball
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}