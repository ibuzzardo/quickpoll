import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { assignTaskSchema } from "@/lib/api/assignment.validators";
import {
  findIdempotentResponse,
  getIdempotencyKey,
  hashRequest,
  reserveIdempotencyKey,
  saveIdempotentResponse,
} from "@/lib/api/idempotency";

const NON_ASSIGNABLE_STATUSES = new Set(["DONE", "CANCELLED"]);

function toAssignmentReason(reason: string):
  | "MANUAL_OVERRIDE"
  | "AUTO_ROUTING"
  | "HANDOFF"
  | "RETRY"
  | "ESCALATION" {
  switch (reason) {
    case "manual_override":
      return "MANUAL_OVERRIDE";
    case "auto_routing":
      return "AUTO_ROUTING";
    case "handoff":
      return "HANDOFF";
    case "retry":
      return "RETRY";
    case "escalation":
      return "ESCALATION";
    default:
      return "MANUAL_OVERRIDE";
  }
}

function toSourceType(sourceType?: string): "API" | "OPENCLOW_SESSION" | "SCHEDULER" {
  switch (sourceType) {
    case "openclaw_session":
      return "OPENCLOW_SESSION";
    case "scheduler":
      return "SCHEDULER";
    default:
      return "API";
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const taskId = params.id;
    if (!taskId) throw new ApiError(400, "INVALID_TASK_ID", "task id is required");

    const json = await req.json().catch(() => {
      throw new ApiError(400, "INVALID_JSON", "request body must be valid json");
    });

    const parsed = assignTaskSchema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", "invalid assignment payload", parsed.error.flatten());
    }

    const input = parsed.data;

    const idempotencyKey = getIdempotencyKey(req);
    const requestHash = idempotencyKey
      ? hashRequest(req.method, req.nextUrl.pathname, input)
      : null;

    if (idempotencyKey && requestHash) {
      const cached = await findIdempotentResponse(
        idempotencyKey,
        req.method,
        req.nextUrl.pathname,
        requestHash,
      );
      if (cached) return Response.json(cached.body, { status: cached.status });

      await reserveIdempotencyKey(idempotencyKey, req.method, req.nextUrl.pathname, requestHash);
    }

    const result = await prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({ where: { id: taskId } });
      if (!task) throw new ApiError(404, "TASK_NOT_FOUND", "task not found");

      const agent = await tx.agent.findUnique({ where: { id: input.agentId } });
      if (!agent) throw new ApiError(404, "AGENT_NOT_FOUND", "agent not found");
      if ((agent.status || "").toLowerCase() !== "active") {
        throw new ApiError(422, "AGENT_INACTIVE", "agent must be active to accept assignment");
      }

      if (NON_ASSIGNABLE_STATUSES.has(String(task.status))) {
        throw new ApiError(422, "TERMINAL_TASK", "cannot assign terminal task");
      }

      if (typeof input.expectedVersion === "number" && task.version !== input.expectedVersion) {
        throw new ApiError(409, "VERSION_CONFLICT", "expectedVersion does not match current version", {
          currentVersion: task.version,
        });
      }

      const activeAssignment = await tx.taskAssignment.findFirst({
        where: { taskId, active: true },
        orderBy: { assignedAt: "desc" },
      });

      const sameAgent = activeAssignment?.agentId === input.agentId;
      if (sameAgent && input.mode === "noop_if_same") {
        const body = {
          taskId,
          changed: false,
          assignment: activeAssignment,
          task: {
            assigneeId: task.assigneeId,
            status: task.status,
            version: task.version,
            updatedAt: task.updatedAt,
          },
        };
        return { status: 200, body };
      }

      if (activeAssignment) {
        await tx.taskAssignment.update({
          where: { id: activeAssignment.id },
          data: { active: false, unassignedAt: new Date() },
        });

        await tx.taskAssignmentEvent.create({
          data: {
            taskId,
            assignmentId: activeAssignment.id,
            eventType: "TASK_REASSIGNED",
            payload: {
              fromAgentId: activeAssignment.agentId,
              toAgentId: input.agentId,
              reason: input.reason,
            },
          },
        });
      }

      const assignment = await tx.taskAssignment.create({
        data: {
          taskId,
          agentId: input.agentId,
          active: true,
          reason: toAssignmentReason(input.reason),
          assignedBy: "system",
          sourceType: toSourceType(input.source?.type),
          sourceSessionId: input.source?.sessionId,
          meta: {
            mode: input.mode,
            requesterSession: input.source?.requesterSession,
            channel: input.source?.channel,
            host: input.source?.host,
            runtimeLabel: input.source?.runtimeLabel,
          },
        },
      });

      const nextStatus = task.status === "TO_DO" ? "ASSIGNED" : task.status;
      const updatedTask = await tx.task.update({
        where: { id: taskId },
        data: {
          assigneeId: input.agentId,
          status: nextStatus as any,
          version: { increment: 1 },
        },
      });

      await tx.taskAssignmentEvent.create({
        data: {
          taskId,
          assignmentId: assignment.id,
          eventType: activeAssignment ? "TASK_REASSIGNED" : "TASK_ASSIGNED",
          payload: {
            agentId: input.agentId,
            reason: input.reason,
            source: input.source ?? null,
          },
        },
      });

      if (input.source?.type === "openclaw_session" && input.source.sessionId) {
        await tx.openClawAgentSession.upsert({
          where: { sessionId: input.source.sessionId },
          update: {
            agentId: input.agentId,
            requesterSession: input.source.requesterSession,
            channel: input.source.channel,
            host: input.source.host,
            runtimeLabel: input.source.runtimeLabel,
            status: "ACTIVE",
            lastSeenAt: new Date(),
          },
          create: {
            agentId: input.agentId,
            sessionId: input.source.sessionId,
            requesterSession: input.source.requesterSession,
            channel: input.source.channel,
            host: input.source.host,
            runtimeLabel: input.source.runtimeLabel,
            status: "ACTIVE",
            lastSeenAt: new Date(),
          },
        });
      }

      const body = {
        taskId,
        changed: true,
        assignment: {
          id: assignment.id,
          taskId: assignment.taskId,
          agentId: assignment.agentId,
          active: assignment.active,
          assignedAt: assignment.assignedAt,
          reason: assignment.reason,
          sourceType: assignment.sourceType,
          sourceSessionId: assignment.sourceSessionId,
        },
        task: {
          assigneeId: updatedTask.assigneeId,
          status: updatedTask.status,
          version: updatedTask.version,
          updatedAt: updatedTask.updatedAt,
        },
      };

      return { status: 200, body };
    });

    if (idempotencyKey) {
      await saveIdempotentResponse(idempotencyKey, result.status, result.body);
    }

    return Response.json(result.body, { status: result.status });
  } catch (error) {
    return errorResponse(error);
  }
}
