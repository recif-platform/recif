"use client";

import { useEffect, useState, useCallback } from "react";
import { useTheme } from "@/lib/theme";
import {
  fetchTeams,
  createTeam,
  getTeam,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
  updateMemberRole,
  fetchPlatformConfig,
  updatePlatformConfig,
  testPlatformConnections,
  syncFromStateRepo,
  type Team,
  type TeamMember,
  type PlatformConfig,
  type ConnectionTestResult,
  type SyncResult,
} from "@/lib/api";

/* ------------------------------------------------------------------ */
/*  Role badge colors                                                  */
/* ------------------------------------------------------------------ */
const roleBadgeColors: Record<string, { bg: string; text: string }> = {
  platform_admin: { bg: "rgba(244,114,182,0.15)", text: "#f472b6" },
  admin:          { bg: "rgba(34,211,238,0.15)",  text: "#22d3ee" },
  developer:      { bg: "rgba(34,197,94,0.15)",   text: "#22c55e" },
  viewer:         { bg: "rgba(148,163,184,0.15)", text: "#94a3b8" },
};

function RoleBadge({ role }: { role: string }) {
  const badge = roleBadgeColors[role] || roleBadgeColors.viewer;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "999px",
        background: badge.bg,
        color: badge.text,
        fontSize: "12px",
        fontWeight: 600,
        textTransform: "capitalize",
      }}
    >
      {role.replace("_", " ")}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Team detail panel (members table, add member, role management)     */
