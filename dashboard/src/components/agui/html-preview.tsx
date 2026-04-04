"use client";

import { useState } from "react";
import { registerComponent } from "./registry";

interface HTMLPreviewProps {
  html: string;
  height?: number;
  title?: string;
}

function HTMLPreview({ html, height = 400, title }: HTMLPreviewProps) {
  const [expanded, setExpanded] = useState(true);

  // Wrap HTML in a complete document if it's a fragment
  const fullHtml = html.includes("<html") ? html : `
    <!DOCTYPE html>
    <html><head><style>body{margin:0;background:#000;overflow:hidden;display:flex;justify-content:center;align-items:center;height:100vh;}</style></head>
    <body>${html}</body></html>
  `;

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
        <button onClick={() => setExpanded(v => !v)}
          style={{ background: "none", border: "none", color: "#64748b",
            cursor: "pointer", fontSize: 12 }}>
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      {expanded && (
        <iframe
          srcDoc={fullHtml}
          sandbox="allow-scripts"
          style={{ width: "100%", height, border: "none", background: "#000" }}
          title={title || "Agent preview"}
        />
      )}
    </div>
  );
}

registerComponent("html-preview", HTMLPreview);
export default HTMLPreview;
