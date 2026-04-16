"use client";

import { useState } from "react";
import { login } from "@/lib/api";
import { setToken } from "@/lib/auth";

/* Inline the animated reef logo (can't use useTheme outside ThemeProvider) */
function LoginLogo() {
  return (
    <svg width={120} height={120} viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="lCoral" x1="0%" y1="100%" x2="40%" y2="0%">
          <stop offset="0%" stopColor="#db2777" /><stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
        <linearGradient id="lCyan" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#06b6d4" /><stop offset="100%" stopColor="#67e8f9" />
        </linearGradient>
        <linearGradient id="lPurple" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7c3aed" /><stop offset="100%" stopColor="#a78bfa" />
        </linearGradient>
        <linearGradient id="lGreen" x1="0%" y1="100%" x2="50%" y2="0%">
          <stop offset="0%" stopColor="#059669" /><stop offset="100%" stopColor="#34d399" />
        </linearGradient>
        <filter id="lGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g transform="translate(70, 112)" filter="url(#lGlow)">
        <path d="M-4 0 Q-6 -16 -12 -30 Q-15 -38 -10 -48 Q-7 -56 -12 -66 Q-14 -72 -10 -78" stroke="url(#lCoral)" strokeWidth="5" fill="none" strokeLinecap="round">
          <animate attributeName="d" values="M-4 0 Q-6 -16 -12 -30 Q-15 -38 -10 -48 Q-7 -56 -12 -66 Q-14 -72 -10 -78;M-4 0 Q-5 -16 -11 -30 Q-14 -39 -9 -49 Q-6 -57 -11 -67 Q-13 -73 -9 -79;M-4 0 Q-6 -16 -12 -30 Q-15 -38 -10 -48 Q-7 -56 -12 -66 Q-14 -72 -10 -78" dur="6s" repeatCount="indefinite" />
        </path>
        <path d="M-12 -30 Q-22 -38 -28 -46" stroke="url(#lCoral)" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <path d="M-28 -46 Q-34 -52 -32 -58" stroke="url(#lCoral)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <circle cx="-10" cy="-78" r="3.5" fill="#ec4899" opacity="0.7" />
        <circle cx="-32" cy="-58" r="3" fill="#f472b6" opacity="0.6" />
        <path d="M8 0 Q12 -14 16 -28 Q18 -36 14 -46 Q11 -54 16 -64 Q18 -70 14 -76" stroke="url(#lCyan)" strokeWidth="5" fill="none" strokeLinecap="round">
          <animate attributeName="d" values="M8 0 Q12 -14 16 -28 Q18 -36 14 -46 Q11 -54 16 -64 Q18 -70 14 -76;M8 0 Q13 -14 17 -28 Q19 -35 15 -45 Q12 -53 17 -63 Q19 -69 15 -75;M8 0 Q12 -14 16 -28 Q18 -36 14 -46 Q11 -54 16 -64 Q18 -70 14 -76" dur="5s" repeatCount="indefinite" />
        </path>
        <path d="M16 -28 Q26 -34 30 -42" stroke="url(#lCyan)" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <circle cx="14" cy="-76" r="3.5" fill="#06b6d4" opacity="0.7" />
        <circle cx="30" cy="-42" r="3" fill="#22d3ee" opacity="0.6" />
        <path d="M0 -2 Q-1 -18 2 -32 Q3 -40 -1 -48 Q-2 -54 1 -60" stroke="url(#lPurple)" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.6">
          <animate attributeName="d" values="M0 -2 Q-1 -18 2 -32 Q3 -40 -1 -48 Q-2 -54 1 -60;M0 -2 Q0 -18 3 -32 Q4 -39 0 -47 Q-1 -53 2 -59;M0 -2 Q-1 -18 2 -32 Q3 -40 -1 -48 Q-2 -54 1 -60" dur="7s" repeatCount="indefinite" />
        </path>
        <circle cx="1" cy="-60" r="2.5" fill="#8b5cf6" opacity="0.5" />
        <path d="M26 0 Q28 -12 24 -22 Q22 -28 25 -36" stroke="url(#lGreen)" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.5">
          <animate attributeName="d" values="M26 0 Q28 -12 24 -22 Q22 -28 25 -36;M26 0 Q27 -12 23 -22 Q21 -29 24 -37;M26 0 Q28 -12 24 -22 Q22 -28 25 -36" dur="4s" repeatCount="indefinite" />
        </path>
      </g>
      {/* Fish */}
      <g>
        <ellipse cx="28" cy="42" rx="7" ry="4" fill="#fbbf24" opacity="0.9">
          <animate attributeName="cx" values="28;38;28;18;28" dur="8s" repeatCount="indefinite" />
        </ellipse>
        <circle cx="25" cy="41" r="1.2" fill="#78350f" opacity="0.8">
          <animate attributeName="cx" values="25;35;25;15;25" dur="8s" repeatCount="indefinite" />
        </circle>
      </g>
      <ellipse cx="105" cy="34" rx="5" ry="3" fill="#22d3ee" opacity="0.7">
        <animate attributeName="cx" values="105;98;105;112;105" dur="7s" repeatCount="indefinite" />
      </ellipse>
      {/* Bubbles */}
      <circle cx="55" cy="55" r="2.5" fill="none" stroke="#22d3ee" strokeWidth="0.5" opacity="0.3">
        <animate attributeName="cy" values="55;40;25;10;55" dur="5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.3;0.5;0.3;0;0.3" dur="5s" repeatCount="indefinite" />
      </circle>
      <circle cx="78" cy="62" r="2" fill="none" stroke="#22d3ee" strokeWidth="0.4" opacity="0.25">
        <animate attributeName="cy" values="62;45;28;12;62" dur="6s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) { setError("Email and password are required"); return; }
    setLoading(true);
    try {
      const { token } = await login(email, password);
      setToken(token);
      window.location.href = "/agents";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(180deg, #0e7490 0%, #0a4f6d 25%, #061f35 60%, #030a14 100%)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Caustic light rays */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.06 }}>
        <div style={{ position: "absolute", top: 0, left: "20%", width: 8, height: "60%", background: "linear-gradient(180deg, #67e8f9, transparent)", transform: "rotate(3deg)" }} />
        <div style={{ position: "absolute", top: 0, left: "50%", width: 6, height: "55%", background: "linear-gradient(180deg, #22d3ee, transparent)", transform: "rotate(-2deg)" }} />
        <div style={{ position: "absolute", top: 0, left: "75%", width: 5, height: "50%", background: "linear-gradient(180deg, #67e8f9, transparent)", transform: "rotate(4deg)" }} />
      </div>

      <div style={{
        width: "100%",
        maxWidth: 420,
        padding: "40px 36px",
        borderRadius: 24,
        background: "rgba(10, 24, 45, 0.85)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(34, 211, 238, 0.12)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(34,211,238,0.06)",
        position: "relative",
        zIndex: 1,
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <LoginLogo />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "#22d3ee", letterSpacing: "-0.02em", marginBottom: 6 }}>
            Récif
          </h1>
          <p style={{ fontSize: 14, color: "#64748b" }}>Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {error && (
            <div style={{
              padding: "10px 14px", borderRadius: 12,
              background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)",
              color: "#f87171", fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 6 }}>
              Email
            </label>
            <input
              id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email" disabled={loading}
              style={{
                width: "100%", padding: "12px 16px", borderRadius: 12, fontSize: 14,
                background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(34, 211, 238, 0.15)",
                color: "#e2e8f0", outline: "none", transition: "border-color 0.2s",
                boxSizing: "border-box",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(34, 211, 238, 0.4)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(34, 211, 238, 0.15)"; }}
            />
          </div>

          <div>
            <label htmlFor="password" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 6 }}>
              Password
            </label>
            <input
              id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" autoComplete="current-password" disabled={loading}
              style={{
                width: "100%", padding: "12px 16px", borderRadius: 12, fontSize: 14,
                background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(34, 211, 238, 0.15)",
                color: "#e2e8f0", outline: "none", transition: "border-color 0.2s",
                boxSizing: "border-box",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(34, 211, 238, 0.4)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(34, 211, 238, 0.15)"; }}
            />
          </div>

          <button
            type="submit" disabled={loading}
            style={{
              width: "100%", padding: "13px 0", borderRadius: 14, fontSize: 14, fontWeight: 700,
              color: "#fff", border: "none", cursor: loading ? "wait" : "pointer",
              background: "linear-gradient(135deg, #0891b2, #06b6d4, #22d3ee)",
              boxShadow: "0 4px 16px rgba(6, 182, 212, 0.3)",
              opacity: loading ? 0.6 : 1, transition: "opacity 0.2s, transform 0.15s",
              marginTop: 4,
            }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: "#475569" }}>
          Récif Platform — Open Source
        </p>
      </div>
    </div>
  );
}
