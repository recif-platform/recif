"use client";

import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useState, useEffect, useRef, useId, type ComponentPropsWithoutRef } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

/** Ocean-dark code theme */
const reefCodeTheme: Record<string, React.CSSProperties> = {
  ...vscDarkPlus,
  'pre[class*="language-"]': {
    ...vscDarkPlus['pre[class*="language-"]'],
    background: "rgba(4, 14, 26, 0.8)",
    borderRadius: "12px",
    padding: "16px 20px",
    margin: "8px 0",
    fontSize: "14px",
    lineHeight: "1.6",
    border: "1px solid rgba(34, 211, 238, 0.1)",
    boxShadow: "inset 0 1px 0 rgba(34,211,238,0.06), 0 4px 12px rgba(0,0,0,0.3)",
    overflowX: "auto",
    maxWidth: "100%",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  'code[class*="language-"]': {
    ...vscDarkPlus['code[class*="language-"]'],
    background: "none",
    fontSize: "14px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
};

const REEF_COLORS = ["#06b6d4", "#ec4899", "#a855f7", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#14b8a6"];

const chartTooltipStyle = {
  contentStyle: {
    background: "rgba(10, 24, 45, 0.95)",
    border: "1px solid rgba(34, 211, 238, 0.15)",
    borderRadius: 10,
    fontSize: 13,
    color: "#e2e8f0",
    boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
  },
  cursor: { fill: "rgba(34, 211, 238, 0.06)" },
};

/* ═══ Mermaid Diagram ═══ */
function MermaidDiagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const uniqueId = useId().replace(/:/g, "");
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            primaryColor: "#0891b2",
            primaryTextColor: "#f1f5f9",
            primaryBorderColor: "#22d3ee",
            lineColor: "#22d3ee",
            secondaryColor: "#1e293b",
            tertiaryColor: "#0f172a",
            fontFamily: "Inter, sans-serif",
            fontSize: "14px",
          },
        });
        const { svg: rendered } = await mermaid.render(`mermaid-${uniqueId}`, code);
        if (!cancelled) setSvg(rendered);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [code, uniqueId]);

  if (error) {
    // Render as plain code block on parse error
    return (
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", top: 8, left: 16, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "#22d3ee", opacity: 0.6 }}>mermaid</span>
        <pre style={{
          background: "rgba(4, 14, 26, 0.8)", borderRadius: 12, padding: "32px 20px 16px",
          margin: "8px 0", fontSize: 14, lineHeight: 1.6, color: "#cbd5e1",
          border: "1px solid rgba(34, 211, 238, 0.1)",
          boxShadow: "inset 0 1px 0 rgba(34,211,238,0.06), 0 4px 12px rgba(0,0,0,0.3)",
          overflowX: "auto", whiteSpace: "pre-wrap",
        }}>{code}</pre>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={{
        margin: "12px 0",
        padding: "20px",
        borderRadius: 14,
        background: "linear-gradient(165deg, rgba(20,40,65,0.85), rgba(10,24,45,0.92))",
        border: "1px solid rgba(34,211,238,0.1)",
        boxShadow: "inset 0 1px 0 rgba(34,211,238,0.08), 0 4px 16px rgba(0,0,0,0.25)",
        overflow: "auto",
        textAlign: "center",
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/* ═══ Charts ═══ */
function ReefChart({ spec }: { spec: { type: string; title?: string; data: Record<string, unknown>[]; xKey?: string; yKey?: string; keys?: string[] } }) {
  const { type, title, data, xKey = "name", yKey = "value", keys } = spec;
  const dataKeys = keys || Object.keys(data[0] || {}).filter((k) => k !== xKey);

  const wrapper = (chart: React.ReactNode) => (
    <div style={{ margin: "12px 0", padding: "20px", borderRadius: 14, background: "linear-gradient(165deg, rgba(20,40,65,0.85), rgba(10,24,45,0.92))", border: "1px solid rgba(34,211,238,0.1)", boxShadow: "inset 0 1px 0 rgba(34,211,238,0.08), 0 4px 16px rgba(0,0,0,0.25)", minWidth: 350 }}>
      {title && <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", marginBottom: 16 }}>{title}</div>}
      <ResponsiveContainer width="100%" height={300}>{chart}</ResponsiveContainer>
    </div>
  );

  const axisStyle = { fontSize: 12, fill: "#64748b" };
  const grid = <CartesianGrid strokeDasharray="3 3" stroke="rgba(34,211,238,0.06)" />;

  if (type === "bar") return wrapper(<BarChart data={data}>{grid}<XAxis dataKey={xKey} tick={axisStyle} axisLine={{ stroke: "rgba(34,211,238,0.1)" }} /><YAxis tick={axisStyle} axisLine={{ stroke: "rgba(34,211,238,0.1)" }} /><Tooltip {...chartTooltipStyle} /><Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />{dataKeys.map((key, i) => <Bar key={key} dataKey={key} fill={REEF_COLORS[i % REEF_COLORS.length]} radius={[6, 6, 0, 0]} />)}</BarChart>);
  if (type === "line") return wrapper(<LineChart data={data}>{grid}<XAxis dataKey={xKey} tick={axisStyle} axisLine={{ stroke: "rgba(34,211,238,0.1)" }} /><YAxis tick={axisStyle} axisLine={{ stroke: "rgba(34,211,238,0.1)" }} /><Tooltip {...chartTooltipStyle} /><Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />{dataKeys.map((key, i) => <Line key={key} type="monotone" dataKey={key} stroke={REEF_COLORS[i % REEF_COLORS.length]} strokeWidth={2} dot={{ r: 4, fill: REEF_COLORS[i % REEF_COLORS.length] }} />)}</LineChart>);
  if (type === "area") return wrapper(<AreaChart data={data}>{grid}<XAxis dataKey={xKey} tick={axisStyle} axisLine={{ stroke: "rgba(34,211,238,0.1)" }} /><YAxis tick={axisStyle} axisLine={{ stroke: "rgba(34,211,238,0.1)" }} /><Tooltip {...chartTooltipStyle} /><Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />{dataKeys.map((key, i) => <Area key={key} type="monotone" dataKey={key} stroke={REEF_COLORS[i % REEF_COLORS.length]} fill={REEF_COLORS[i % REEF_COLORS.length]} fillOpacity={0.15} strokeWidth={2} />)}</AreaChart>);
  if (type === "pie") return wrapper(<PieChart><Tooltip {...chartTooltipStyle} /><Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} /><Pie data={data} dataKey={yKey} nameKey={xKey} cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={3} label={{ fontSize: 12, fill: "#94a3b8" }}>{data.map((_, i) => <Cell key={i} fill={REEF_COLORS[i % REEF_COLORS.length]} />)}</Pie></PieChart>);

  return <pre style={{ color: "#f87171", fontSize: 13 }}>Unknown chart type: {type}</pre>;
}

/* ═══ Code + Copy ═══ */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{
        position: "absolute", top: 8, right: 8,
        padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500,
        background: copied ? "rgba(34,197,94,0.15)" : "rgba(34,211,238,0.1)",
        border: `1px solid ${copied ? "rgba(34,197,94,0.3)" : "rgba(34,211,238,0.15)"}`,
        color: copied ? "#4ade80" : "#94a3b8", cursor: "pointer", transition: "all 0.2s",
      }}
    >{copied ? "Copied" : "Copy"}</button>
  );
}

function CodeBlock({ className, children, ...props }: ComponentPropsWithoutRef<"code">) {
  const match = /language-(\w+)/.exec(className || "");
  const code = String(children).replace(/\n$/, "");

  if (match) {
    // AG-UI component blocks — registry-based rendering
    const AGUI_ALIASES: Record<string, string> = {
      "chart": "chart",
      "three-scene": "three-scene",
      "three": "three-scene",
      "3d": "three-scene",
      "flow-diagram": "flow-diagram",
      "flow": "flow-diagram",
      "diagram": "flow-diagram",
      "stat-grid": "stat-grid",
      "stats": "stat-grid",
      "progress-bar": "progress-bar",
      "metric-card": "metric-card",
    };
    const resolvedComponent = AGUI_ALIASES[match[1]];
    if (resolvedComponent) {
      try {
        const spec = JSON.parse(code);
        if (resolvedComponent === "chart") return <ReefChart spec={spec} />;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { AgentComponent } = require("@/components/agui/registry");
        return <AgentComponent name={resolvedComponent} props={spec} />;
      } catch { /* invalid JSON — show as code block */ }
    }
    // HTML live preview — rendered in sandboxed iframe
    if (match[1] === "html") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const HTMLPreview = require("@/components/agui/html-preview").default;
      return <HTMLPreview html={code} height={400} title="Live Preview" />;
    }
    // Mermaid diagram — only for valid diagram types
    if (match[1] === "mermaid") {
      const validStarts = ["graph ", "graph\n", "flowchart ", "sequenceDiagram", "classDiagram", "stateDiagram", "erDiagram", "gantt", "pie ", "pie\n", "gitgraph", "journey", "mindmap"];
      const trimmed = code.trimStart();
      if (validStarts.some((s) => trimmed.startsWith(s))) {
        return <MermaidDiagram code={code} />;
      }
      // Invalid mermaid — show as code block instead
    }

    return (
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", top: 8, left: 16, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", color: "#22d3ee", opacity: 0.6 }}>
          {match[1]}
        </span>
        <CopyButton text={code} />
        <SyntaxHighlighter style={reefCodeTheme} language={match[1]} PreTag="div" customStyle={{ paddingTop: "32px" }}>
          {code}
        </SyntaxHighlighter>
      </div>
    );
  }

  // Inline code
  return (
    <code
      style={{
        background: "rgba(34, 211, 238, 0.08)", border: "1px solid rgba(34, 211, 238, 0.12)",
        borderRadius: 6, padding: "2px 7px", fontSize: "0.9em", color: "#67e8f9",
        fontFamily: "var(--font-mono), 'SF Mono', 'Fira Code', monospace",
        wordBreak: "break-all", overflowWrap: "break-word",
      }}
      {...props}
    >{children}</code>
  );
}

