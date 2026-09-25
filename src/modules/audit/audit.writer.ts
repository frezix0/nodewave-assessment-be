import type { Prisma } from "../../generated/prisma/client";
import type { AuditChange } from "./audit.diff";

type Db = Prisma.TransactionClient;

export type AuditContext = {
	taskId: string;
	projectId: string;
	userId: string;
	source?: "USER" | "SYSTEM";
};

/** Task columns to include in the audit snapshot */
export const auditSnapshotSelect = {
	projectId: true,
	title: true,
	description: true,
	department: true,
	status: true,
	assigneeId: true,
	clientVisible: true,
	deletedAt: true,
} as const satisfies Prisma.TaskSelect;

export async function writeAudit(
	db: Db,
	ctx: AuditContext,
	changes: AuditChange[],
): Promise<void> {
	if (changes.length === 0) return;
	await db.auditLog.createMany({
		data: changes.map((change) => ({
			...change,
			taskId: ctx.taskId,
			projectId: ctx.projectId,
			userId: ctx.userId,
			source: ctx.source ?? "USER",
		})),
	});
}
