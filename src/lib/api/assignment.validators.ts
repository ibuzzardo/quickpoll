import { z } from "zod";

export const assignmentReasonEnum = z.enum([
  "manual_override",
  "auto_routing",
  "handoff",
  "retry",
  "escalation",
]);

export const assignmentModeEnum = z.enum(["replace", "noop_if_same"]);

export const sourceTypeEnum = z.enum(["api", "openclaw_session", "scheduler"]);

export const assignTaskSchema = z.object({
  agentId: z.string().min(1),
  reason: assignmentReasonEnum.default("manual_override"),
  mode: assignmentModeEnum.default("replace"),
  expectedVersion: z.number().int().nonnegative().optional(),
  source: z
    .object({
      type: sourceTypeEnum,
      sessionId: z.string().min(1).optional(),
      requesterSession: z.string().min(1).optional(),
      channel: z.string().min(1).optional(),
      host: z.string().min(1).optional(),
      runtimeLabel: z.string().min(1).optional(),
    })
    .optional(),
  overrideCapacity: z.boolean().default(false),
});

export const unassignTaskSchema = z.object({
  reason: assignmentReasonEnum.default("manual_override"),
  expectedVersion: z.number().int().nonnegative().optional(),
  source: z
    .object({
      type: sourceTypeEnum,
      sessionId: z.string().min(1).optional(),
      requesterSession: z.string().min(1).optional(),
      channel: z.string().min(1).optional(),
      host: z.string().min(1).optional(),
      runtimeLabel: z.string().min(1).optional(),
    })
    .optional(),
});

export const listAssignmentsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
  cursor: z.string().optional(),
});

export type AssignTaskInput = z.infer<typeof assignTaskSchema>;
export type UnassignTaskInput = z.infer<typeof unassignTaskSchema>;
