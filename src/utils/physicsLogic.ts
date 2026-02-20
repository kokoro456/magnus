// src/utils/physicsLogic.ts

import * as THREE from 'three';

// 상수 정의
const AIR_DENSITY = 1.225; // kg/m^3 (Sea level)
const BALL_RADIUS = 0.033; // m (Standard tennis ball)
const BALL_AREA = Math.PI * BALL_RADIUS * BALL_RADIUS;
const BALL_MASS = 0.057; // kg

/**
 * 브로디(Brody) 임팩트 모델 간소화 구현
 * 실제 논문의 복잡한 수식을 시뮬레이션에 맞게 근사화함.
 * 
 * @param racketSpeed 라켓 스윙 속도 (m/s)
 * @param racketAngle 라켓 면의 기울기 (degrees, 0 = 수직)
 * @param swingPathAngle 스윙 궤적 각도 (degrees, +: 상향 스윙, -: 하향 스윙)
 * @param impactLocation 임팩트 지점 오차 (0: 스윗스팟, 1: 프레임)
 */
export const calculateImpact = (
  racketSpeed: number,
  racketAngle: number, // 도(degree) 단위
  swingPathAngle: number, // 도(degree) 단위
  impactLocation: number = 0
) => {
  // 라켓 반발 계수 (COR) - 스윗스팟에서 멀어질수록 감소
  const baseCOR = 0.85;
  const cor = baseCOR * (1 - impactLocation * 0.5);

  // 각도를 라디안으로 변환
  const rAngleRad = THREE.MathUtils.degToRad(racketAngle);
  const sPathRad = THREE.MathUtils.degToRad(swingPathAngle);

  // 1. 출사 속도 (Exit Velocity)
  // 단순화: 라켓 속도와 반발 계수에 비례, 스윙 궤적과 라켓 면의 각도 차이에 따라 감소
  const effectiveSpeed = racketSpeed * (1 + cor);
  const launchSpeed = effectiveSpeed * Math.cos(rAngleRad - sPathRad);

  // 2. 출사각 (Launch Angle)
  // 스윙 궤적과 라켓 면 각도의 중간값에 가깝게 형성되지만, 마찰력에 의해 보정됨
  const launchAngleRad = sPathRad + (rAngleRad - sPathRad) * 0.4; // 0.4는 스트링과 공 사이의 접선 마찰 계수 관련 값

  // 3. 스핀량 (RPM)
  // 스윙 궤적과 라켓 면의 각도 차이(Tangential Velocity)가 클수록 스핀이 많이 걸림
  // 수직 스윙 속도 성분이 스핀을 만듦
  const tangentialSpeed = racketSpeed * Math.sin(rAngleRad - sPathRad);
  const spinFactor = 500; // 스핀 생성 상수 (임의 조정)
  const rpm = tangentialSpeed * spinFactor * (1 - impactLocation * 0.3);

  // 속도 벡터 생성 (XZ 평면 기준, Y가 높이)
  // 여기서는 2D 단면 분석을 3D로 확장. Z축(전진)과 Y축(높이)
  const vy = launchSpeed * Math.sin(launchAngleRad);
  const vz = -launchSpeed * Math.cos(launchAngleRad); // 전진 방향 (Three.js에서 -Z가 전방)

  return {
    velocity: new THREE.Vector3(0, vy, vz),
    rpm: rpm,
    energyTransferEfficiency: cor * 100 // % 단위
  };
};

/**
 * 마그누스 효과(Magnus Effect) 힘 계산
 * F_m = S * (w x v)
 * 
 * @param velocity 현재 공의 속도 벡터 (m/s)
 * @param angularVelocity 현재 공의 각속도 벡터 (rad/s)
 */
export const calculateMagnusForce = (
  velocity: THREE.Vector3,
  angularVelocity: THREE.Vector3
): THREE.Vector3 => {
  // 마그누스 계수 (Lift Coefficient와 유사하나 회전 고려)
  // 실제로는 스핀 비율(Spin Ratio)에 따라 달라지지만, 여기서는 평균적인 값 사용
  const liftCoefficient = 0.0004; 

  // 외적 (Cross Product): 회전축 x 진행방향 = 힘의 방향
  const magnusDirection = new THREE.Vector3().crossVectors(angularVelocity, velocity);
  
  // 힘의 크기 계산 (밀도, 단면적 등 고려한 간략식)
  // F = 1/2 * rho * A * Cl * v^2 ... 복잡하지만 시뮬레이션용 근사식 사용
  // F = S * (w x v) 형태
  
  // 힘 벡터 생성
  const force = magnusDirection.multiplyScalar(liftCoefficient * AIR_DENSITY * BALL_AREA);

  return force;
};

/**
 * 바운드 예측 (Trajectory Prediction)
 * 간단한 오일러 적분을 통해 미래 위치를 예측하여 선으로 그리기 위한 포인트 반환
 */
export const predictTrajectory = (
  startPos: THREE.Vector3,
  startVel: THREE.Vector3,
  startAngVel: THREE.Vector3,
  dt: number = 0.016,
  steps: number = 100
): THREE.Vector3[] => {
  const points: THREE.Vector3[] = [];
  const currentPos = startPos.clone();
  const currentVel = startVel.clone();
  const gravity = new THREE.Vector3(0, -9.81, 0);

  for (let i = 0; i < steps; i++) {
    points.push(currentPos.clone());

    // 힘 계산: 중력 + 마그누스
    const magnus = calculateMagnusForce(currentVel, startAngVel);
    const totalForce = new THREE.Vector3().addVectors(gravity.multiplyScalar(BALL_MASS), magnus);
    
    // 가속도: F = ma => a = F/m
    const acceleration = totalForce.divideScalar(BALL_MASS);

    // 속도 및 위치 업데이트 (Euler integration)
    currentVel.add(acceleration.multiplyScalar(dt));
    currentPos.add(currentVel.clone().multiplyScalar(dt));

    // 바닥 충돌 시 중단 (Y < 0.033)
    if (currentPos.y < BALL_RADIUS) break;
  }

  return points;
};
