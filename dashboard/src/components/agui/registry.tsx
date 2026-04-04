"use client";

import React from "react";

/**
 * AG-UI Component Registry
 *
 * Maps component names (emitted by the agent SSE stream) to React components.
 * Built-in components register themselves on import via `registerComponent`.
 * Third-party or user components can register at runtime.
 */
const COMPONENT_REGISTRY: Record<string, React.ComponentType<any>> = {};

export function registerComponent(
  name: string,
  component: React.ComponentType<any>,
): void {
  COMPONENT_REGISTRY[name] = component;
}

export function getComponent(
  name: string,
): React.ComponentType<any> | null {
  return COMPONENT_REGISTRY[name] ?? null;
}

export function listComponents(): string[] {
  return Object.keys(COMPONENT_REGISTRY);
}

/**
 * Renders a registered AG-UI component by name.
 * Falls back to a styled warning if the component is unknown.
 */
export function AgentComponent({
  name,
  props,
}: {
  name: string;
  props: Record<string, any>;
}) {
  const Component = getComponent(name);

  if (!Component) {
    return (
      <div
        style={{
          padding: "12px 16px",
          borderRadius: 10,
          background: "rgba(245, 158, 11, 0.08)",
          border: "1px solid rgba(245, 158, 11, 0.2)",
          color: "#f59e0b",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        Unknown component: <code style={{ fontFamily: "var(--font-mono), monospace" }}>{name}</code>
      </div>
    );
  }

  return <Component {...props} />;
}