/* ═══ Table ═══ */
function ReefTable({ children, ...props }: ComponentPropsWithoutRef<"table">) {
  return (
    <div style={{
      overflowX: "auto", margin: "12px 0", borderRadius: 12,
      background: "rgba(4, 14, 26, 0.5)",
      border: "1px solid rgba(34, 211, 238, 0.08)",
      boxShadow: "inset 0 1px 0 rgba(34,211,238,0.06), 0 4px 12px rgba(0,0,0,0.2)",
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }} {...props}>{children}</table>
    </div>
  );
}

function ReefTh({ children, ...props }: ComponentPropsWithoutRef<"th">) {
  return (
    <th style={{
      textAlign: "left", padding: "12px 16px",
      borderBottom: "1px solid rgba(34, 211, 238, 0.12)",
      background: "rgba(34, 211, 238, 0.04)",
      color: "#22d3ee", fontWeight: 700, fontSize: "12px",
      textTransform: "uppercase", letterSpacing: "0.06em",
    }} {...props}>
      {children}
    </th>
  );
}

function ReefTd({ children, ...props }: ComponentPropsWithoutRef<"td">) {
  return (
    <td style={{
      padding: "10px 16px",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      color: "#e2e8f0", fontSize: "14px",
    }} {...props}>
      {children}
    </td>
  );
}

