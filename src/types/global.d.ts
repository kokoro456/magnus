import * as THREE from 'three'
import { Object3DNode } from '@react-three/fiber'

// R3F v8+ 및 v9 호환을 위해 ThreeElements 인터페이스 확장
declare module '@react-three/fiber' {
  interface ThreeElements {
    softBodyMaterial: Object3DNode<THREE.ShaderMaterial, typeof THREE.ShaderMaterial> & {
      uSquish?: number;
      uDirection?: THREE.Vector3;
      uColor?: THREE.Color;
      transparent?: boolean; // transparent 속성 추가
    }
  }
}

// 구형 호환성을 위해 JSX.IntrinsicElements 확장도 유지 (선택 사항)
declare global {
  namespace JSX {
    interface IntrinsicElements {
      softBodyMaterial: any; // Fallback to any to suppress errors if the above doesn't work perfectly
    }
  }
}