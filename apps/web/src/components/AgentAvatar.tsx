"use client";

import { displayName } from "@/lib/api";

export default function AgentAvatar({
  name,
  agentId,
  size = "md",
}: {
  name: string;
  agentId: string;
  size?: "sm" | "md" | "lg";
}) {
  const label = displayName(name, agentId);
  const ch = label.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className={`agent-avatar size-${size}`} aria-hidden>
      {ch}
    </div>
  );
}
