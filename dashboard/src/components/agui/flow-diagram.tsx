"use client";

import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { registerComponent } from "./registry";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FlowNode {
  id: string;
  label: string;
  position?: { x: number; y: number };
  type?: string;
  style?: Record<string, unknown>;
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
}

interface FlowDiagramProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  title?: string;
  direction?: "TB" | "LR";
  height?: number;
}

/* ------------------------------------------------------------------ */
/*  Reef-dark node style                                               */
/* ------------------------------------------------------------------ */

const REEF_NODE_STYLE: React.CSSProperties = {
  background: "linear-gradient(165deg, rgba(20, 40, 65, 0.92), rgba(10, 24, 45, 0.96))",
  border: "1px solid rgba(34, 211, 238, 0.3)",
  borderRadius: 10,
  color: "#f1f5f9",
  fontSize: 13,
  fontWeight: 600,
  padding: "10px 18px",
  boxShadow: "0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(34,211,238,0.1)",
};

/* ------------------------------------------------------------------ */
/*  Auto-layout: simple grid fallback                                  */
/* ------------------------------------------------------------------ */

function autoLayout(
  flowNodes: FlowNode[],
  direction: "TB" | "LR",
): { x: number; y: number }[] {
  const cols = Math.ceil(Math.sqrt(flowNodes.length));
  const spacingX = direction === "LR" ? 220 : 200;
  const spacingY = direction === "LR" ? 120 : 140;

  return flowNodes.map((_, i) => {
    const col = direction === "LR" ? Math.floor(i / cols) : i % cols;
    const row = direction === "LR" ? i % cols : Math.floor(i / cols);
    return { x: col * spacingX, y: row * spacingY };
  });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function FlowDiagram({
  nodes: inputNodes,
  edges: inputEdges,
  title,
  direction = "TB",
  height = 600,
}: FlowDiagramProps) {
  const positions = useMemo(
    () => autoLayout(inputNodes, direction),
    [inputNodes, direction],
  );

  const initialNodes: Node[] = useMemo(
    () =>
      inputNodes.map((n, i) => ({
        id: n.id || `node-${i}`,
        type: n.type ?? "default",
        position: n.position ?? positions[i],
        data: { label: n.label },
        style: REEF_NODE_STYLE,
      })),
    [inputNodes, positions],
  );

  const initialEdges: Edge[] = useMemo(
    () =>
      inputEdges.map((e, i) => ({
        id: e.id || `edge-${i}`,
        source: e.source,
        target: e.target,
        label: e.label,
        animated: e.animated ?? false,
        style: { stroke: "#22d3ee", strokeWidth: 2 },
        labelStyle: { fill: "#94a3b8", fontSize: 11, fontWeight: 500 },
      })),
    [inputEdges],
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    setTimeout(() => instance.fitView({ padding: 0.15 }), 200);
    setTimeout(() => instance.fitView({ padding: 0.15 }), 800);
  }, []);

  return (
    <div ref={containerRef} style={{ width: "calc(100vw - 420px)", maxWidth: 1200, margin: "8px 0" }}>
    <div
      style={{
        width: "100%",
        height,
        borderRadius: 14,
        overflow: "hidden",
        background:
          "linear-gradient(165deg, rgba(20, 40, 65, 0.85), rgba(10, 24, 45, 0.92))",
        border: "1px solid rgba(34, 211, 238, 0.1)",
        boxShadow:
          "inset 0 1px 0 rgba(34,211,238,0.08), 0 4px 16px rgba(0,0,0,0.25)",
        position: "relative",
      }}
    >
      {title && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 16,
            zIndex: 10,
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#22d3ee",
          }}
        >
          {title}
        </div>
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={onInit}
        fitView
        proOptions={{ hideAttribution: true }}
        style={{ background: "transparent" }}
      >
        <Background color="rgba(34, 211, 238, 0.06)" gap={20} size={1} />
        <Controls
          showInteractive={false}
          style={{
            background: "rgba(10, 24, 45, 0.9)",
            border: "1px solid rgba(34, 211, 238, 0.15)",
            borderRadius: 8,
          }}
        />
      </ReactFlow>
    </div>
    </div>
  );
}

registerComponent("flow-diagram", FlowDiagram);

export { FlowDiagram };
