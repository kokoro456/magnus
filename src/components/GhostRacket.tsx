import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const GhostRacket = ({ 
  swingPathAngle, 
  racketAngle, 
  onSwing,
  speed = 1.0, // 애니메이션 속도 배율
  targetPosition = new THREE.Vector3(0, 1, 11) // 타격 목표 지점
}: { 
  swingPathAngle: number, 
  racketAngle: number,
  onSwing: boolean,
  speed?: number,
  targetPosition?: THREE.Vector3
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);
  
  // 정교한 스윙 궤적 생성 (베지에 곡선 활용 권장되나 여기선 CatmullRom으로 세밀 조정)
  const curve = useMemo(() => {
    const rad = THREE.MathUtils.degToRad(swingPathAngle);
    
    // 타격점 기준 상대 좌표로 스윙 궤적 설계
    // 오른쪽 잡이 기준 포핸드 탑스핀 궤적 시뮬레이션
    const p = targetPosition;

    const points = [
      // 1. 테이크백 (Takeback): 몸 뒤쪽, 높게
      new THREE.Vector3(p.x + 1.5, p.y + 0.5, p.z + 1.5),
      
      // 2. 다운스윙 (Downswing): 라켓이 떨어지며 가속 준비
      new THREE.Vector3(p.x + 1.2, p.y - 0.4, p.z + 0.8),
      
      // 3. 임팩트 직전 (Pre-Impact): 아래에서 위로 올라오기 시작
      new THREE.Vector3(p.x + 0.2, p.y - 0.1, p.z + 0.2),
      
      // 4. 임팩트 (Impact): 타격점
      new THREE.Vector3(p.x, p.y, p.z),
      
      // 5. 팔로우스루 (Follow-through): 몸 앞쪽으로 길게 뻗음
      new THREE.Vector3(p.x - 0.8, p.y + 0.6, p.z - 0.8),
      
      // 6. 피니시 (Finish): 어깨 넘어로 넘어감
      new THREE.Vector3(p.x - 1.2, p.y + 1.2, p.z - 0.2)
    ];

    // 스윙 궤적 각도(swingPathAngle)만큼 전체 회전 (Z축 기준)
    // 하지만 위 좌표들은 이미 포핸드 궤적을 내포하므로, 미세 조정만 수행
    // 여기서는 간단히 Y축(높이) 변형으로 상향/하향 스윙 반영
    
    const pathCurve = new THREE.CatmullRomCurve3(points);
    return pathCurve;
  }, [swingPathAngle, targetPosition]);

  useFrame((_, delta) => {
    if (onSwing && groupRef.current) {
      // 속도 보정: 30m/s가 기본(1.0)이라고 가정
      const speedFactor = (speed / 30) * 2.0; 
      
      // 임팩트 구간(0.5 근처)에서 가장 빠르게 지나가도록 Easing 적용 가능하지만,
      // 물리적 속도감을 위해 선형 증가에 가깝게 하되 전체 시간을 단축
      timeRef.current += delta * speedFactor;

      if (timeRef.current > 1) {
          timeRef.current = 1;
          // 스윙 끝난 후 잠시 유지하다 사라지게 하려면 여기서 처리
      }

      const t = timeRef.current;
      const point = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);
      
      groupRef.current.position.copy(point);
      
      // 라켓 방향 설정: 진행 방향(tangent)을 바라보되, 라켓 면이 공을 향하도록 조정
      const lookAtTarget = point.clone().add(tangent);
      groupRef.current.lookAt(lookAtTarget);
      
      // 라켓 면 각도(racketAngle) 및 손목 회전(Pronation) 적용
      // 임팩트(t=0.5~0.6) 구간에서 면이 수직이 되고, 이후엔 덮임
      const wristRoll = t > 0.6 ? (t - 0.6) * 2 : 0; // 팔로우스루 때 손목 덮기
      
      groupRef.current.rotateX(THREE.MathUtils.degToRad(racketAngle) + wristRoll);
      // 라켓을 손잡이 기준으로 회전시키기 위해 90도 보정
      groupRef.current.rotateZ(Math.PI / 2);

      groupRef.current.visible = true;

    } else if (!onSwing && groupRef.current) {
        timeRef.current = 0;
        groupRef.current.visible = false;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* 라켓 프레임 */}
      <mesh>
        <torusGeometry args={[0.15, 0.012, 16, 32]} />
        <meshStandardMaterial color="#222" roughness={0.4} />
      </mesh>
      {/* 그립 */}
      <mesh position={[0, -0.25, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.35, 8]} />
        <meshStandardMaterial color="#888" />
      </mesh>
      {/* 스트링 */}
      <mesh>
         <circleGeometry args={[0.145, 32]} />
         <meshBasicMaterial color="#ccff00" transparent opacity={0.15} side={THREE.DoubleSide} />
         {/* 격자 무늬 텍스처 대신 간단한 와이어프레임 느낌을 낼 수도 있음 */}
      </mesh>
      
      {/* 모션 블러 효과용 트레일 (간단 구현) */}
      {/* 성능상 생략하거나 Trail 컴포넌트 사용 가능 */}
    </group>
  );
};

export default GhostRacket;