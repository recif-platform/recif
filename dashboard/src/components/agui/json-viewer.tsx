"use client";

import { useState, useCallback } from "react";
import { registerComponent } from "./registry";

interface JsonViewerProps {
  data: any;
}

/* Syntax-colored token rendering */
function JsonValue({ value, depth }: { value: any; depth: number }) {
  if (value === null) {
    return <span style={{ color: "#f87171" }}>null</span>;
  }
  if (typeof value === "boolean") {
    return <span style={{ color: "#c084fc" }}>{String(value)}</span>;
  }
  if (typeof value === "number") {
    return <span style={{ color: "#22d3ee" }}>{value}</span>;
  }
  if (typeof value === "string") {
    return (
      <span style={{ color: "#4ade80" }}>
        &quot;{value}&quot;
      </span>
    );
  }
  if (Array.isArray(value)) {
    return <JsonNode data={value} depth={depth} />;
  }
  if (typeof value === "object") {
    return <JsonNode data={value} depth={depth} />;
  }
  return <span style={{ color: "#e2e8f0" }}>{String(value)}</span>;
}

function JsonNode({ data, depth }: { data: any; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const isArray = Array.isArray(data);
  const entries: [string, any][] = isArray
    ? data.map((v: any, i: number) => [String(i), v])
    : Object.entries(data ?? {});

  if (entries.length === 0) {
    return (
      <span style={{ color: "#64748b" }}>{isArray ? "[]" : "{}"}</span>
    );
  }

  const bracketOpen = isArray ? "[" : "{";
  const bracketClose = isArray ? "]" : "}";

  return (
    <span>
      <button
        onClick={toggle}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "#64748b",
          fontSize: 10,
          padding: "0 2px",
          fontFamily: "var(--font-mono), monospace",
          verticalAlign: "middle",
        }}
        title={expanded ? "Collapse" : "Expand"}
      >
        {expanded ? "\u25BC" : "\u25B6"}
      </button>
      <span style={{ color: "#64748b" }}>
        {bracketOpen}
        {!expanded && (
          <span style={{ color: "#475569", fontSize: 12 }}>
            {" "}{entries.length} item{entries.length !== 1 ? "s" : ""}{" "}
          </span>
        )}
      </span>
      {expanded && (
        <div style={{ paddingLeft: 20 }}>
          {entries.map(([key, val]: [string, any], i: number) => (
            <div key={key} style={{ lineHeight: 1.8 }}>
              {!isArray && (
                <>
                  <span style={{ color: "#f59e0b" }}>&quot;{key}&quot;</span>
                  <span style={{ color: "#64748b" }}>: </span>
                </>
              )}
              <JsonValue value={val} depth={depth + 1} />
              {i < entries.length - 1 && (
                <span style={{ color: "#64748b" }}>,</span>
              )}
            </div>
          ))}
        </div>
      )}
      <span style={{ color: "#64748b" }}>{bracketClose}</span>
    </span>
  );
}

function JsonViewer({ data }: JsonViewerProps) {
  return (
    <div
      style={{
        margin: "8px 0",
        padding: "16px 20px",
        borderRadius: 14,
        background: "rgba(4, 14, 26, 0.8)",
        border: "1px solid rgba(34, 211, 238, 0.1)",
        boxShadow:
          "inset 0 1px 0 rgba(34,211,238,0.06), 0 4px 12px rgba(0,0,0,0.3)",
        fontSize: 14,
        fontFamily: "var(--font-mono), 'SF Mono', 'Fira Code', monospace",
        lineHeight: 1.6,
        overflowX: "auto",
      }}
    >
      <JsonNode data={data} depth={0} />
    </div>
  );
}

registerComponent("json-viewer", JsonViewer);

export { JsonViewer };
