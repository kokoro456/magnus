import { useRef, useMemo } from 'react';
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
  racketAngle, 
  onSwing,
  targetPosition,
  speed = 1.0 
}: PlayerProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const armRef = useRef<THREE.Group>(null);
  const handRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  
  const timeRef = useRef(0);
  
  const curve = useMemo(() => {
    const p = targetPosition;

    const points = [
      new THREE.Vector3(p.x + 1.2, p.y + 0.8, p.z + 1.5),
      new THREE.Vector3(p.x + 0.8, p.y - 0.2, p.z + 0.5),
      new THREE.Vector3(p.x, p.y, p.z),
      new THREE.Vector3(p.x - 0.8, p.y + 0.5, p.z - 0.5),
      new THREE.Vector3(p.x - 1.2, p.y + 1.5, p.z + 0.5)
    ];
    return new THREE.CatmullRomCurve3(points);
  }, [targetPosition]);

  useFrame((_, delta) => {
    if (onSwing) {
      const speedFactor = (speed / 30) * 1.5; 
      timeRef.current += delta * speedFactor;

      if (timeRef.current > 1) timeRef.current = 1;

      const t = timeRef.current;
      const handPos = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t);

      if (handRef.current) {
        handRef.current.position.copy(handPos);
        const lookAtTarget = handPos.clone().add(tangent);
        handRef.current.lookAt(lookAtTarget);
        handRef.current.rotateX(THREE.MathUtils.degToRad(racketAngle));
        handRef.current.rotateZ(Math.PI / 2);
      }

      if (armRef.current) {
          armRef.current.lookAt(handPos);
          armRef.current.rotation.x = THREE.MathUtils.lerp(armRef.current.rotation.x, 0, 0.1);
      }

      if (bodyRef.current) {
        const bodyRot = (t - 0.4) * Math.PI; 
        bodyRef.current.rotation.y = -bodyRot;
      }

    } else {
      timeRef.current = 0;
      if (bodyRef.current) bodyRef.current.rotation.y = 0;
      if (handRef.current) {
          handRef.current.position.set(0.3, 1.0, 11.5); 
          handRef.current.rotation.set(0, 0, Math.PI / 4);
      }
    }
  });

  return (
    <group ref={groupRef} position={[0, 0, 12]}>
      <group ref={bodyRef}>
        <mesh position={[0, 1.0, 0]} castShadow>
          <boxGeometry args={[0.5, 0.6, 0.2]} />
          <meshStandardMaterial color="#3366cc" />
        </mesh>
        <mesh position={[0, 1.5, 0]} castShadow>
          <sphereGeometry args={[0.12, 16, 16]} />
          <meshStandardMaterial color="#ffccaa" />
        </mesh>
        <mesh position={[-0.2, 0.4, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.8]} />
          <meshStandardMaterial color="#111" />
        </mesh>
        <mesh position={[0.2, 0.4, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.8]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      </group>

      <group position={[0.4, 1.3, 0]} ref={armRef}>
         <mesh position={[0, -0.3, 0]}>
            <capsuleGeometry args={[0.07, 0.6]} />
            <meshStandardMaterial color="#3366cc" />
         </mesh>
      </group>

      <group ref={handRef}>
        <mesh>
            <sphereGeometry args={[0.08]} />
            <meshStandardMaterial color="#ffccaa" />
        </mesh>
        <group rotation={[0, 0, 0]} position={[0, 0.3, 0]}>
            <mesh position={[0, 0.3, 0]} rotation={[Math.PI/2, 0, 0]}>
                <torusGeometry args={[0.15, 0.012, 16, 32]} />
                <meshStandardMaterial color="#222" />
            </mesh>
            <mesh position={[0, -0.15, 0]}>
                <cylinderGeometry args={[0.015, 0.015, 0.35, 8]} />
                <meshStandardMaterial color="#888" />
            </mesh>
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
