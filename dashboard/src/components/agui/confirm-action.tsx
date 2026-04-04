"use client";

import { useState } from "react";
import { registerComponent } from "./registry";

interface ConfirmActionProps {
  id: string;
  tool: string;
  args: Record<string, any>;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmAction({
  id,
  tool,
  args,
  message,
  onConfirm,
  onCancel,
}: ConfirmActionProps) {
  const [decided, setDecided] = useState<"confirmed" | "cancelled" | null>(
    null,
  );

  const handleConfirm = () => {
    setDecided("confirmed");
    onConfirm();
  };

  const handleCancel = () => {
    setDecided("cancelled");
    onCancel();
  };

  const argEntries = Object.entries(args);

  return (
    <div
      style={{
        margin: "8px 0",
        padding: "20px",
        borderRadius: 14,
        background:
          "linear-gradient(165deg, rgba(20, 40, 65, 0.85), rgba(10, 24, 45, 0.92))",
        border: "1px solid rgba(245, 158, 11, 0.3)",
        boxShadow:
          "inset 0 1px 0 rgba(245,158,11,0.08), 0 4px 16px rgba(0,0,0,0.25), 0 0 24px rgba(245,158,11,0.04)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            borderRadius: 8,
            background: "rgba(245, 158, 11, 0.12)",
            color: "#f59e0b",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          !
        </span>
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "#f59e0b",
          }}
        >
          Confirmation Required
        </span>
      </div>

      {/* Message */}
      <p
        style={{
          color: "#e2e8f0",
          fontSize: 14,
          lineHeight: 1.6,
          margin: "0 0 12px 0",
        }}
      >
        {message}
      </p>

      {/* Tool + Args */}
      <div
        style={{
          padding: "12px 14px",
          borderRadius: 10,
          background: "rgba(4, 14, 26, 0.6)",
          border: "1px solid rgba(255,255,255,0.06)",
          marginBottom: 16,
          fontSize: 13,
          fontFamily: "var(--font-mono), monospace",
        }}
      >
        <div style={{ marginBottom: argEntries.length > 0 ? 6 : 0 }}>
          <span style={{ color: "#64748b" }}>tool: </span>
          <span style={{ color: "#22d3ee", fontWeight: 600 }}>{tool}</span>
        </div>
        {argEntries.map(([key, val]) => (
          <div key={key}>
            <span style={{ color: "#64748b" }}>{key}: </span>
            <span style={{ color: "#e2e8f0" }}>
              {typeof val === "string" ? val : JSON.stringify(val)}
            </span>
          </div>
        ))}
      </div>

      {/* Actions */}
      {decided ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 600,
            color: decided === "confirmed" ? "#4ade80" : "#f87171",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: decided === "confirmed" ? "#4ade80" : "#f87171",
              boxShadow: `0 0 8px ${decided === "confirmed" ? "rgba(74,222,128,0.4)" : "rgba(248,113,113,0.4)"}`,
            }}
          />
          {decided === "confirmed" ? "Confirmed" : "Cancelled"}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn-reef-primary" onClick={handleConfirm}>
            Confirm
          </button>
          <button className="btn-reef" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

registerComponent("confirm-action", ConfirmAction);

export { ConfirmAction };
