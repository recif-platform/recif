"use client";

import { Agent } from "@/lib/api";

const statusColors: Record<string, string> = {
  registered: "bg-yellow-500",
  evaluating: "bg-blue-500",
  evaluated: "bg-cyan-500",
  deployed: "bg-green-500",
  eval_failed: "bg-red-500",
  deploy_failed: "bg-red-500",
};

export function FleetGrid({ agents }: { agents: Agent[] }) {
  if (agents.length === 0) {
    return (
      <div className="rounded-2xl border border-white/20 backdrop-blur-xl bg-white/60 dark:bg-zinc-900/60 p-8 text-center shadow-lg">
        <p className="text-lg font-medium mb-2">No agents in fleet</p>
        <p className="text-muted-foreground text-sm">Agents will appear here once registered.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {agents.map((agent) => (
        <a
          key={agent.id}
          href={`/agents/${agent.id}/eval`}
          className="block rounded-2xl border border-white/20 backdrop-blur-xl bg-white/60 dark:bg-zinc-900/60 p-5 shadow-lg hover:shadow-xl hover:border-cyan-500/30 transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm truncate">{agent.name}</h3>
            <span className={`inline-flex h-2.5 w-2.5 rounded-full ${statusColors[agent.status] || "bg-gray-400"}`} />
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>Status: <span className="text-foreground">{agent.status}</span></p>
            <p>v{agent.version} / {agent.framework}</p>
          </div>
        </a>
      ))}
    </div>
  );
}
