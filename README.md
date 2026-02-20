# Ubuntu Tennis Academy Simulator

High-fidelity 3D Tennis Simulator powered by React, Three.js, and Cannon.js.

## Features
- **Hybrid Physics Engine**: Combines analytical impact models (Brody) with numerical integration for precision.
- **Soft Body Simulation**: Real-time vertex shader deformation for ball impact visualization.
- **Magnus Effect**: Accurate trajectory prediction based on spin and air density.
- **Interactive UI**: Real-time parameter adjustment using Leva.

## Tech Stack
- **Frontend**: React, Vite
- **3D**: Three.js, @react-three/fiber, @react-three/drei
- **Physics**: @react-three/cannon
- **Backend**: Firebase

## Setup
1. Clone the repository.
2. Run `npm install`.
3. Run `npm run dev`.

## Deployment
Deployed on Cloudflare Pages.