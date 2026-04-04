"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // TODO: Implement actual auth when backend login endpoint is ready
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }

    // Placeholder: redirect to dashboard
    window.location.href = "/agents";
  };

  return (
    <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--frost-bg)" }}>
      <div className="w-full max-w-md rounded-2xl border border-white/20 backdrop-blur-xl bg-white/60 dark:bg-zinc-900/60 p-8 shadow-xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold" style={{ color: "var(--neon-cyan)" }}>
            Récif
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-white/20 bg-white/40 dark:bg-zinc-800/40 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/20 bg-white/40 dark:bg-zinc-800/40 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl py-2 text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: "var(--neon-cyan)" }}
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
