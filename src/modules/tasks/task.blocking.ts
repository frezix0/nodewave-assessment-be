import type { Prisma } from "../../generated/prisma/client";
import type { AuthUser } from "../auth/auth.select";
import type { PendingPrerequisite } from "./task.transitions";
import { writeAudit } from "../audit/audit.writer";

type Db = Prisma.TransactionClient;

export async function pendingPrerequisitesOf(
	db: Db,
	taskId: string,
): Promise<PendingPrerequisite[]> {
	const rows = await db.$queryRaw<PendingPrerequisite[]>`
    SELECT t.id, t.title, t.status::text AS status
    FROM "Task" t
    JOIN "TaskDependency" d ON d."dependsOnId" = t.id
    WHERE d."taskId" = ${taskId}
      AND d."deletedAt" IS NULL
      AND t."deletedAt" IS NULL
    ORDER BY t.id
    FOR SHARE OF t`;
	return rows.filter((r) => r.status !== "DONE");
}

/** Active task depend on `taskId`. */
export async function dependentIdsOf(
	db: Db,
	taskId: string,
): Promise<string[]> {
	const rows = await db.taskDependency.findMany({
		where: { dependsOnId: taskId, deletedAt: null, task: { deletedAt: null } },
		select: { taskId: true },
	});
	return rows.map((r) => r.taskId);
}

/**
 * Synchronize the status of tasks that depend on the given `taskIds`.
 * Task IN_PROGRESS/DONE not affected. Task TODO/BLOCKED will be updated to BLOCKED if any of its prerequisites is not DONE, otherwise updated to TODO.
 * Version updated, so that the change can be audited.
 */
export async function recomputeBlocked(
	db: Db,
	taskIds: string[],
	actor: AuthUser,
): Promise<void> {
	if (taskIds.length === 0) return;

	const candidates = await db.task.findMany({
		where: {
			id: { in: taskIds },
			deletedAt: null,
			status: { in: ["TODO", "BLOCKED"] },
		},
		select: {
			id: true,
			projectId: true,
			status: true,
			prerequisites: {
				where: {
					deletedAt: null,
					dependsOn: { deletedAt: null, status: { not: "DONE" } },
				},
				select: { id: true },
			},
		},
	});

	for (const task of candidates) {
		const target = task.prerequisites.length > 0 ? "BLOCKED" : "TODO";
		if (target === task.status) continue;

		await db.task.update({
			where: { id: task.id },
			data: { status: target, version: { increment: 1 } },
		});
		// audit log
		await writeAudit(
			db,
			{ taskId: task.id, projectId: task.projectId, userId: actor.id },
			[
				{
					changedColumn: "status",
					oldValue: task.status,
					newValue: target,
				},
			]
		);
	}
}
