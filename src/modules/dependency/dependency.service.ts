import { prisma } from "../../db/prisma";
import type { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../lib/errors";
import type { AuthUser } from "../auth/auth.select";
import { recomputeBlocked } from "../tasks/task.blocking";
import { taskScope } from "../tasks/task.policy";

type Db = Prisma.TransactionClient;

const taskNotFound = () => new AppError(404, "NOT_FOUND", "Task not found");

const relatedTaskSelect = {
  id: true,
  title: true,
  status: true,
  department: true,
} as const satisfies Prisma.TaskSelect;

/** Lock the project graph to prevent concurrent modifications. */
async function lockProjectGraph(tx: Db, projectId: string): Promise<void> {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${projectId}::text))`;
}

/** Lock the status of a task to prevent it from being modified while dependencies are being added. */
async function lockTaskStatus(tx: Db, taskId: string): Promise<string | null> {
  const rows = await tx.$queryRaw<{ status: string }[]>`
    SELECT status::text AS status FROM "Task"
    WHERE id = ${taskId} AND "deletedAt" IS NULL
    FOR UPDATE`;
  return rows[0]?.status ?? null;
}

/** Adding a dependency creates a cycle if the prerequisite is already (transitively) dependent on the task. */
async function wouldCreateCycle(tx: Db, taskId: string, dependsOnId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ found: number }[]>`
    WITH RECURSIVE chain AS (
      SELECT "dependsOnId" AS id FROM "TaskDependency"
      WHERE "taskId" = ${dependsOnId} AND "deletedAt" IS NULL
      UNION
      SELECT d."dependsOnId" FROM "TaskDependency" d
      JOIN chain c ON d."taskId" = c.id
      WHERE d."deletedAt" IS NULL
    )
    SELECT 1 AS found FROM chain WHERE id = ${taskId} LIMIT 1`;
  return rows.length > 0;
}

export async function listDependencies(user: AuthUser, taskId: string) {
  // Depedency only visible to INTERNAL users, not CLIENT users. CLIENT users can only see the status of their own tasks.
  if (user.role === "CLIENT") throw taskNotFound();

  const task = await prisma.task.findFirst({
    where: { AND: [{ id: taskId }, taskScope(user)] },
    select: {
      prerequisites: {
        where: { deletedAt: null, dependsOn: { deletedAt: null } },
        select: { dependsOn: { select: relatedTaskSelect } },
      },
      dependents: {
        where: { deletedAt: null, task: { deletedAt: null } },
        select: { task: { select: relatedTaskSelect } },
      },
    },
  });
  if (!task) throw taskNotFound();

  return {
    prerequisites: task.prerequisites.map((d) => d.dependsOn),
    dependents: task.dependents.map((d) => d.task),
  };
}

export async function addDependency(user: AuthUser, taskId: string, dependsOnId: string) {
  if (taskId === dependsOnId) {
    throw new AppError(422, "SELF_DEPENDENCY", "Task cannot depend on itself");
  }

  return prisma.$transaction(async (tx) => {
    const [task, prerequisite] = await Promise.all([
      tx.task.findFirst({
        where: { id: taskId, deletedAt: null, project: { deletedAt: null } },
        select: { projectId: true },
      }),
      tx.task.findFirst({ where: { id: dependsOnId, deletedAt: null }, select: { projectId: true } }),
    ]);
    if (!task) throw taskNotFound();
    if (!prerequisite) throw new AppError(404, "NOT_FOUND", "Prerequisite not found");
    if (task.projectId !== prerequisite.projectId) {
      throw new AppError(422, "CROSS_PROJECT_DEPENDENCY", "Prerequisite must be in the same project");
    }

    await lockProjectGraph(tx, task.projectId);

    // Depedency only for task in TODO/BLOCKED status. Task that is already IN_PROGRESS/DONE cannot be added as a prerequisite.
    const status = await lockTaskStatus(tx, taskId);
    if (status === null) throw taskNotFound();
    if (status !== "TODO" && status !== "BLOCKED") {
      throw new AppError(
        422,
        "TASK_ALREADY_STARTED",
        "Dependency only can be added to tasks with status TODO/BLOCKED. Please move the task to TODO first.",
      );
    }

    if (await wouldCreateCycle(tx, taskId, dependsOnId)) {
      throw new AppError(422, "DEPENDENCY_CYCLE", "Dependency would create a cycle.");
    }

    // Recoverable: if the dependency already exists but was deleted, we can just undelete it. Otherwise, create a new dependency.
    await tx.taskDependency.upsert({
      where: { taskId_dependsOnId: { taskId, dependsOnId } },
      update: { deletedAt: null },
      create: { taskId, dependsOnId },
    });
    // audit log

    await recomputeBlocked(tx, [taskId], user);
    return listDependenciesTx(tx, taskId);
  });
}

export async function removeDependency(user: AuthUser, taskId: string, dependsOnId: string) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({
      where: { id: taskId, deletedAt: null, project: { deletedAt: null } },
      select: { projectId: true },
    });
    if (!task) throw taskNotFound();

    await lockProjectGraph(tx, task.projectId);

    const res = await tx.taskDependency.updateMany({
      where: { taskId, dependsOnId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (res.count === 0) throw new AppError(404, "NOT_FOUND", "Dependency not found");
    // audit log

    await recomputeBlocked(tx, [taskId], user);
    return listDependenciesTx(tx, taskId);
  });
}

async function listDependenciesTx(tx: Db, taskId: string) {
  const prerequisites = await tx.taskDependency.findMany({
    where: { taskId, deletedAt: null, dependsOn: { deletedAt: null } },
    select: { dependsOn: { select: relatedTaskSelect } },
  });
  return { prerequisites: prerequisites.map((d) => d.dependsOn) };
}