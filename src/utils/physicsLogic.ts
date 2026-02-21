// src/utils/physicsLogic.ts

import * as THREE from 'three';

const AIR_DENSITY = 1.225; 
const BALL_RADIUS = 0.033; 
const BALL_AREA = Math.PI * BALL_RADIUS * BALL_RADIUS;
const BALL_MASS = 0.057; 

export const calculateImpact = (
  racketSpeed: number,
  racketAngle: number, 
  swingPathAngle: number,
  impactLocation: number = 0
) => {
  const baseCOR = 0.85;
  const cor = baseCOR * (1 - impactLocation * 0.5);

  const rAngleRad = THREE.MathUtils.degToRad(racketAngle);
  const sPathRad = THREE.MathUtils.degToRad(swingPathAngle);

  const effectiveSpeed = racketSpeed * (1 + cor);
  const launchSpeed = effectiveSpeed * Math.cos(rAngleRad - sPathRad);

  const launchAngleRad = sPathRad + (rAngleRad - sPathRad) * 0.4; 

  const tangentialSpeed = racketSpeed * Math.sin(rAngleRad - sPathRad);
  const spinFactor = 600; 
  const rpm = tangentialSpeed * spinFactor * (1 - impactLocation * 0.3);

  const vy = launchSpeed * Math.sin(launchAngleRad);
  const vz = -launchSpeed * Math.cos(launchAngleRad);

  return {
    velocity: new THREE.Vector3(0, vy, vz),
    rpm: rpm,
    energyTransferEfficiency: cor * 100
  };
};

export const calculateMagnusForce = (
  velocity: THREE.Vector3,
  angularVelocity: THREE.Vector3
): THREE.Vector3 => {
  const liftCoefficient = 0.0006; // 양력 계수 상향 (시각화 효과 강화)
  const magnusDirection = new THREE.Vector3().crossVectors(angularVelocity, velocity);
  const force = magnusDirection.multiplyScalar(liftCoefficient * AIR_DENSITY * BALL_AREA);
  return force;
};

/**
 * 궤적 예측 고도화
 * steps를 300으로 늘려 코트 끝까지 보이게 함
 */
export const predictTrajectory = (
  startPos: THREE.Vector3,
  startVel: THREE.Vector3,
  startAngVel: THREE.Vector3,
  dt: number = 0.02, // 간격 조절
  steps: number = 300 // 예측 지점 대폭 확대
): THREE.Vector3[] => {
  const points: THREE.Vector3[] = [];
  const currentPos = startPos.clone();
  const currentVel = startVel.clone();
  const gravity = new THREE.Vector3(0, -9.81, 0);

  for (let i = 0; i < steps; i++) {
    points.push(currentPos.clone());

    const magnus = calculateMagnusForce(currentVel, startAngVel);
    const totalForce = new THREE.Vector3().addVectors(
        gravity.clone().multiplyScalar(BALL_MASS), 
        magnus
    );
    
    const acceleration = totalForce.divideScalar(BALL_MASS);

    currentVel.add(acceleration.multiplyScalar(dt));
    currentPos.add(currentVel.clone().multiplyScalar(dt));

    // 바닥 충돌 시 중단 또는 바운드 로직 (여기선 중단으로 시각화 깔끔하게 유지)
    if (currentPos.y < BALL_RADIUS) {
        points.push(currentPos.clone()); // 마지막 접지점 추가
        break;
    }
    
    // 코트 밖으로 너무 멀리 나가면 중단
    if (Math.abs(currentPos.z) > 40 || Math.abs(currentPos.x) > 20) break;
  }

  return points;
};