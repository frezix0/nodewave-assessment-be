import { prisma } from "../../db/prisma";
import { AppError } from "../../lib/errors";
import type { AuthUser } from "../auth/auth.select";
import { taskScope } from "./task.policy";

/**
 * Internal resource access check for task. Throws 404 if user does not have access to the task.
 */
export async function assertInternalTaskAccess(user: AuthUser, taskId: string): Promise<{ projectId: string }> {
  if (user.role === "CLIENT") throw new AppError(404, "NOT_FOUND", "Task not found");

  const task = await prisma.task.findFirst({
    where: { AND: [{ id: taskId }, taskScope(user)] },
    select: { projectId: true },
  });
  if (!task) throw new AppError(404, "NOT_FOUND", "Task not found");
  return task;
}