"use client";

import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { registerComponent } from "./registry";

interface CodeSandboxProps {
  language: string;
  code: string;
}

/** Reef-glass code theme — mirrors reef-markdown */
const reefCodeTheme: Record<string, React.CSSProperties> = {
  ...vscDarkPlus,
  'pre[class*="language-"]': {
    ...vscDarkPlus['pre[class*="language-"]'],
    background: "rgba(4, 14, 26, 0.8)",
    borderRadius: "12px",
    padding: "16px 20px",
    margin: "0",
    fontSize: "14px",
    lineHeight: "1.6",
    border: "none",
    boxShadow: "none",
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        padding: "4px 10px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 500,
        background: copied
          ? "rgba(34,197,94,0.15)"
          : "rgba(34,211,238,0.1)",
        border: `1px solid ${copied ? "rgba(34,197,94,0.3)" : "rgba(34,211,238,0.15)"}`,
        color: copied ? "#4ade80" : "#94a3b8",
        cursor: "pointer",
        transition: "all 0.2s",
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CodeSandbox({ language, code }: CodeSandboxProps) {
  return (
    <div
      style={{
        position: "relative",
        margin: "8px 0",
        borderRadius: 14,
        background: "rgba(4, 14, 26, 0.8)",
        border: "1px solid rgba(34, 211, 238, 0.1)",
        boxShadow:
          "inset 0 1px 0 rgba(34,211,238,0.06), 0 4px 12px rgba(0,0,0,0.3)",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 8,
          left: 16,
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "1px",
          color: "#22d3ee",
          opacity: 0.6,
          zIndex: 1,
        }}
      >
        {language}
      </span>
      <CopyButton text={code} />
      <SyntaxHighlighter
        style={reefCodeTheme}
        language={language}
        PreTag="div"
        customStyle={{ paddingTop: "32px" }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

registerComponent("code-sandbox", CodeSandbox);

export { CodeSandbox };
