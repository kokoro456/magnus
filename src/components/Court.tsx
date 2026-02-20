import React from 'react';
import { usePlane } from '@react-three/cannon';
import { useTexture, Line } from '@react-three/drei';
import * as THREE from 'three';

// 테니스 코트 규격 (미터 단위)
// 전체 코트: 23.77m (길이) x 10.97m (폭)
// 단식 라인: 8.23m (폭)
// 서비스 라인: 네트에서 6.40m
// 네트 높이: 중앙 0.914m, 포스트 1.07m

const CourtLines = () => {
  const lineColor = "white";
  const lineWidth = 0.05; // 5cm

  // 라인 정의 (Z축이 길이 방향, X축이 폭 방향)
  const lines = [
    // 외곽선 (BaseLines & SideLines)
    [[-5.485, 0.01, -11.885], [5.485, 0.01, -11.885]], // Top Base
    [[-5.485, 0.01, 11.885], [5.485, 0.01, 11.885]],   // Bottom Base
    [[-5.485, 0.01, -11.885], [-5.485, 0.01, 11.885]], // Left Side (Doubles)
    [[5.485, 0.01, -11.885], [5.485, 0.01, 11.885]],   // Right Side (Doubles)
    
    // 단식 사이드라인
    [[-4.115, 0.01, -11.885], [-4.115, 0.01, 11.885]], // Left Side (Singles)
    [[4.115, 0.01, -11.885], [4.115, 0.01, 11.885]],   // Right Side (Singles)

    // 서비스 라인 (가로)
    [[-4.115, 0.01, -6.4], [4.115, 0.01, -6.4]],       // Top Service
    [[-4.115, 0.01, 6.4], [4.115, 0.01, 6.4]],         // Bottom Service

    // 센터 서비스 라인 (세로)
    [[0, 0.01, -6.4], [0, 0.01, 6.4]],                 // Center Service
    
    // 센터 마크 (베이스라인 중앙)
    [[0, 0.01, -11.885], [0, 0.01, -11.5]],            // Top Mark
    [[0, 0.01, 11.885], [0, 0.01, 11.5]],              // Bottom Mark
  ];

  return (
    <group>
      {lines.map((points, index) => (
        <Line
          key={index}
          points={points as [number, number, number][]}
          color={lineColor}
          lineWidth={3} // 픽셀 단위 두께
          transparent
          opacity={0.8}
        />
      ))}
    </group>
  );
};

const Net = () => {
  return (
    <group position={[0, 0, 0]}>
      {/* 네트 포스트 (양쪽 끝) */}
      <mesh position={[-6, 0.535, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.05, 0.05, 1.07, 16]} />
        <meshStandardMaterial color="#333" roughness={0.5} metalness={0.8} />
      </mesh>
      <mesh position={[6, 0.535, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.05, 0.05, 1.07, 16]} />
        <meshStandardMaterial color="#333" roughness={0.5} metalness={0.8} />
      </mesh>

      {/* 네트 메쉬 (단순화된 면 + 텍스처 느낌) */}
      <mesh position={[0, 0.457, 0]} receiveShadow>
        <boxGeometry args={[12, 0.914, 0.02]} />
        <meshStandardMaterial 
          color="#111" 
          transparent 
          opacity={0.6} 
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* 네트 상단 흰색 밴드 */}
      <mesh position={[0, 0.9, 0]} receiveShadow>
        <boxGeometry args={[12, 0.05, 0.025]} />
        <meshStandardMaterial color="#eee" roughness={0.8} />
      </mesh>
    </group>
  );
};

const IndoorEnvironment = () => {
  return (
    <group>
      {/* 바닥 (코트 색상) */}
      {/* Blue Court */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[10.97 + 4, 23.77 + 6]} /> {/* 여유 공간 포함 */}
        <meshStandardMaterial color="#3a6ea5" roughness={0.8} />
      </mesh>
      
      {/* Out area (Green) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[30, 40]} />
        <meshStandardMaterial color="#2c5f2d" roughness={0.9} />
      </mesh>

      {/* 벽면 (실내 느낌) */}
      <mesh position={[0, 10, -25]}>
        <planeGeometry args={[60, 20]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0, 10, 25]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[60, 20]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
       <mesh position={[-30, 10, 0]} rotation={[0, Math.PI/2, 0]}>
        <planeGeometry args={[60, 20]} />
        <meshStandardMaterial color="#222" />
      </mesh>
       <mesh position={[30, 10, 0]} rotation={[0, -Math.PI/2, 0]}>
        <planeGeometry args={[60, 20]} />
        <meshStandardMaterial color="#222" />
      </mesh>
    </group>
  );
};

const Court = () => {
  // 물리 바닥 (보이지 않는 충돌체)
  const [ref] = usePlane(() => ({
    rotation: [-Math.PI / 2, 0, 0],
    position: [0, 0, 0],
    material: { friction: 0.6, restitution: 0.7 }
  }));

  return (
    <group>
      <mesh ref={ref as any} visible={false}>
        <planeGeometry args={[100, 100]} />
      </mesh>
      
      <IndoorEnvironment />
      <CourtLines />
      <Net />
    </group>
  );
};

export default Court;
