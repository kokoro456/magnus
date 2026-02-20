import * as THREE from 'three'
import { ReactThreeFiber } from '@react-three/fiber'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      softBodyMaterial: ReactThreeFiber.Object3DNode<THREE.ShaderMaterial, typeof THREE.ShaderMaterial> & {
        uSquish?: number;
        uDirection?: THREE.Vector3;
        uColor?: THREE.Color;
      };
    }
  }
}
