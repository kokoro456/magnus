import React, { useState } from 'react';
import { useBox } from '@react-three/cannon';
import { soundManager } from '../utils/SoundManager';
import * as THREE from 'three';

const Target = ({ position = [0, 1.5, -10] }: { position?: [number, number, number] }) => {
  const [hit, setHit] = useState(false);
  
  const [ref] = useBox(() => ({
    type: 'Static', // 고정체
    position,
    args: [1, 1, 0.1], // 크기
    onCollide: (e) => {
      // 공과 충돌했을 때만 반응 (속도가 있는 물체)
      if (e.contact.impactVelocity > 1) {
         setHit(true);
         soundManager.playScore();
         setTimeout(() => setHit(false), 500); 
      }
    }
  }));

  return (
    <mesh ref={ref as any} castShadow>
      <boxGeometry args={[1, 1, 0.1]} />
      <meshStandardMaterial 
        color={hit ? '#ff3333' : '#ffff00'} 
        emissive={hit ? '#ff0000' : '#333300'}
        emissiveIntensity={hit ? 2 : 0.2}
      />
      {/* 과녁 무늬 (Torus) */}
      <mesh position={[0, 0, 0.06]}>
        <torusGeometry args={[0.3, 0.05, 16, 32]} />
        <meshStandardMaterial color="#ff0000" />
      </mesh>
    </mesh>
  );
};

export default Target;
