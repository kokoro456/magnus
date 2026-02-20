/// <reference types="vite/client" />

import * as THREE from 'three'
import { Object3DNode } from '@react-three/fiber'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      softBodyMaterial: any;
    }
  }
}

declare module '@react-three/fiber' {
  interface ThreeElements {
    softBodyMaterial: Object3DNode<THREE.ShaderMaterial, typeof THREE.ShaderMaterial> & {
      uSquish?: number;
      uDirection?: THREE.Vector3;
      uColor?: THREE.Color;
      transparent?: boolean;
    }
  }
}
