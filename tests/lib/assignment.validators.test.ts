import { describe, expect, it } from "vitest";
import { assignTaskSchema, unassignTaskSchema } from "@/lib/api/assignment.validators";

describe("assignment validators", () => {
  it("validates assign payload", () => {
    const parsed = assignTaskSchema.parse({
      agentId: "agent_1",
      reason: "manual_override",
      mode: "replace",
      expectedVersion: 2,
      source: {
        type: "openclaw_session",
        sessionId: "agent:main:subagent:123",
      },
    });

    expect(parsed.agentId).toBe("agent_1");
    expect(parsed.expectedVersion).toBe(2);
  });

  it("rejects missing agentId", () => {
    const result = assignTaskSchema.safeParse({ reason: "manual_override" });
    expect(result.success).toBe(false);
  });

  it("validates unassign payload defaults", () => {
    const parsed = unassignTaskSchema.parse({});
    expect(parsed.reason).toBe("manual_override");
  });
});
