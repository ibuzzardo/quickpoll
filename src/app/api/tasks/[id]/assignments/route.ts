import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, errorResponse } from "@/lib/api/errors";
import { listAssignmentsQuerySchema } from "@/lib/api/assignment.validators";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const taskId = params.id;
    if (!taskId) throw new ApiError(400, "INVALID_TASK_ID", "task id is required");

    const parsed = listAssignmentsQuerySchema.safeParse({
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
      cursor: req.nextUrl.searchParams.get("cursor") ?? undefined,
    });

    if (!parsed.success) {
      throw new ApiError(400, "VALIDATION_ERROR", "invalid query params", parsed.error.flatten());
    }

    const { limit, cursor } = parsed.data;

    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } });
    if (!task) throw new ApiError(404, "TASK_NOT_FOUND", "task not found");

    const assignments = await prisma.taskAssignment.findMany({
      where: { taskId },
      orderBy: [{ assignedAt: "desc" }],
      take: limit,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
      include: {
        agent: {
          select: {
            id: true,
            code: true,
            name: true,
            role: true,
            status: true,
          },
        },
      },
    });

    const nextCursor = assignments.length === limit ? assignments[assignments.length - 1]?.id : null;

    return Response.json({
      taskId,
      data: assignments,
      page: {
        limit,
        nextCursor,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
