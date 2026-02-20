import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const GhostRacket = ({ 
  swingPathAngle, 
  racketAngle, 
  onSwing 
}: { 
  swingPathAngle: number, 
  racketAngle: number,
  onSwing: boolean 
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);
  
  // 스윙 궤적 생성 (단순화된 곡선)
  // 임팩트 지점 (0, 1, 10)을 지나도록 설계
  const curve = useMemo(() => {
    // 스윙 궤적 각도에 따라 시작점과 끝점 계산
    // 상향 스윙 (+) -> 아래에서 위로
    const rad = THREE.MathUtils.degToRad(swingPathAngle);
    
    const impactPoint = new THREE.Vector3(0, 1, 10);
    const length = 2; // 스윙 길이
    
    // 시작점 (뒤쪽 아래)
    const start = new THREE.Vector3(
      0, 
      impactPoint.y - Math.sin(rad) * length, 
      impactPoint.z + Math.cos(rad) * length
    );

    // 끝점 (앞쪽 위)
    const end = new THREE.Vector3(
      0, 
      impactPoint.y + Math.sin(rad) * length, 
      impactPoint.z - Math.cos(rad) * length
    );

    return new THREE.CatmullRomCurve3([start, impactPoint, end]);
  }, [swingPathAngle]);

  useFrame((state, delta) => {
    if (onSwing && groupRef.current) {
      timeRef.current += delta * 3; // 스윙 속도
      if (timeRef.current > 1) {
          timeRef.current = 1;
      }

      const point = curve.getPointAt(timeRef.current);
      const tangent = curve.getTangentAt(timeRef.current);
      
      groupRef.current.position.copy(point);
      
      // 라켓 면 각도 적용
      // 기본적으로 궤적을 따라가되, 라켓 면 각도만큼 추가 회전
      const lookAtTarget = point.clone().add(tangent);
      groupRef.current.lookAt(lookAtTarget);
      
      // 라켓 면 틸트 (X축 회전)
      groupRef.current.rotateX(THREE.MathUtils.degToRad(racketAngle));
    } else if (!onSwing) {
        timeRef.current = 0;
        // 초기 위치
        if(groupRef.current) {
             const start = curve.getPointAt(0);
             groupRef.current.position.copy(start);
             groupRef.current.rotation.set(0,0,0);
        }
    }
  });

  return (
    <group ref={groupRef}>
      {/* 라켓 헤드 */}
      <mesh rotation={[Math.PI/2, 0, 0]}>
        <torusGeometry args={[0.15, 0.01, 16, 32]} />
        <meshStandardMaterial color="#555" emissive="#ccff00" emissiveIntensity={0.2} />
      </mesh>
      {/* 라켓 목/손잡이 */}
      <mesh position={[0, -0.25, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.3, 8]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      {/* 스트링 (가상) */}
      <mesh rotation={[Math.PI/2, 0, 0]}>
         <circleGeometry args={[0.14, 32]} />
         <meshBasicMaterial color="#ccff00" transparent opacity={0.1} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

export default GhostRacket;
