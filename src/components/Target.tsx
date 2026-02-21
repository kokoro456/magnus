import { useState } from 'react';
import { useBox } from '@react-three/cannon';
import { soundManager } from '../utils/SoundManager';

const Target = ({ position = [0, 1.5, -10] }: { position?: [number, number, number] }) => {
  const [hit, setHit] = useState(false);
  
  const [ref] = useBox(() => ({
    type: 'Static',
    position,
    args: [1, 1, 0.1],
    onCollide: (e) => {
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
      <mesh position={[0, 0, 0.06]}>
        <torusGeometry args={[0.3, 0.05, 16, 32]} />
        <meshStandardMaterial color="#ff0000" />
      </mesh>
    </mesh>
  );
};

export default Target;