/* ------------------------------------------------------------------ */
function TeamDetail({
  teamId,
  colors,
  onMemberChange,
}: {
  teamId: string;
  colors: ReturnType<typeof useTheme>["colors"];
  onMemberChange: () => void;
}) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("developer");

  const loadMembers = useCallback(async () => {
    try {
      const data = await getTeam(teamId);
      setMembers(data.members || []);
    } catch {
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleAdd = async () => {
    const email = newEmail.trim();
    if (!email) return;
    try {
      await addTeamMember(teamId, email, newRole);
      setNewEmail("");
      setNewRole("developer");
      await loadMembers();
      onMemberChange();
    } catch (err) {
      console.error("Failed to add member", err);
    }
  };

  const handleRemove = async (userId: string) => {
    try {
      await removeTeamMember(teamId, userId);
      await loadMembers();
      onMemberChange();
    } catch (err) {
      console.error("Failed to remove member", err);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await updateMemberRole(teamId, userId, role);
      await loadMembers();
    } catch (err) {
      console.error("Failed to update role", err);
    }
  };

  if (loading) {
    return <div className="h-12 rounded-xl animate-pulse" style={{ background: colors.accentBg }} />;
  }

  return (
    <div style={{ marginTop: "12px" }}>
      {/* Members table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${colors.divider}` }}>
              <th style={{ textAlign: "left", padding: "8px 12px", color: colors.textMuted, fontWeight: 500 }}>Email</th>
              <th style={{ textAlign: "left", padding: "8px 12px", color: colors.textMuted, fontWeight: 500 }}>Role</th>
              <th style={{ textAlign: "left", padding: "8px 12px", color: colors.textMuted, fontWeight: 500 }}>Joined</th>
              <th style={{ textAlign: "right", padding: "8px 12px", color: colors.textMuted, fontWeight: 500 }}></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.user_id} style={{ borderBottom: `1px solid ${colors.divider}` }}>
                <td style={{ padding: "8px 12px", color: colors.textSecondary }}>{m.email}</td>
                <td style={{ padding: "8px 12px" }}>
                  {m.role === "platform_admin" ? (
                    <RoleBadge role={m.role} />
                  ) : (
                    <select
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.user_id, e.target.value)}
                      style={{
                        background: colors.inputBg,
                        border: `1px solid ${colors.inputBorder}`,
                        borderRadius: "8px",
                        padding: "4px 8px",
                        color: colors.textPrimary,
                        fontSize: "12px",
                        cursor: "pointer",
                      }}
                    >
                      <option value="admin">Admin</option>
                      <option value="developer">Developer</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  )}
                </td>
                <td style={{ padding: "8px 12px", color: colors.textMuted, fontSize: "12px" }}>
                  {new Date(m.joined_at).toLocaleDateString()}
                </td>
                <td style={{ padding: "8px 12px", textAlign: "right" }}>
                  {m.role !== "platform_admin" && (
                    <button
                      onClick={() => handleRemove(m.user_id)}
                      style={{
                        background: "rgba(239,68,68,0.1)",
                        color: "#ef4444",
                        border: "none",
                        borderRadius: "6px",
                        padding: "4px 10px",
                        fontSize: "12px",
                        cursor: "pointer",
                        fontWeight: 500,
                      }}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: "16px 12px", color: colors.textMuted, textAlign: "center" }}>
                  No members yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add member form */}
      <div className="flex gap-2" style={{ marginTop: "12px" }}>
        <input
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="user@example.com"
          className="flex-1 rounded-xl text-sm outline-none"
          style={{
            padding: "8px 14px",
            background: colors.inputBg,
            border: `1px solid ${colors.inputBorder}`,
            color: colors.textPrimary,
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = colors.cardHoverBorder; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = colors.inputBorder; }}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
        />
        <select
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          style={{
            background: colors.inputBg,
            border: `1px solid ${colors.inputBorder}`,
            borderRadius: "12px",
            padding: "8px 12px",
            color: colors.textPrimary,
            fontSize: "13px",
          }}
        >
          <option value="admin">Admin</option>
          <option value="developer">Developer</option>
          <option value="viewer">Viewer</option>
        </select>
        <button
          onClick={handleAdd}
          className="btn-reef-primary"
          style={{ padding: "8px 16px", fontSize: "13px", whiteSpace: "nowrap" }}
        >
          Add Member
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Settings page                                                 */
/* ------------------------------------------------------------------ */
export default function SettingsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [loading, setLoading] = useState(true);
  const [platformCfg, setPlatformCfg] = useState<PlatformConfig>({ state_repo: "", state_branch: "", state_token: "", mlflow_uri: "" });
  const [platformDraft, setPlatformDraft] = useState<PlatformConfig>({ state_repo: "", state_branch: "", state_token: "", mlflow_uri: "" });
  const [platformSaving, setPlatformSaving] = useState(false);
  const [platformTest, setPlatformTest] = useState<ConnectionTestResult | null>(null);
  const [platformError, setPlatformError] = useState("");
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const { colors } = useTheme();

  const loadTeams = useCallback(async () => {
    try {
      const data = await fetchTeams();
      setTeams(data);
    } catch {
      setTeams([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPlatformConfig = useCallback(async () => {
    try {
      const data = await fetchPlatformConfig();
      setPlatformCfg(data);
      setPlatformDraft(data);
    } catch {
      // keep defaults
    }
  }, []);

  useEffect(() => {
    loadTeams();
    loadPlatformConfig();
  }, [loadTeams, loadPlatformConfig]);

  const handleCreateTeam = async () => {
    const name = newTeamName.trim();
    if (!name) return;
    try {
      await createTeam(name, newTeamDesc.trim());
      setNewTeamName("");
      setNewTeamDesc("");
      await loadTeams();
    } catch (err) {
      console.error("Failed to create team", err);
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    try {
      await deleteTeam(teamId);
      if (expandedTeam === teamId) setExpandedTeam(null);
      await loadTeams();
    } catch (err) {
      console.error("Failed to delete team", err);
    }
  };

  return (
    <div className="max-w-3xl space-y-8">
      <h2 style={{ color: colors.textPrimary }}>Settings</h2>

      {/* Current User */}
      <section className="reef-glass" style={{ padding: "24px" }}>
        <h3 style={{ color: colors.textPrimary, fontWeight: 700, marginBottom: "16px" }}>Current User</h3>
        <div className="space-y-2 text-sm">
          <p>
            <span style={{ color: colors.textMuted, fontWeight: 400 }}>Logged in as:</span>{" "}
            <span style={{ color: colors.textSecondary, fontWeight: 500 }}>adham@recif.dev</span>
          </p>
          <p>
            <span style={{ color: colors.textMuted, fontWeight: 400 }}>Team:</span>{" "}
            <span style={{ color: colors.textSecondary, fontWeight: 500 }}>Default</span>
          </p>
          <p>
            <span style={{ color: colors.textMuted, fontWeight: 400 }}>Role:</span>{" "}
            <RoleBadge role="platform_admin" />
          </p>
        </div>
      </section>

      {/* Organization */}
      <section className="reef-glass" style={{ padding: "24px" }}>
        <h3 style={{ color: colors.textPrimary, fontWeight: 700, marginBottom: "16px" }}>Organization</h3>
        <div className="space-y-2 text-sm">
          <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Name:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>Récif Platform</span></p>
          <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Plan:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>Open Source</span></p>
          <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Admin:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>adham@recif.dev</span></p>
        </div>
      </section>

      {/* Teams & Access */}
      <section className="reef-glass" style={{ padding: "24px" }}>
        <h3 style={{ color: colors.textPrimary, fontWeight: 700, marginBottom: "16px" }}>Teams & Access</h3>
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: colors.accentBg }} />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {teams.map((team) => (
              <div key={team.id}>
                {/* Team card */}
                <div
                  className="rounded-xl"
                  style={{
                    padding: "14px 18px",
                    background: colors.badgeBg,
                    border: `1px solid ${expandedTeam === team.id ? colors.cardHoverBorder : colors.accentBorder}`,
                    transition: "border-color 0.2s",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setExpandedTeam(expandedTeam === team.id ? null : team.id)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        flex: 1,
                        padding: 0,
                      }}
                    >
                      <p className="text-sm" style={{ color: colors.textPrimary, fontWeight: 600 }}>{team.name}</p>
                      <div className="flex gap-4" style={{ marginTop: "4px" }}>
                        <span className="text-xs font-mono" style={{ color: colors.textMuted }}>
                          {team.namespace}
                        </span>
                        <span className="text-xs" style={{ color: colors.textMuted }}>
                          {team.member_count} member{team.member_count !== 1 ? "s" : ""}
                        </span>
                        <span className="text-xs" style={{ color: colors.textMuted }}>
                          {team.agent_count} agent{team.agent_count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {team.description && (
                        <p className="text-xs" style={{ color: colors.textMuted, marginTop: "4px" }}>
                          {team.description}
                        </p>
                      )}
                    </button>
                    <div className="flex items-center gap-2">
                      <span
                        style={{
                          fontSize: "11px",
                          color: colors.textMuted,
                          transform: expandedTeam === team.id ? "rotate(180deg)" : "rotate(0deg)",
                          transition: "transform 0.2s",
                          display: "inline-block",
                        }}
                      >
                        &#9660;
                      </span>
                      {team.id !== "tk_DEFAULT000000000000000000" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteTeam(team.id); }}
                          style={{
                            background: "rgba(239,68,68,0.1)",
                            color: "#ef4444",
                            border: "none",
                            borderRadius: "6px",
                            padding: "4px 10px",
                            fontSize: "11px",
                            cursor: "pointer",
                            fontWeight: 500,
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded: members panel */}
                  {expandedTeam === team.id && (
                    <TeamDetail
                      teamId={team.id}
                      colors={colors}
                      onMemberChange={loadTeams}
                    />
                  )}
                </div>
              </div>
            ))}

            {/* Create Team form */}
            <div
              className="rounded-xl"
              style={{
                padding: "14px 18px",
                background: colors.badgeBg,
                border: `1px solid ${colors.accentBorder}`,
                marginTop: "16px",
              }}
            >
              <p className="text-xs" style={{ color: colors.textMuted, fontWeight: 500, marginBottom: "8px" }}>
                Create New Team (platform admin)
              </p>
              <div className="flex gap-2">
                <input
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="Team name"
                  className="flex-1 rounded-xl text-sm outline-none"
                  style={{
                    padding: "10px 16px",
                    background: colors.inputBg,
                    border: `1px solid ${colors.inputBorder}`,
                    color: colors.textPrimary,
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = colors.cardHoverBorder; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = colors.inputBorder; }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateTeam(); }}
                />
                <input
                  value={newTeamDesc}
                  onChange={(e) => setNewTeamDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="flex-1 rounded-xl text-sm outline-none"
                  style={{
                    padding: "10px 16px",
                    background: colors.inputBg,
                    border: `1px solid ${colors.inputBorder}`,
                    color: colors.textPrimary,
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = colors.cardHoverBorder; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = colors.inputBorder; }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateTeam(); }}
                />
                <button
                  onClick={handleCreateTeam}
                  className="btn-reef-primary"
                  style={{ padding: "10px 20px", fontSize: "13px", whiteSpace: "nowrap" }}
                >
                  Create Team
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Platform Configuration (Git State + MLflow) */}
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
                <label className="text-xs" style={{ color: colors.textMuted, fontWeight: 500 }}>
                  {label}
                </label>
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
                  padding: "10px 14px",
                  background: colors.inputBg,
                  border: `1px solid ${colors.inputBorder}`,
                  color: colors.textPrimary,
                  fontFamily: "monospace",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = colors.cardHoverBorder; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = colors.inputBorder; }}
              />
              {/* Show error detail below the relevant field */}
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
                setPlatformSaving(true);
                setPlatformTest(null);
                setPlatformError("");
                setSyncResult(null);
                try {
                  const updated = await updatePlatformConfig(platformDraft);
                  setPlatformCfg(updated);
                  setPlatformDraft(updated);
                  // Test connections
                  const test = await testPlatformConnections();
                  setPlatformTest(test);
                  // Auto-sync agents if GitHub is connected
                  if (test.github.status === "connected") {
                    const sync = await syncFromStateRepo();
                    setSyncResult(sync);
                  }
                } catch (err) {
                  setPlatformError("Failed to save configuration");
                  console.error("Failed to save platform config", err);
                } finally {
                  setPlatformSaving(false);
                }
              }}
              disabled={platformSaving}
              className="btn-reef-primary"
              style={{ padding: "10px 20px", fontSize: "13px", opacity: platformSaving ? 0.6 : 1 }}
            >
              {platformSaving ? "Saving & Syncing..." : "Save & Sync"}
            </button>
            {platformTest && platformTest.github.status === "connected" && platformTest.mlflow.status === "connected" && !syncResult && (
              <span className="text-xs" style={{ color: "#22c55e", fontWeight: 500 }}>All connections verified</span>
            )}
            {platformError && (
              <span className="text-xs" style={{ color: "#ef4444", fontWeight: 500 }}>{platformError}</span>
            )}
          </div>

          {/* Sync results */}
          {syncResult && (
            <div
              className="rounded-xl"
              style={{
                marginTop: "12px",
                padding: "14px 18px",
                background: colors.badgeBg,
                border: `1px solid ${colors.accentBorder}`,
              }}
            >
              <p className="text-sm" style={{ color: colors.textPrimary, fontWeight: 600, marginBottom: "8px" }}>
                Sync complete — {syncResult.synced} agent{syncResult.synced !== 1 ? "s" : ""} synced
              </p>
              {syncResult.message && (
                <p className="text-xs" style={{ color: colors.textMuted }}>{syncResult.message}</p>
              )}
              {syncResult.results && syncResult.results.length > 0 && (
                <div className="space-y-1" style={{ marginTop: "8px" }}>
                  {syncResult.results.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span style={{
                        color: r.action === "created" ? "#22c55e" : r.action === "updated" ? "#22d3ee" : r.action === "error" ? "#ef4444" : colors.textMuted,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        fontSize: "10px",
                        minWidth: "60px",
                      }}>
                        {r.action}
                      </span>
                      <span className="font-mono" style={{ color: colors.textSecondary }}>{r.agent}</span>
                      {r.message && <span style={{ color: colors.textMuted }}>{r.message}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* API Keys */}
      <section className="reef-glass" style={{ padding: "24px" }}>
        <h3 style={{ color: colors.textPrimary, fontWeight: 700, marginBottom: "16px" }}>API Keys</h3>
        <p className="text-sm mb-4" style={{ color: colors.textMuted, fontWeight: 400 }}>Create API keys for external integrations.</p>
        <button className="btn-reef-primary" style={{ padding: "10px 20px", fontSize: "13px" }}>
          Generate API Key
        </button>
      </section>

      {/* Platform Info */}
      <section className="reef-glass" style={{ padding: "24px" }}>
        <h3 style={{ color: colors.textPrimary, fontWeight: 700, marginBottom: "16px" }}>Platform</h3>
        <div className="space-y-2 text-sm">
          <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Récif API:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>http://localhost:8080</span></p>
          <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Corail API:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>http://localhost:8000</span></p>
          <p><span style={{ color: colors.textMuted, fontWeight: 400 }}>Auth:</span>{" "}<span style={{ color: colors.textSecondary, fontWeight: 500 }}>Disabled (dev mode)</span></p>
        </div>
      </section>
    </div>
  );
}
