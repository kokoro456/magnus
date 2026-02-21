// src/components/Player.tsx
import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface PlayerProps {
  swingPathAngle: number;
  racketAngle: number;
  onSwing: boolean;
  targetPosition: THREE.Vector3;
  speed?: number;
}

const Player = ({ 
  swingPathAngle, 
  racketAngle, 
  onSwing,
  targetPosition,
  speed = 1.0 
}: PlayerProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const armRef = useRef<THREE.Group>(null);
  const forearmRef = useRef<THREE.Group>(null);
  const handRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  
  const timeRef = useRef(0);
  
  // 스윙 궤적 (라켓/손의 이동 경로)
  const curve = useMemo(() => {
    const rad = THREE.MathUtils.degToRad(swingPathAngle);
    const p = targetPosition;

    // 포핸드 스윙 궤적 (오른손잡이 기준)
    const points = [
      new THREE.Vector3(p.x + 1.2, p.y + 0.8, p.z + 1.5), // 테이크백 (뒤)
      new THREE.Vector3(p.x + 0.8, p.y - 0.2, p.z + 0.5), // 다운스윙
      new THREE.Vector3(p.x, p.y, p.z),                   // 임팩트 (타격점)
      new THREE.Vector3(p.x - 0.8, p.y + 0.5, p.z - 0.5), // 팔로우스루 (앞)
      new THREE.Vector3(p.x - 1.2, p.y + 1.5, p.z + 0.5)  // 피니시 (어깨 위)
    ];
    return new THREE.CatmullRomCurve3(points);
  }, [swingPathAngle, targetPosition]);

  useFrame((_, delta) => {
    if (onSwing) {
      const speedFactor = (speed / 30) * 1.5; 
      timeRef.current += delta * speedFactor;

      if (timeRef.current > 1) timeRef.current = 1;

      // 1. 손(라켓) 위치 계산
      const t = timeRef.current;
      const handPos = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);

      // 손 위치 업데이트
      if (handRef.current) {
        handRef.current.position.copy(handPos);
        
        // 라켓 방향 설정
        const lookAtTarget = handPos.clone().add(tangent);
        handRef.current.lookAt(lookAtTarget);
        handRef.current.rotateX(THREE.MathUtils.degToRad(racketAngle));
        handRef.current.rotateZ(Math.PI / 2);
      }

      // 2. 팔 관절 (IK-like)
      // 어깨 위치 (몸통 기준 고정)
      const shoulderPos = new THREE.Vector3(0.4, 1.4, 0).add(groupRef.current?.position || new THREE.Vector3());
      
      // 팔 길이
      const armLength = 0.6;
      const forearmLength = 0.6;

      // 어깨 -> 손 벡터
      const armVec = new THREE.Vector3().subVectors(handPos, shoulderPos);
      const dist = armVec.length();

      // 너무 멀면 팔을 뻗음 (최대 길이 제한)
      const reach = Math.min(dist, armLength + forearmLength - 0.01);
      
      // 삼각함수로 팔꿈치 위치 계산 (Law of Cosines)
      // 여기서는 복잡한 IK 대신, 어깨가 손을 바라보게 하고 팔꿈치를 약간 굽히는 간단한 FK로 처리
      if (armRef.current && forearmRef.current) {
          // 상박은 손 방향을 바라봄
          armRef.current.lookAt(handPos);
          // 하박은 상박 끝에서 손까지 연결되어야 함 (생략: 시각적 허용치 내에서 단순화)
          // 좀 더 자연스럽게 하려면 팔꿈치 각도를 t에 따라 조절
          
          // 테이크백(t<0.3): 팔 굽힘
          // 임팩트(t=0.5): 팔 폄
          // 팔로우스루(t>0.7): 팔 굽힘
          let elbowBend = 0;
          if (t < 0.3) elbowBend = -Math.PI / 4;
          else if (t < 0.6) elbowBend = -Math.PI / 12; // 거의 폄
          else elbowBend = -Math.PI / 2; // 많이 굽힘

          // 보간
          armRef.current.rotation.x = THREE.MathUtils.lerp(armRef.current.rotation.x, 0, 0.1); // 어깨 상하
          // 팔꿈치 (Forearm은 Arm의 자식이므로 로컬 회전)
          // forearmRef.current.rotation.x = elbowBend; // 축 문제로 생략하고 통짜 팔로 표현하거나 분리 필요
      }

      // 3. 몸통 회전 (Torso Rotation)
      if (bodyRef.current) {
        // 테이크백: 우측 회전 (-Y)
        // 임팩트: 정면 (0)
        // 팔로우스루: 좌측 회전 (+Y)
        const bodyRot = (t - 0.4) * Math.PI; 
        bodyRef.current.rotation.y = -bodyRot;
      }

    } else {
      timeRef.current = 0;
      // 대기 자세 (Ready Position)
      if (bodyRef.current) bodyRef.current.rotation.y = 0;
      if (handRef.current) {
          // 기본 위치: 몸 앞
          handRef.current.position.set(0.3, 1.0, 11.5); 
          handRef.current.rotation.set(0, 0, Math.PI / 4);
      }
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 12]}> {/* 플레이어 위치: 베이스라인 근처 */}
      
      {/* --- Body (Torso) --- */}
      <group ref={bodyRef}>
        <mesh position={[0, 1.0, 0]} castShadow>
          <boxGeometry args={[0.5, 0.6, 0.2]} />
          <meshStandardMaterial color="#3366cc" /> {/* 파란 티셔츠 */}
        </mesh>
        
        {/* Head */}
        <mesh position={[0, 1.5, 0]} castShadow>
          <sphereGeometry args={[0.12, 16, 16]} />
          <meshStandardMaterial color="#ffccaa" /> {/* 살구색 */}
        </mesh>

        {/* --- Legs (Static for now) --- */}
        <mesh position={[-0.2, 0.4, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.8]} />
          <meshStandardMaterial color="#111" /> {/* 검은 바지 */}
        </mesh>
        <mesh position={[0.2, 0.4, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.8]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      </group>

      {/* --- Right Arm & Racket (Separated from body rotation for easier IK) --- */}
      {/* 어깨 관절 위치에서 시작 */}
      <group position={[0.4, 1.3, 0]} ref={armRef}>
         {/* 상박 */}
         <mesh position={[0, -0.3, 0]}>
            <capsuleGeometry args={[0.07, 0.6]} />
            <meshStandardMaterial color="#3366cc" />
         </mesh>
         
         {/* 하박 (팔꿈치 아래) - 계층 구조 단순화를 위해 생략하거나 별도 그룹화 */}
      </group>

      {/* --- Hand & Racket (Follows Curve) --- */}
      {/* 월드 좌표계에서 궤적을 따라 움직임 */}
      <group ref={handRef}>
        {/* 손 */}
        <mesh>
            <sphereGeometry args={[0.08]} />
            <meshStandardMaterial color="#ffccaa" />
        </mesh>

        {/* 라켓 (손에 부착) */}
        <group rotation={[0, 0, 0]} position={[0, 0.3, 0]}> {/* 손잡이 잡은 위치 보정 */}
            {/* 라켓 프레임 */}
            <mesh position={[0, 0.3, 0]} rotation={[Math.PI/2, 0, 0]}>
                <torusGeometry args={[0.15, 0.012, 16, 32]} />
                <meshStandardMaterial color="#222" />
            </mesh>
            {/* 그립 */}
            <mesh position={[0, -0.15, 0]}>
                <cylinderGeometry args={[0.015, 0.015, 0.35, 8]} />
                <meshStandardMaterial color="#888" />
            </mesh>
            {/* 스트링 */}
            <mesh position={[0, 0.3, 0]} rotation={[Math.PI/2, 0, 0]}>
                <circleGeometry args={[0.145, 32]} />
                <meshBasicMaterial color="#ccff00" transparent opacity={0.2} side={THREE.DoubleSide} />
            </mesh>
        </group>
      </group>

    </group>
  );
};

export default Player;
