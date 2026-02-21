import { useRef, useMemo } from 'react';
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
    const rad = THREE.MathUtils.degToRad(swingPathAngle);
    
    const impactPoint = new THREE.Vector3(0, 1, 11); // App.tsx의 공 위치와 일치
    const length = 2.5; // 스윙 길이
    
    // 시작점 (뒤쪽 아래)
    const start = new THREE.Vector3(
      0, 
      impactPoint.y - Math.sin(rad) * length * 0.8, 
      impactPoint.z + Math.cos(rad) * length
    );

    // 끝점 (앞쪽 위)
    const end = new THREE.Vector3(
      0, 
      impactPoint.y + Math.sin(rad) * length * 0.8, 
      impactPoint.z - Math.cos(rad) * length
    );

    // 부드러운 곡선을 위해 중간점 추가
    return new THREE.CatmullRomCurve3([start, impactPoint, end]);
  }, [swingPathAngle]);

  useFrame((_, delta) => {
    if (onSwing && groupRef.current) {
      timeRef.current += delta * 2.5; // 스윙 속도 조절
      if (timeRef.current > 1) {
          timeRef.current = 1;
      }

      const point = curve.getPointAt(timeRef.current);
      const tangent = curve.getTangentAt(timeRef.current);
      
      groupRef.current.position.copy(point);
      
      // 라켓이 궤적을 따라가도록 회전
      const lookAtTarget = point.clone().add(tangent);
      groupRef.current.lookAt(lookAtTarget);
      
      // 라켓 면 각도 적용 (X축 회전)
      groupRef.current.rotateX(THREE.MathUtils.degToRad(racketAngle));
      
      // 초기에는 안 보이다가 스윙 시작하면 보이게
      groupRef.current.visible = true;

    } else if (!onSwing && groupRef.current) {
        timeRef.current = 0;
        groupRef.current.visible = false; // 스윙 안 할 땐 숨김
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* 라켓 헤드 */}
      <mesh rotation={[Math.PI/2, 0, 0]}>
        <torusGeometry args={[0.15, 0.015, 16, 32]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      {/* 라켓 목/손잡이 */}
      <mesh position={[0, -0.3, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.4, 8]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      {/* 스트링 면 (반투명 효과) */}
      <mesh rotation={[Math.PI/2, 0, 0]}>
         <circleGeometry args={[0.14, 32]} />
         <meshBasicMaterial color="#ccff00" transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

export default GhostRacket;
