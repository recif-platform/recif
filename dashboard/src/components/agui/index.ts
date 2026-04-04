/**
 * AG-UI Built-in Components
 *
 * Import this module to register all built-in AG-UI components
 * with the component registry.
 */

// Registry (core)
export { registerComponent, getComponent, listComponents, AgentComponent } from "./registry";

// Block renderer
export { AgentBlockRenderer } from "./agent-block";
export type { AgentBlock } from "./agent-block";

// Built-in components — importing them triggers self-registration
import "./data-table";
import "./json-viewer";
import "./metric-card";
import "./confirm-action";
import "./code-sandbox";
import "./html-preview";
import "./three-scene";
import "./flow-diagram";
import "./progress-bar";
import "./stat-grid";

// Named re-exports for direct use
export { DataTable } from "./data-table";
export { JsonViewer } from "./json-viewer";
export { MetricCard } from "./metric-card";
export { ConfirmAction } from "./confirm-action";
export { CodeSandbox } from "./code-sandbox";
export { default as HTMLPreview } from "./html-preview";
export { ThreeScene } from "./three-scene";
export { FlowDiagram } from "./flow-diagram";
export { ProgressBar } from "./progress-bar";
export { StatGrid } from "./stat-grid";
