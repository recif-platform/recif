"use client";

import { useState } from "react";
import { registerComponent } from "./registry";

interface HTMLPreviewProps {
  html: string;
  height?: number;
  title?: string;
}

function HTMLPreview({ html, height = 600, title }: HTMLPreviewProps) {
  const [expanded, setExpanded] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  const fullHtml = html.includes("<html") ? html : `
    <!DOCTYPE html>
    <html><head><style>body{margin:0;background:#0a1628;overflow:auto;color:#e2e8f0;font-family:system-ui,sans-serif;padding:24px;}</style></head>
    <body>${html}</body></html>
  `;

  if (fullscreen) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.9)", display: "flex", flexDirection: "column",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 20px", background: "rgba(10,24,45,0.95)",
          borderBottom: "1px solid rgba(34,211,238,0.15)",
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.08em", color: "#22d3ee" }}>
            {title || "Live Preview"}
          </span>
          <button onClick={() => setFullscreen(false)}
            style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)",
              color: "#f87171", cursor: "pointer", fontSize: 12, fontWeight: 600,
              padding: "6px 14px", borderRadius: 8 }}>
            Exit Fullscreen
          </button>
        </div>
        <iframe
          srcDoc={fullHtml}
          sandbox="allow-scripts"
          style={{ flex: 1, width: "100%", border: "none", background: "#0a1628" }}
          title={title || "Agent preview"}
        />
      </div>
    );
  }

  return (
    <div style={{ margin: "12px 0", borderRadius: 14, overflow: "hidden",
      background: "linear-gradient(165deg, rgba(20,40,65,0.85), rgba(10,24,45,0.92))",
      border: "1px solid rgba(34,211,238,0.1)",
      boxShadow: "inset 0 1px 0 rgba(34,211,238,0.08), 0 4px 16px rgba(0,0,0,0.25)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase",
          letterSpacing: "0.08em", color: "#22d3ee" }}>
          {title || "Live Preview"}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setFullscreen(true)}
            style={{ background: "none", border: "none", color: "#64748b",
              cursor: "pointer", fontSize: 12 }}>
            Fullscreen
          </button>
          <button onClick={() => setExpanded(v => !v)}
            style={{ background: "none", border: "none", color: "#64748b",
              cursor: "pointer", fontSize: 12 }}>
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
      {expanded && (
        <iframe
          srcDoc={fullHtml}
          sandbox="allow-scripts"
          style={{ width: "100%", height, border: "none", background: "#0a1628" }}
          title={title || "Agent preview"}
        />
      )}
    </div>
  );
}

registerComponent("html-preview", HTMLPreview);
export default HTMLPreview;
