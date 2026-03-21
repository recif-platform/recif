"use client";

import { ReefMarkdown } from "@/components/custom/reef-markdown";
import { AgentComponent } from "./registry";
import { ConfirmAction } from "./confirm-action";

export interface AgentBlock {
  type: "text" | "component" | "confirm";
  /** Text content (for type === "text") */
  content?: string;
  /** Component name from registry (for type === "component") */
  component?: string;
  /** Props to pass to the component (for type === "component") */
  props?: Record<string, any>;
  /** Confirm payload (for type === "confirm") */
  confirm?: {
    id: string;
    tool: string;
    args: Record<string, any>;
    message: string;
  };
}

const BLOCK_RENDERERS: Record<
  AgentBlock["type"],
  (props: {
    block: AgentBlock;
    onConfirm?: (id: string) => void;
    onCancel?: (id: string) => void;
    isStreaming?: boolean;
  }) => React.ReactNode
> = {
  text: ({ block, isStreaming }) => (
    <>
      {block.content ? (
        <ReefMarkdown content={block.content} />
      ) : null}
      {isStreaming && <span className="reef-cursor" />}
    </>
  ),

  component: ({ block }) => {
    if (!block.component) return null;
    return (
      <AgentComponent name={block.component} props={block.props ?? {}} />
    );
  },

  confirm: ({ block, onConfirm, onCancel }) => {
    if (!block.confirm) return null;
    return (
      <ConfirmAction
        id={block.confirm.id}
        tool={block.confirm.tool}
        args={block.confirm.args}
        message={block.confirm.message}
        onConfirm={() => onConfirm?.(block.confirm!.id)}
        onCancel={() => onCancel?.(block.confirm!.id)}
      />
    );
  },
};

export function AgentBlockRenderer({
  block,
  onConfirm,
  onCancel,
  isStreaming,
}: {
  block: AgentBlock;
  onConfirm?: (id: string) => void;
  onCancel?: (id: string) => void;
  isStreaming?: boolean;
}) {
  const renderer = BLOCK_RENDERERS[block.type];
  if (!renderer) return null;
  return <>{renderer({ block, onConfirm, onCancel, isStreaming })}</>;
}
