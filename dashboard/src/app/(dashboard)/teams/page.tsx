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
  fetchUsers,
  createUser,
  type Team,
  type TeamMember,
  type CurrentUser,
} from "@/lib/api";
import { useCurrentUser } from "@/lib/current-user";

const roleBadgeColors: Record<string, { bg: string; text: string }> = {
  platform_admin: { bg: "rgba(244,114,182,0.15)", text: "#f472b6" },
  admin:          { bg: "rgba(34,211,238,0.15)",  text: "#22d3ee" },
  developer:      { bg: "rgba(34,197,94,0.15)",   text: "#22c55e" },
  viewer:         { bg: "rgba(148,163,184,0.15)", text: "#94a3b8" },
};

function RoleBadge({ role }: { role: string }) {
  const badge = roleBadgeColors[role] || roleBadgeColors.viewer;
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: "999px",
      background: badge.bg, color: badge.text, fontSize: "12px", fontWeight: 600,
      textTransform: "capitalize",
    }}>
      {role.replace("_", " ")}
    </span>
  );
}

function TeamMembersPanel({
  teamId, colors, onMemberChange, allUsers,
}: {
  teamId: string;
  colors: ReturnType<typeof useTheme>["colors"];
  onMemberChange: () => void;
  allUsers: CurrentUser[];
}) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [newRole, setNewRole] = useState("developer");
  const [error, setError] = useState("");

  const loadMembers = useCallback(async () => {
    try {
      const data = await getTeam(teamId);
      setMembers(data.members || []);
    } catch { setMembers([]); }
    finally { setLoading(false); }
  }, [teamId]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const handleAdd = async () => {
    if (!selectedUserId) return;
    const user = allUsers.find((u) => u.id === selectedUserId);
    if (!user) return;
    setError("");
    try {
      await addTeamMember(teamId, user.email, newRole);
      setSelectedUserId("");
      setNewRole("developer");
      await loadMembers();
      onMemberChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    }
  };

  // Users not already in this team
  const availableUsers = allUsers.filter(
    (u) => !members.some((m) => m.user_id === u.id)
  );

  const handleRemove = async (userId: string) => {
    try {
      await removeTeamMember(teamId, userId);
      await loadMembers();
      onMemberChange();
    } catch {}
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      await updateMemberRole(teamId, userId, role);
      await loadMembers();
    } catch {}
  };

  if (loading) return <div className="h-12 rounded-xl animate-pulse" style={{ background: colors.accentBg }} />;

  return (
    <div style={{ marginTop: "16px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${colors.divider}` }}>
            <th style={{ textAlign: "left", padding: "8px 12px", color: colors.textMuted, fontWeight: 500 }}>Email</th>
            <th style={{ textAlign: "left", padding: "8px 12px", color: colors.textMuted, fontWeight: 500 }}>Role</th>
            <th style={{ textAlign: "left", padding: "8px 12px", color: colors.textMuted, fontWeight: 500 }}>Joined</th>
            <th style={{ textAlign: "right", padding: "8px 12px" }}></th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.user_id} style={{ borderBottom: `1px solid ${colors.divider}` }}>
              <td style={{ padding: "8px 12px", color: colors.textSecondary }}>{m.email}</td>
              <td style={{ padding: "8px 12px" }}>
                <select
                  value={m.role}
                  onChange={(e) => handleRoleChange(m.user_id, e.target.value)}
                  style={{
                    background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
                    borderRadius: "8px", padding: "4px 8px", color: colors.textPrimary,
                    fontSize: "12px", cursor: "pointer",
                  }}
                >
                  <option value="admin">Admin</option>
                  <option value="developer">Developer</option>
                  <option value="viewer">Viewer</option>
                </select>
              </td>
              <td style={{ padding: "8px 12px", color: colors.textMuted, fontSize: "12px" }}>
                {new Date(m.joined_at).toLocaleDateString()}
              </td>
              <td style={{ padding: "8px 12px", textAlign: "right" }}>
                <button
                  onClick={() => handleRemove(m.user_id)}
                  style={{
                    background: "rgba(239,68,68,0.1)", color: "#ef4444",
                    border: "none", borderRadius: "6px", padding: "4px 10px",
                    fontSize: "12px", cursor: "pointer", fontWeight: 500,
                  }}
                >
                  Remove
                </button>
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

      {error && (
        <div style={{ marginTop: "8px", padding: "8px 12px", borderRadius: "8px", background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: "13px" }}>
          {error}
        </div>
      )}

      <div className="flex gap-2" style={{ marginTop: "12px" }}>
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          className="flex-1 rounded-xl text-sm outline-none"
          style={{ padding: "8px 14px", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.textPrimary }}
        >
          <option value="">Select a user...</option>
          {availableUsers.map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
          ))}
        </select>
        <select
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          style={{
            background: colors.inputBg, border: `1px solid ${colors.inputBorder}`,
            borderRadius: "12px", padding: "8px 12px", color: colors.textPrimary, fontSize: "13px",
          }}
        >
          <option value="admin">Admin</option>
          <option value="developer">Developer</option>
          <option value="viewer">Viewer</option>
        </select>
        <button onClick={handleAdd} disabled={!selectedUserId} className="btn-reef-primary" style={{ padding: "8px 16px", fontSize: "13px", whiteSpace: "nowrap", opacity: selectedUserId ? 1 : 0.5 }}>
          Add Member
        </button>
      </div>
    </div>
  );
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<CurrentUser[]>([]);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("developer");
  const [userError, setUserError] = useState("");
  const currentUser = useCurrentUser();
  const { colors } = useTheme();

  const loadTeams = useCallback(async () => {
    try { setTeams(await fetchTeams()); }
    catch { setTeams([]); }
    finally { setLoading(false); }
  }, []);

  const loadUsers = useCallback(async () => {
    try { setAllUsers(await fetchUsers()); }
    catch { setAllUsers([]); }
  }, []);

  useEffect(() => { loadTeams(); loadUsers(); }, [loadTeams, loadUsers]);

  const handleCreateUser = async () => {
    setUserError("");
    const email = newUserEmail.trim();
    const name = newUserName.trim();
    if (!email || !name || newUserPassword.length < 8) {
      setUserError("Email, name, and password (8+ chars) are required");
      return;
    }
    try {
      await createUser(email, name, newUserPassword, newUserRole);
      setNewUserEmail(""); setNewUserName(""); setNewUserPassword(""); setNewUserRole("developer");
      await loadUsers();
    } catch (err) {
      setUserError(err instanceof Error ? err.message : "Failed to create user");
    }
  };

  const handleCreateTeam = async () => {
    const name = newTeamName.trim();
    if (!name) return;
    try {
      await createTeam(name, newTeamDesc.trim());
      setNewTeamName("");
      setNewTeamDesc("");
      await loadTeams();
    } catch (err) { console.error("Failed to create team", err); }
  };

  const handleDeleteTeam = async (teamId: string) => {
    try {
      await deleteTeam(teamId);
      if (expandedTeam === teamId) setExpandedTeam(null);
      await loadTeams();
    } catch (err) { console.error("Failed to delete team", err); }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 style={{ color: colors.textPrimary }}>Teams & Access</h2>
      </div>

      {/* Current user info */}
      {currentUser && (
        <div className="reef-glass" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            background: "linear-gradient(135deg, #06b6d4, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 700, color: "#fff",
          }}>
            {currentUser.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ color: colors.textPrimary, fontWeight: 600, fontSize: 14 }}>
              {currentUser.name}
            </div>
            <div style={{ color: colors.textMuted, fontSize: 13 }}>{currentUser.email}</div>
          </div>
          <RoleBadge role={currentUser.role} />
        </div>
      )}

      {/* Users section */}
      <div className="reef-glass" style={{ padding: "16px 20px" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: "12px" }}>
          <h3 style={{ color: colors.textPrimary, fontWeight: 700, fontSize: 15 }}>
            Platform Users ({allUsers.length})
          </h3>
        </div>

        {allUsers.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
            {allUsers.map((u) => (
              <div key={u.id} style={{
                padding: "6px 12px", borderRadius: "10px", fontSize: "13px",
                background: colors.badgeBg, border: `1px solid ${colors.accentBorder}`,
                display: "flex", alignItems: "center", gap: "8px",
              }}>
                <span style={{ color: colors.textPrimary, fontWeight: 500 }}>{u.name}</span>
                <span style={{ color: colors.textMuted, fontSize: "12px" }}>{u.email}</span>
                <RoleBadge role={u.role} />
              </div>
            ))}
          </div>
        )}

        <p style={{ color: colors.textMuted, fontSize: 12, fontWeight: 500, marginBottom: "8px" }}>Create New User</p>
        {userError && (
          <div style={{ marginBottom: "8px", padding: "8px 12px", borderRadius: "8px", background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: "13px" }}>
            {userError}
          </div>
        )}
        <div className="flex gap-2">
          <input value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} placeholder="Email"
            className="flex-1 rounded-xl text-sm outline-none"
            style={{ padding: "8px 14px", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.textPrimary }} />
          <input value={newUserName} onChange={(e) => setNewUserName(e.target.value)} placeholder="Name"
            className="flex-1 rounded-xl text-sm outline-none"
            style={{ padding: "8px 14px", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.textPrimary }} />
          <input value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} placeholder="Password" type="password"
            className="rounded-xl text-sm outline-none" style={{ width: "140px", padding: "8px 14px", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.textPrimary }} />
          <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)}
            style={{ background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, borderRadius: "12px", padding: "8px 12px", color: colors.textPrimary, fontSize: "13px" }}>
            <option value="admin">Admin</option>
            <option value="developer">Developer</option>
            <option value="viewer">Viewer</option>
          </select>
          <button onClick={handleCreateUser} className="btn-reef-primary" style={{ padding: "8px 16px", fontSize: "13px", whiteSpace: "nowrap" }}>
            Create
          </button>
        </div>
      </div>

      {/* Teams list */}
      <div className="space-y-3">
        {loading ? (
          [1, 2].map((i) => (
            <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: colors.accentBg }} />
          ))
        ) : (
          teams.map((team) => (
            <div key={team.id} className="reef-glass" style={{ padding: "16px 20px" }}>
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setExpandedTeam(expandedTeam === team.id ? null : team.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left", flex: 1, padding: 0 }}
                >
                  <div className="flex items-center gap-3">
                    <div style={{
                      width: 36, height: 36, borderRadius: "10px",
                      background: "linear-gradient(135deg, rgba(34,211,238,0.2), rgba(139,92,246,0.2))",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                    }}>
                      👥
                    </div>
                    <div>
                      <p style={{ color: colors.textPrimary, fontWeight: 600, fontSize: 14 }}>{team.name}</p>
                      <div className="flex gap-3" style={{ marginTop: "2px" }}>
                        <span style={{ color: colors.textMuted, fontSize: 12, fontFamily: "monospace" }}>{team.namespace}</span>
                        <span style={{ color: colors.textMuted, fontSize: 12 }}>
                          {team.member_count} member{team.member_count !== 1 ? "s" : ""}
                        </span>
                        {team.description && (
                          <span style={{ color: colors.textMuted, fontSize: 12 }}>— {team.description}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  <span style={{
                    fontSize: "11px", color: colors.textMuted,
                    transform: expandedTeam === team.id ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s", display: "inline-block",
                  }}>
                    &#9660;
                  </span>
                  {team.id !== "tk_DEFAULT000000000000000000" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteTeam(team.id); }}
                      style={{
                        background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "none",
                        borderRadius: "6px", padding: "4px 10px", fontSize: "11px", cursor: "pointer", fontWeight: 500,
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {expandedTeam === team.id && (
                <TeamMembersPanel teamId={team.id} colors={colors} onMemberChange={loadTeams} allUsers={allUsers} />
              )}
            </div>
          ))
        )}
      </div>

      {/* Create team */}
      <div className="reef-glass" style={{ padding: "16px 20px" }}>
        <p style={{ color: colors.textMuted, fontSize: 12, fontWeight: 500, marginBottom: "10px" }}>Create New Team</p>
        <div className="flex gap-2">
          <input
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="Team name"
            className="flex-1 rounded-xl text-sm outline-none"
            style={{ padding: "10px 16px", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.textPrimary }}
            onFocus={(e) => { e.currentTarget.style.borderColor = colors.cardHoverBorder; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = colors.inputBorder; }}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateTeam(); }}
          />
          <input
            value={newTeamDesc}
            onChange={(e) => setNewTeamDesc(e.target.value)}
            placeholder="Description (optional)"
            className="flex-1 rounded-xl text-sm outline-none"
            style={{ padding: "10px 16px", background: colors.inputBg, border: `1px solid ${colors.inputBorder}`, color: colors.textPrimary }}
            onFocus={(e) => { e.currentTarget.style.borderColor = colors.cardHoverBorder; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = colors.inputBorder; }}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateTeam(); }}
          />
          <button onClick={handleCreateTeam} className="btn-reef-primary" style={{ padding: "10px 20px", fontSize: "13px", whiteSpace: "nowrap" }}>
            Create Team
          </button>
        </div>
      </div>
    </div>
  );
}
