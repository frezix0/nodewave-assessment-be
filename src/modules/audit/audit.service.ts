import { prisma } from "../../db/prisma";
import type { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../lib/errors";
import { parseListQuery, toPaginated } from "../../lib/query";
import type { AuthUser } from "../auth/auth.select";
import { projectScope } from "../projects/project.policy";
import { auditListSpec, auditScope } from "./audit.policy";

const auditSelect = {
	id: true,
	taskId: true,
	projectId: true,
	changedColumn: true,
	oldValue: true,
	newValue: true,
	source: true,
	timestamp: true,
	user: { select: { id: true, name: true } },
	task: { select: { id: true, title: true } },
} as const satisfies Prisma.AuditLogSelect;

async function queryAuditLogs(
	user: AuthUser,
	rawQuery: Record<string, string | undefined>,
	extra: Prisma.AuditLogWhereInput,
) {
	const q = parseListQuery(rawQuery, auditListSpec);
	const where: Prisma.AuditLogWhereInput = {
		AND: [q.where as Prisma.AuditLogWhereInput, extra, auditScope(user)],
	};

	const [entries, total] = await prisma.$transaction([
		prisma.auditLog.findMany({
			where,
			orderBy: q.orderBy as Prisma.AuditLogOrderByWithRelationInput[],
			skip: q.skip,
			take: q.take,
			select: auditSelect,
		}),
		prisma.auditLog.count({ where }),
	]);
	return toPaginated(entries, total, q.rows);
}

export function listAuditLogs(
	user: AuthUser,
	rawQuery: Record<string, string | undefined>,
) {
	return queryAuditLogs(user, rawQuery, {});
}

export async function listTaskAuditLogs(
	user: AuthUser,
	taskId: string,
	rawQuery: Record<string, string | undefined>,
) {
	const task = await prisma.task.findFirst({
		where: {
			id: taskId,
			project: { AND: [projectScope(user), { deletedAt: null }] },
		},
		select: { id: true },
	});
	if (!task) throw new AppError(404, "NOT_FOUND", "Task not found");

	return queryAuditLogs(user, rawQuery, { taskId });
}
