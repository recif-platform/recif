"use client";

import { useState, useMemo } from "react";
import { registerComponent } from "./registry";

interface DataTableProps {
  columns: string[];
  rows: Record<string, any>[];
}

type SortDir = "asc" | "desc" | null;

function DataTable({ columns, rows }: DataTableProps) {
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((prev) =>
        prev === "asc" ? "desc" : prev === "desc" ? null : "asc",
      );
      if (sortDir === "desc") setSortCol(null);
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortCol || !sortDir) return rows;
    return [...rows].sort((a, b) => {
      const aVal = a[sortCol];
      const bVal = b[sortCol];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp =
        typeof aVal === "number" && typeof bVal === "number"
          ? aVal - bVal
          : String(aVal).localeCompare(String(bVal));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortCol, sortDir]);

  const sortIndicator = (col: string) => {
    if (sortCol !== col) return null;
    return (
      <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>
        {sortDir === "asc" ? "\u25B2" : "\u25BC"}
      </span>
    );
  };

  return (
    <div
      style={{
        overflowX: "auto",
        margin: "8px 0",
        borderRadius: 14,
        background: "linear-gradient(165deg, rgba(20, 40, 65, 0.85), rgba(10, 24, 45, 0.92))",
        border: "1px solid rgba(34, 211, 238, 0.1)",
        boxShadow:
          "inset 0 1px 0 rgba(34,211,238,0.08), 0 4px 16px rgba(0,0,0,0.25)",
      }}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 14,
        }}
      >
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                onClick={() => handleSort(col)}
                style={{
                  textAlign: "left",
                  padding: "12px 16px",
                  borderBottom: "1px solid rgba(34, 211, 238, 0.12)",
                  background: "rgba(34, 211, 238, 0.04)",
                  color: "#22d3ee",
                  fontWeight: 700,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  cursor: "pointer",
                  userSelect: "none",
                  transition: "background 0.15s",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(34, 211, 238, 0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(34, 211, 238, 0.04)";
                }}
              >
                {col}
                {sortIndicator(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, ri) => (
            <tr
              key={ri}
              onMouseEnter={() => setHoveredRow(ri)}
              onMouseLeave={() => setHoveredRow(null)}
              style={{
                background:
                  hoveredRow === ri
                    ? "rgba(34, 211, 238, 0.04)"
                    : "transparent",
                transition: "background 0.15s",
              }}
            >
              {columns.map((col) => (
                <td
                  key={col}
                  style={{
                    padding: "10px 16px",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    color: "#e2e8f0",
                    fontSize: 14,
                  }}
                >
                  {row[col] != null ? String(row[col]) : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {sortedRows.length === 0 && (
        <div
          style={{
            padding: "20px",
            textAlign: "center",
            color: "#475569",
            fontSize: 13,
          }}
        >
          No data
        </div>
      )}
    </div>
  );
}

registerComponent("data-table", DataTable);

export { DataTable };
