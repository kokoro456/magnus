// src/components/TennisBall.tsx

import React, { useRef, useImperativeHandle, forwardRef, useMemo } from 'react';
import { useFrame, extend } from '@react-three/fiber';
import { useSphere } from '@react-three/cannon';
import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { calculateMagnusForce } from '../utils/physicsLogic';

// --- Shader Definition ---
// 공이 찌그러지는 효과를 위한 Vertex Shader
const SoftBodyVertexShader = `
  uniform float uSquish;
  uniform vec3 uDirection;
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    
    vec3 newPosition = position;
    
    // 충돌 방향(uDirection)과 정점 법선(normal)의 내적을 통해
    // 해당 방향에 있는 정점들을 안쪽으로 밀어넣음
    float intensity = dot(normalize(normal), normalize(uDirection));
    
    // 찌그러짐 적용 (단순화된 모델)
    if (intensity > 0.0) {
        newPosition -= uDirection * (intensity * uSquish * 0.5);
    }

    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

// 간단한 형광 노란색 + 털 느낌(노이즈) Fragment Shader
const SoftBodyFragmentShader = `
  uniform vec3 uColor;
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    // 간단한 조명 효과 (Lambertian)
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    float diff = max(dot(vNormal, lightDir), 0.0);
    
    // 기본 색상 + 조명
    vec3 color = uColor * (0.5 + 0.5 * diff);
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

// Material 생성 및 등록
const SoftBodyMaterial = shaderMaterial(
  { uSquish: 0, uDirection: new THREE.Vector3(0, 1, 0), uColor: new THREE.Color('#ccff00') },
  SoftBodyVertexShader,
  SoftBodyFragmentShader
);

extend({ SoftBodyMaterial });

// TypeScript를 위한 JSX 내성 선언
declare global {
  namespace JSX {
    interface IntrinsicElements {
      softBodyMaterial: any;
    }
  }
}

interface TennisBallProps {
  position?: [number, number, number];
  onImpact?: (velocity: number) => void;
}

export interface TennisBallRef {
  reset: (pos: [number, number, number], vel: [number, number, number], angVel: [number, number, number]) => void;
  api: any;
}

const TennisBall = forwardRef<TennisBallRef, TennisBallProps>((props, ref) => {
  const { position = [0, 2, 0], onImpact } = props;
  const materialRef = useRef<any>(null);
  
  // 물리 바디 생성 (반지름 0.033m = 3.3cm, 질량 0.057kg)
  const [sphereRef, api] = useSphere(() => ({
    mass: 0.057,
    position,
    args: [0.033],
    material: { friction: 0.6, restitution: 0.7 }, // 테니스 코트 마찰/반발력
    onCollide: (e) => {
      // 충돌 시 쉐이더 찌그러짐 효과 발동
      if (materialRef.current) {
        // 충돌 법선 벡터 (Contact Normal)
        const contactNormal = new THREE.Vector3(e.contact.contactNormal[0], e.contact.contactNormal[1], e.contact.contactNormal[2]);
        const relativeVelocity = e.contact.impactVelocity;
        
        // 속도가 빠를수록 많이 찌그러짐 (최대 0.4)
        const squishAmount = Math.min(Math.abs(relativeVelocity) * 0.05, 0.4);
        
        materialRef.current.uSquish = squishAmount;
        materialRef.current.uDirection = contactNormal;

        // 충격음 또는 데이터 전달
        if (onImpact) onImpact(relativeVelocity);

        // 0.1초 뒤 복구 (부드럽게 복구하려면 useFrame에서 lerp 사용 권장)
        setTimeout(() => {
          if (materialRef.current) materialRef.current.uSquish = 0;
        }, 100);
      }
    }
  }));

  // 외부에서 물리 상태를 제어할 수 있도록 핸들 제공
  useImperativeHandle(ref, () => ({
    reset: (pos, vel, angVel) => {
      api.position.set(...pos);
      api.velocity.set(...vel);
      api.angularVelocity.set(...angVel);
      api.rotation.set(0, 0, 0);
    },
    api: api
  }));

  // 매 프레임마다 마그누스 효과 적용 (커스텀 힘)
  const velocity = useRef([0, 0, 0]);
  const angularVelocity = useRef([0, 0, 0]);
  
  // 구독: 속도 및 회전 정보 동기화
  React.useEffect(() => api.velocity.subscribe((v) => (velocity.current = v)), [api.velocity]);
  React.useEffect(() => api.angularVelocity.subscribe((v) => (angularVelocity.current = v)), [api.angularVelocity]);

  useFrame(() => {
    // 마그누스 힘 계산 및 적용
    const v = new THREE.Vector3(...velocity.current);
    const w = new THREE.Vector3(...angularVelocity.current);
    
    // 속도가 너무 느리면(정지 상태) 계산 생략
    if (v.lengthSq() > 0.1) {
      const magnusForce = calculateMagnusForce(v, w);
      // Cannon.js의 applyForce는 (힘 벡터, 적용 지점)을 받음
      // 중앙에 적용
      api.applyForce([magnusForce.x, magnusForce.y, magnusForce.z], [0, 0, 0]);
    }
  });

  return (
    <mesh ref={sphereRef as any} castShadow receiveShadow>
      <sphereGeometry args={[0.033, 32, 32]} />
      {/* 커스텀 쉐이더 재질 적용 */}
      <softBodyMaterial ref={materialRef} transparent />
    </mesh>
  );
});

export default TennisBall;