/* ═══ Blockquote ═══ */
function ReefBlockquote({ children, ...props }: ComponentPropsWithoutRef<"blockquote">) {
  return (
    <blockquote
      style={{
        margin: "8px 0", padding: "12px 16px",
        borderLeft: "3px solid #22d3ee",
        background: "rgba(34, 211, 238, 0.04)",
        borderRadius: "0 10px 10px 0",
        color: "#cbd5e1", fontStyle: "italic",
      }}
      {...props}
    >
      {children}
    </blockquote>
  );
}

/* ═══ Pre block — catch-all for code blocks without language ═══ */
function ReefPre({ children, ...props }: ComponentPropsWithoutRef<"pre">) {
  return (
    <pre
      style={{
        background: "rgba(4, 14, 26, 0.8)",
        borderRadius: 12,
        padding: "16px 20px",
        margin: "8px 0",
        fontSize: 14,
        lineHeight: 1.6,
        border: "1px solid rgba(34, 211, 238, 0.1)",
        boxShadow: "inset 0 1px 0 rgba(34,211,238,0.06), 0 4px 12px rgba(0,0,0,0.3)",
        overflowX: "auto",
        maxWidth: "100%",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
      {...props}
    >
      {children}
    </pre>
  );
}

/* ═══ Horizontal Rule ═══ */
function ReefHr() {
  return (
    <hr style={{
      border: "none", height: 1, margin: "16px 0",
      background: "linear-gradient(90deg, transparent, rgba(34,211,238,0.15), transparent)",
    }} />
  );
}

/* ═══ Main Export ═══ */
export function ReefMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-sm prose-invert max-w-none [&>p]:m-0 [&>ul]:mt-2 [&>ol]:mt-2 [&_strong]:text-cyan-300 [&_a]:text-cyan-400 [&_a:hover]:text-cyan-300 [&_li]:my-1">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock,
          pre: ReefPre,
          table: ReefTable,
          th: ReefTh,
          td: ReefTd,
          blockquote: ReefBlockquote,
          hr: ReefHr,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
