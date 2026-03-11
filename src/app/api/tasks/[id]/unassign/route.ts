import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { unassignTaskSchema } from "@/lib/api/assignment.validators";

const NON_UNASSIGNABLE_STATUSES = new Set(["DONE", "CANCELLED"]);

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const taskId = params.id;
    if (!taskId) throw new ApiError(400, "INVALID_TASK_ID", "task id is required");

    const json = await req.json().catch(() => ({}));
    const parsed = unassignTaskSchema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", "invalid unassign payload", parsed.error.flatten());
    }

    const input = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({ where: { id: taskId } });
      if (!task) throw new ApiError(404, "TASK_NOT_FOUND", "task not found");

      if (NON_UNASSIGNABLE_STATUSES.has(String(task.status))) {
        throw new ApiError(422, "TERMINAL_TASK", "cannot unassign terminal task");
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

      if (!activeAssignment) {
        throw new ApiError(404, "NO_ACTIVE_ASSIGNMENT", "task has no active assignment");
      }

      await tx.taskAssignment.update({
        where: { id: activeAssignment.id },
        data: { active: false, unassignedAt: new Date() },
      });

      const updatedTask = await tx.task.update({
        where: { id: taskId },
        data: {
          assigneeId: null,
          status: task.status === "ASSIGNED" ? "TO_DO" : task.status,
          version: { increment: 1 },
        },
      });

      await tx.taskAssignmentEvent.create({
        data: {
          taskId,
          assignmentId: activeAssignment.id,
          eventType: "TASK_UNASSIGNED",
          payload: {
            previousAgentId: activeAssignment.agentId,
            reason: input.reason,
            source: input.source ?? null,
          },
        },
      });

      return {
        taskId,
        unassigned: true,
        previousAssignmentId: activeAssignment.id,
        task: {
          assigneeId: updatedTask.assigneeId,
          status: updatedTask.status,
          version: updatedTask.version,
          updatedAt: updatedTask.updatedAt,
        },
      };
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
