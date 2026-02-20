// src/App.tsx
import React, { useRef, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Physics, usePlane } from '@react-three/cannon';
import { OrbitControls, Line, Sky, Stars } from '@react-three/drei';
import { useControls, button } from 'leva';
import * as THREE from 'three';

import TennisBall, { TennisBallRef } from './components/TennisBall';
import { calculateImpact, predictTrajectory } from './utils/physicsLogic';

// 테니스 코트 (바닥)
const TennisCourt = () => {
  const [ref] = usePlane(() => ({
    rotation: [-Math.PI / 2, 0, 0],
    position: [0, 0, 0],
    material: { friction: 0.6, restitution: 0.7 } // 하드 코트 특성
  }));

  return (
    <mesh ref={ref as any} receiveShadow>
      <planeGeometry args={[20, 30]} />
      <meshStandardMaterial color="#3a6ea5" /> {/* 하드 코트 색상 */}
      <gridHelper args={[20, 20, 0xffffff, 0xffffff]} rotation={[-Math.PI/2, 0, 0]} position={[0, 0.01, 0]} />
    </mesh>
  );
};

// 궤적 예측 선
const TrajectoryLine = ({ points }: { points: THREE.Vector3[] }) => {
  if (points.length < 2) return null;
  return (
    <Line
      points={points}
      color="red"
      lineWidth={3}
      dashed={true}
      dashScale={2}
      dashSize={1}
      gapSize={0.5}
    />
  );
};

const Scene = () => {
  const ballRef = useRef<TennisBallRef>(null);
  const [trajectoryPoints, setTrajectoryPoints] = useState<THREE.Vector3[]>([]);

  // Leva 컨트롤 패널
  const { racketSpeed, racketAngle, swingPathAngle, impactLocation, spinType } = useControls('Swing Parameters', {
    racketSpeed: { value: 30, min: 10, max: 60, step: 1, label: 'Racket Speed (m/s)' },
    racketAngle: { value: 0, min: -20, max: 20, step: 1, label: 'Racket Face Angle (deg)' },
    swingPathAngle: { value: 10, min: -10, max: 45, step: 1, label: 'Swing Path (deg)' },
    impactLocation: { value: 0, min: 0, max: 1, step: 0.1, label: 'Off-Center Hit (0-1)' },
    spinType: { value: 'Topspin', options: ['Topspin', 'Flat', 'Slice', 'Sidespin'] } // 단순 참고용 라벨
  });

  // 스윙 액션
  useControls({
    'Swing!': button(() => {
      if (!ballRef.current) return;

      // 1. 브로디 모델로 초기 상태 계산
      const impactData = calculateImpact(racketSpeed, racketAngle, swingPathAngle, impactLocation);
      
      // 2. RPM -> rad/s 변환
      // 탑스핀: X축 회전 (전진 방향으로 굴러가는 회전, -X)
      // 슬라이스: X축 역회전 (+X)
      // 사이드스핀: Y축 회전
      // 여기서는 간단히 Topspin/Slice 모델만 적용 (X축 회전)
      
      // 물리 엔진의 각속도 벡터 (rad/s)
      const angularSpeedRad = (impactData.rpm * 2 * Math.PI) / 60;
      
      // 스핀 축 결정 (탑스핀 기준: 공의 윗부분이 진행방향으로 감 => -X축 회전)
      // 만약 슬라이스라면 반대
      // PhysicsLogic에서 이미 Tangential Velocity로 방향성을 잡았지만,
      // 여기서는 3D 축에 매핑해줘야 함.
      // TennisBall의 z축이 진행방향(-z)이라고 가정할 때, x축 회전이 탑스핀/백스핀 관여.
      
      // 간단한 모델링: 스윙 궤적이 라켓 각도보다 가파르면(상향) 탑스핀, 완만하면(하향) 슬라이스
      // PhysicsLogic에서 RPM은 절대값으로 나올 수 있으므로 방향 보정
      let spinAxis = new THREE.Vector3(-1, 0, 0); // 기본 탑스핀 축
      if (swingPathAngle < racketAngle) {
          // 하향 스윙 -> 슬라이스 (역회전) -> +X축 회전
          spinAxis.set(1, 0, 0);
      }
      
      // 사이드스핀 로직 (추가 구현 가능)
      if (spinType === 'Sidespin') {
          spinAxis.set(0, 1, 0);
      }

      const angularVelocity = spinAxis.multiplyScalar(angularSpeedRad);

      // 3. 공 초기화 및 발사
      // 시작 위치: 높이 1m, 네트 앞쪽
      const startPos: [number, number, number] = [0, 1, 10]; 
      
      ballRef.current.reset(
        startPos,
        [impactData.velocity.x, impactData.velocity.y, impactData.velocity.z],
        [angularVelocity.x, angularVelocity.y, angularVelocity.z]
      );
    }),
    'Reset': button(() => {
       if (ballRef.current) ballRef.current.reset([0, 1, 10], [0,0,0], [0,0,0]);
    })
  });

  // 파라미터 변경 시 예상 궤적 업데이트
  useEffect(() => {
    // 가상 시뮬레이션
    const impactData = calculateImpact(racketSpeed, racketAngle, swingPathAngle, impactLocation);
    const angularSpeedRad = (impactData.rpm * 2 * Math.PI) / 60;
    
    let spinAxis = new THREE.Vector3(-1, 0, 0);
    if (swingPathAngle < racketAngle) spinAxis.set(1, 0, 0);
    if (spinType === 'Sidespin') spinAxis.set(0, 1, 0);

    const startVel = impactData.velocity.clone();
    const startAngVel = spinAxis.multiplyScalar(angularSpeedRad);
    const startPos = new THREE.Vector3(0, 1, 10);

    const points = predictTrajectory(startPos, startVel, startAngVel);
    setTrajectoryPoints(points);

  }, [racketSpeed, racketAngle, swingPathAngle, impactLocation, spinType]);

  return (
    <>
      <OrbitControls />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <Sky sunPosition={[100, 20, 100]} />
      <Stars />
      
      <Physics gravity={[0, -9.81, 0]} defaultContactMaterial={{ restitution: 0.7, friction: 0.6 }}>
        <TennisBall ref={ballRef} position={[0, 1, 10]} />
        <TennisCourt />
      </Physics>

      {/* 궤적 시각화 (물리 세계 밖에서 렌더링) */}
      <TrajectoryLine points={trajectoryPoints} />
    </>
  );
};

function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#111' }}>
      <Canvas shadows camera={{ position: [5, 2, 15], fov: 50 }}>
        <Scene />
      </Canvas>
      
      {/* UI 오버레이 */}
      <div style={{ position: 'absolute', top: 20, left: 20, color: 'white', pointerEvents: 'none' }}>
        <h1>Ubuntu Tennis Academy Simulator</h1>
        <p>Adjust parameters and click 'Swing!'</p>
      </div>
    </div>
  );
}

export default App;