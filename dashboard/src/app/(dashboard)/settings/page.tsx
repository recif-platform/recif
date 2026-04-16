"use client";

import { useEffect, useState, useCallback } from "react";
import { useTheme } from "@/lib/theme";
import {
  fetchPlatformConfig,
  updatePlatformConfig,
  testPlatformConnections,
  syncFromStateRepo,
  fetchCurrentUser,
  type CurrentUser,
  type PlatformConfig,
  type ConnectionTestResult,
  type SyncResult,
} from "@/lib/api";

export default function SettingsPage() {
  const [platformCfg, setPlatformCfg] = useState<PlatformConfig>({ state_repo: "", state_branch: "", state_token: "", mlflow_uri: "" });
  const [platformDraft, setPlatformDraft] = useState<PlatformConfig>({ state_repo: "", state_branch: "", state_token: "", mlflow_uri: "" });
  const [platformSaving, setPlatformSaving] = useState(false);
  const [platformTest, setPlatformTest] = useState<ConnectionTestResult | null>(null);
  const [platformError, setPlatformError] = useState("");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const { colors } = useTheme();

  const loadPlatformConfig = useCallback(async () => {
    try {
      const data = await fetchPlatformConfig();
      setPlatformCfg(data);
      setPlatformDraft(data);
    } catch {}
  }, []);

  useEffect(() => {
    loadPlatformConfig();
    fetchCurrentUser().then(setCurrentUser).catch(() => {});
  }, [loadPlatformConfig]);

  return (
    <div className="max-w-3xl space-y-8">
      <h2 style={{ color: colors.textPrimary }}>Settings</h2>

      {/* Current User */}
      {currentUser && (
        <section className="reef-glass" style={{ padding: "24px" }}>
          <h3 style={{ color: colors.textPrimary, fontWeight: 700, marginBottom: "16px" }}>Current User</h3>
          <div className="space-y-2 text-sm">
            <p>
              <span style={{ color: colors.textMuted }}>Name:</span>{" "}
              <span style={{ color: colors.textSecondary, fontWeight: 500 }}>{currentUser.name}</span>
            </p>
            <p>
              <span style={{ color: colors.textMuted }}>Email:</span>{" "}
              <span style={{ color: colors.textSecondary, fontWeight: 500 }}>{currentUser.email}</span>
            </p>
            <p>
              <span style={{ color: colors.textMuted }}>Role:</span>{" "}
              <span style={{
                display: "inline-block", padding: "2px 10px", borderRadius: "999px",
                background: "rgba(34,211,238,0.15)", color: "#22d3ee",
                fontSize: "12px", fontWeight: 600, textTransform: "capitalize",
              }}>
                {currentUser.role.replace("_", " ")}
              </span>
            </p>
          </div>
        </section>
      )}

      {/* Platform Configuration */}
      <section className="reef-glass" style={{ padding: "24px" }}>
        <h3 style={{ color: colors.textPrimary, fontWeight: 700, marginBottom: "16px" }}>Platform Configuration</h3>
        <div className="space-y-4">
          {([
            { key: "state_repo" as const, label: "State Repository", placeholder: "owner/repo", group: "github" },
            { key: "state_branch" as const, label: "State Branch", placeholder: "main", group: "github" },
            { key: "state_token" as const, label: "GitHub Token", placeholder: "ghp_xxx...", type: "password", group: "github" },
            { key: "mlflow_uri" as const, label: "MLflow URI", placeholder: "http://mlflow:5000", group: "mlflow" },
          ]).map(({ key, label, placeholder, type, group }) => (
            <div key={key}>
              <div className="flex items-center gap-2" style={{ marginBottom: "4px" }}>
                <label className="text-xs" style={{ color: colors.textMuted, fontWeight: 500 }}>{label}</label>
                {platformTest && (
                  (group === "github" && key === "state_repo") ? (
                    <span className="text-xs" style={{
                      color: platformTest.github.status === "connected" ? "#22c55e" : platformTest.github.status === "unconfigured" ? colors.textMuted : "#ef4444",
                      fontWeight: 500,
                    }}>
                      {platformTest.github.status === "connected" ? "Connected" : platformTest.github.status === "unconfigured" ? "Not configured" : "Error"}
                    </span>
                  ) : (group === "mlflow" && key === "mlflow_uri") ? (
                    <span className="text-xs" style={{
                      color: platformTest.mlflow.status === "connected" ? "#22c55e" : platformTest.mlflow.status === "unconfigured" ? colors.textMuted : "#ef4444",
                      fontWeight: 500,
                    }}>
                      {platformTest.mlflow.status === "connected" ? "Connected" : platformTest.mlflow.status === "unconfigured" ? "Not configured" : "Error"}
                    </span>
                  ) : null
                )}
              </div>
              <input
                type={type || "text"}
                value={platformDraft[key]}
                onChange={(e) => { setPlatformDraft((prev) => ({ ...prev, [key]: e.target.value })); setPlatformTest(null); setPlatformError(""); }}
                placeholder={placeholder}
                className="w-full rounded-xl text-sm outline-none"
                style={{
                  padding: "10px 14px", background: colors.inputBg,
                  border: `1px solid ${colors.inputBorder}`, color: colors.textPrimary, fontFamily: "monospace",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = colors.cardHoverBorder; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = colors.inputBorder; }}
              />
              {platformTest && group === "github" && key === "state_repo" && platformTest.github.status === "error" && (
                <p className="text-xs" style={{ color: "#ef4444", marginTop: "4px" }}>{platformTest.github.message}</p>
              )}
              {platformTest && group === "mlflow" && key === "mlflow_uri" && platformTest.mlflow.status === "error" && (
                <p className="text-xs" style={{ color: "#ef4444", marginTop: "4px" }}>{platformTest.mlflow.message}</p>
              )}
            </div>
          ))}

          <div className="flex items-center gap-3" style={{ marginTop: "8px" }}>
            <button
              onClick={async () => {
                setPlatformSaving(true); setPlatformTest(null); setPlatformError(""); setSyncResult(null);
                try {
                  const updated = await updatePlatformConfig(platformDraft);
                  setPlatformCfg(updated); setPlatformDraft(updated);
                  const test = await testPlatformConnections();
                  setPlatformTest(test);
                  if (test.github.status === "connected") {
                    setSyncResult(await syncFromStateRepo());
                  }
                } catch (err) {
                  setPlatformError("Failed to save configuration");
                  console.error(err);
                } finally { setPlatformSaving(false); }
              }}
              disabled={platformSaving}
              className="btn-reef-primary"
              style={{ padding: "10px 20px", fontSize: "13px", opacity: platformSaving ? 0.6 : 1 }}
            >
              {platformSaving ? "Saving & Syncing..." : "Save & Sync"}
            </button>
            {platformError && <span className="text-xs" style={{ color: "#ef4444", fontWeight: 500 }}>{platformError}</span>}
          </div>

          {syncResult && (
            <div className="rounded-xl" style={{ marginTop: "12px", padding: "14px 18px", background: colors.badgeBg, border: `1px solid ${colors.accentBorder}` }}>
              <p className="text-sm" style={{ color: colors.textPrimary, fontWeight: 600, marginBottom: "8px" }}>
                Sync complete — {syncResult.synced} agent{syncResult.synced !== 1 ? "s" : ""} synced
              </p>
              {syncResult.results?.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span style={{
                    color: r.action === "created" ? "#22c55e" : r.action === "updated" ? "#22d3ee" : r.action === "error" ? "#ef4444" : colors.textMuted,
                    fontWeight: 600, textTransform: "uppercase", fontSize: "10px", minWidth: "60px",
                  }}>{r.action}</span>
                  <span className="font-mono" style={{ color: colors.textSecondary }}>{r.agent}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* API Keys */}
      <section className="reef-glass" style={{ padding: "24px" }}>
        <h3 style={{ color: colors.textPrimary, fontWeight: 700, marginBottom: "16px" }}>API Keys</h3>
        <p className="text-sm mb-4" style={{ color: colors.textMuted }}>Create API keys for external integrations.</p>
        <button className="btn-reef-primary" style={{ padding: "10px 20px", fontSize: "13px" }}>Generate API Key</button>
      </section>
    </div>
  );
}
