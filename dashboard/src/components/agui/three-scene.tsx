"use client";

import { useRef, Suspense, useState } from "react";
import { registerComponent } from "./registry";

// Lazy-load heavy Three.js deps to keep bundle splits clean
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Mesh } from "three";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SceneObject {
  type: "sphere" | "box" | "cylinder" | "torus";
  position: [number, number, number];
  color: string;
  size?: number;
  args?: number[];
  rotation?: [number, number, number];
  animate?: boolean;
}

interface ThreeSceneProps {
  objects: SceneObject[];
  background?: string;
  camera?: { position: [number, number, number] };
  lights?: boolean;
  height?: number;
}

/* ------------------------------------------------------------------ */
/*  Sanitize numeric arrays from LLM                                    */
/* ------------------------------------------------------------------ */

function safeNum(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safePos(arr: unknown): [number, number, number] {
  if (!Array.isArray(arr) || arr.length < 3) return [0, 0, 0];
  return [safeNum(arr[0]), safeNum(arr[1]), safeNum(arr[2])];
}

function safeArgs(arr: unknown, fallback: number[]): number[] {
  if (!Array.isArray(arr) || arr.length === 0) return fallback;
  return arr.map((v) => safeNum(v, 1));
}

/* ------------------------------------------------------------------ */
/*  Geometry factory                                                    */
/* ------------------------------------------------------------------ */

const GEOMETRY_MAP: Record<
  SceneObject["type"],
  (obj: SceneObject) => React.JSX.Element
> = {
  sphere: (obj) => {
    const a = safeArgs(obj.args, [safeNum(obj.size, 1), 32, 32]);
    return <sphereGeometry args={a as [number, number, number]} />;
  },
  box: (obj) => {
    const s = safeNum(obj.size, 1);
    const a = safeArgs(obj.args, [s, s, s]);
    return <boxGeometry args={a as [number, number, number]} />;
  },
  cylinder: (obj) => {
    const s = safeNum(obj.size, 0.5);
    const a = safeArgs(obj.args, [s, s, 1, 32]);
    return <cylinderGeometry args={a as [number, number, number, number]} />;
  },
  torus: (obj) => {
    const a = safeArgs(obj.args, [safeNum(obj.size, 1), 0.3, 16, 100]);
    return <torusGeometry args={a as [number, number, number, number]} />;
  },
};

/* ------------------------------------------------------------------ */
/*  Animated mesh wrapper                                              */
/* ------------------------------------------------------------------ */

function AnimatedMesh({
  obj,
}: {
  obj: SceneObject;
}) {
  const meshRef = useRef<Mesh>(null);

  useFrame((_state, delta) => {
    if (obj.animate && meshRef.current) {
      meshRef.current.rotation.y += delta * 0.5;
    }
  });

  const GeometryEl = GEOMETRY_MAP[obj.type];
  if (!GeometryEl) return null;

  return (
    <mesh
      ref={meshRef}
      position={safePos(obj.position)}
      rotation={safePos(obj.rotation)}
    >
      {GeometryEl(obj)}
      <meshStandardMaterial color={obj.color} roughness={0.4} metalness={0.3} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

function ThreeScene({
  objects,
  background = "#0b1a2e",
  camera,
  lights = true,
  height = 400,
}: ThreeSceneProps) {
  const [error, setError] = useState<string | null>(null);

  if (error) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 14,
          background:
            "linear-gradient(165deg, rgba(20, 40, 65, 0.85), rgba(10, 24, 45, 0.92))",
          border: "1px solid rgba(34, 211, 238, 0.1)",
          boxShadow:
            "inset 0 1px 0 rgba(34,211,238,0.08), 0 4px 16px rgba(0,0,0,0.25)",
          color: "#f87171",
          fontSize: 13,
          fontWeight: 500,
          padding: "16px 24px",
          margin: "8px 0",
        }}
      >
        3D rendering unavailable: {error}
      </div>
    );
  }

  return (
    <div
      style={{
        height,
        borderRadius: 14,
        overflow: "hidden",
        background:
          "linear-gradient(165deg, rgba(20, 40, 65, 0.85), rgba(10, 24, 45, 0.92))",
        border: "1px solid rgba(34, 211, 238, 0.1)",
        boxShadow:
          "inset 0 1px 0 rgba(34,211,238,0.08), 0 4px 16px rgba(0,0,0,0.25)",
        margin: "8px 0",
      }}
    >
      <Canvas
        camera={{
          position: camera?.position ?? [0, 2, 5],
          fov: 50,
        }}
        onCreated={(state) => {
          state.gl.setClearColor(background);
        }}
        onError={() => setError("WebGL context failed")}
        style={{ borderRadius: 14 }}
      >
        <Suspense fallback={null}>
          {lights && (
            <>
              <ambientLight intensity={0.5} />
              <pointLight position={[10, 10, 10]} intensity={1} />
              <pointLight position={[-10, -5, -10]} intensity={0.3} color="#22d3ee" />
            </>
          )}
          {objects.map((obj, i) => (
            <AnimatedMesh key={i} obj={obj} />
          ))}
          <OrbitControls enableDamping dampingFactor={0.1} />
        </Suspense>
      </Canvas>
    </div>
  );
}

registerComponent("three-scene", ThreeScene);

export { ThreeScene };
