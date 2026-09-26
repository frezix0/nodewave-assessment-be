import { prisma } from "../../db/prisma";
import type { Department, Prisma } from "../../generated/prisma/client";
import { AppError } from "../../lib/errors";
import { parseListQuery, toPaginated } from "../../lib/query";
import { diffTaskChanges } from "../audit/audit.diff";
import { auditSnapshotSelect, writeAudit } from "../audit/audit.writer";
import type { AuthUser } from "../auth/auth.select";
import {
	dependentIdsOf,
	pendingPrerequisitesOf,
	recomputeBlocked,
} from "./task.blocking";
import { taskListSpec, taskScope } from "./task.policy";
import type {
	ChangeStatusInput,
	CreateTaskInput,
	UpdateTaskInput,
} from "./task.schema";
import { taskClientSelect, taskInternalSelect } from "./task.select";
import { canTransition, listTransitions } from "./task.transitions";

type Db = Prisma.TransactionClient;

const notFound = () => new AppError(404, "NOT_FOUND", "Task not found");

function scopedWhere(
	user: AuthUser,
	extra: Prisma.TaskWhereInput,
): Prisma.TaskWhereInput {
	return { AND: [extra, taskScope(user)] };
}

/**
 * Successful update must increment version by 1. If no row updated, check if task exists and throw 409 if version mismatch.
 */
export async function updateTaskWithVersion(
	tx: Db,
	id: string,
	expectedVersion: number,
	changes: Prisma.TaskUncheckedUpdateManyInput,
	actor: AuthUser,
): Promise<void> {
	const before = await tx.task.findFirst({
		where: { id, deletedAt: null },
		select: auditSnapshotSelect,
	});
	if (!before) throw notFound();

	const res = await tx.task.updateMany({
		where: { id, version: expectedVersion, deletedAt: null },
		data: { ...changes, version: { increment: 1 } },
	});

	if (res.count > 0) {
		// Audit log
		await writeAudit(
			tx,
			{ taskId: id, projectId: before.projectId, userId: actor.id },
			diffTaskChanges(before, changes as Record<string, unknown>),
		);
		return;
	}

	const current = await tx.task.findFirst({
		where: { id, deletedAt: null },
		select: taskInternalSelect,
	});
	if (!current) throw notFound();
	throw new AppError(
		409,
		"VERSION_CONFLICT",
		"Task already updated by another user. Please reload to see the latest version.",
		{
			current,
		},
	);
}

async function validateAssignee(
	db: Db,
	projectId: string,
	userId: string,
	department: Department,
) {
	const member = await db.projectMember.findFirst({
		where: {
			projectId,
			userId,
			deletedAt: null,
			user: { deletedAt: null, role: "INTERNAL" },
		},
		select: { user: { select: { department: true } } },
	});
	if (!member) {
		throw new AppError(
			422,
			"INVALID_ASSIGNEE",
			"Assignee must be an internal user who is a member of the project",
		);
	}
	if (member.user.department !== department) {
		throw new AppError(
			422,
			"INVALID_ASSIGNEE",
			"Assignee's department must be the same as the task's department",
		);
	}
}

export async function listTasks(
	user: AuthUser,
	rawQuery: Record<string, string | undefined>,
) {
	const q = parseListQuery(rawQuery, taskListSpec(user));
	const where = scopedWhere(user, q.where as Prisma.TaskWhereInput);
	const paging = {
		where,
		orderBy: q.orderBy as Prisma.TaskOrderByWithRelationInput[],
		skip: q.skip,
		take: q.take,
	};

	if (user.role === "CLIENT") {
		const [entries, total] = await prisma.$transaction([
			prisma.task.findMany({ ...paging, select: taskClientSelect }),
			prisma.task.count({ where }),
		]);
		return toPaginated(entries, total, q.rows);
	}

	const [entries, total] = await prisma.$transaction([
		prisma.task.findMany({ ...paging, select: taskInternalSelect }),
		prisma.task.count({ where }),
	]);
	return toPaginated(entries, total, q.rows);
}

export async function getTask(user: AuthUser, id: string) {
	const where = scopedWhere(user, { id });

	if (user.role === "CLIENT") {
		const task = await prisma.task.findFirst({
			where,
			select: taskClientSelect,
		});
		if (!task) throw notFound();
		return task;
	}

	const task = await prisma.task.findFirst({
		where,
		select: taskInternalSelect,
	});
	if (!task) throw notFound();
	const pendingPrerequisites = await pendingPrerequisitesOf(prisma, id);
	return {
		...task,
		blockedBy: pendingPrerequisites,
		availableTransitions: listTransitions(user, task, { pendingPrerequisites }),
	};
}

export async function createTask(user: AuthUser, input: CreateTaskInput) {
	const project = await prisma.project.findFirst({
		where: { id: input.projectId, deletedAt: null },
		select: { id: true },
	});
	if (!project) throw new AppError(404, "NOT_FOUND", "Project not found");

	if (input.assigneeId) {
		await validateAssignee(
			prisma,
			input.projectId,
			input.assigneeId,
			input.department,
		);
	}

	return prisma.$transaction(async (tx) => {
		const task = await tx.task.create({
			data: {
				projectId: input.projectId,
				title: input.title,
				description: input.description,
				department: input.department,
				assigneeId: input.assigneeId ?? null,
				clientVisible: input.clientVisible,
				createdById: user.id,
			},
			select: taskInternalSelect,
		});
		await writeAudit(
			tx,
			{ taskId: task.id, projectId: task.projectId, userId: user.id },
			[{ changedColumn: "created", oldValue: null, newValue: task.title }],
		);
		return task;
	});
}

export async function updateTask(
	user: AuthUser,
	id: string,
	input: UpdateTaskInput,
) {
	const { version, ...changes } = input;

	return prisma.$transaction(async (tx) => {
		const task = await tx.task.findFirst({
			where: { id, deletedAt: null, project: { deletedAt: null } },
			select: { projectId: true, department: true, assigneeId: true },
		});
		if (!task) throw notFound();

		// Validate assignee if department or assigneeId is changed
		const department = changes.department ?? task.department;
		const assigneeId =
			changes.assigneeId === undefined ? task.assigneeId : changes.assigneeId;
		const assignmentChanged =
			changes.department !== undefined || changes.assigneeId !== undefined;
		if (assigneeId && assignmentChanged) {
			await validateAssignee(tx, task.projectId, assigneeId, department);
		}

		await updateTaskWithVersion(tx, id, version, changes, user);
		return tx.task.findFirstOrThrow({
			where: { id },
			select: taskInternalSelect,
		});
	});
}

export async function changeTaskStatus(
	user: AuthUser,
	id: string,
	input: ChangeStatusInput,
) {
	return prisma.$transaction(async (tx) => {
		const pendingPrerequisites = await pendingPrerequisitesOf(tx, id);

		const task = await tx.task.findFirst({
			where: scopedWhere(user, { id }),
			select: { status: true, assigneeId: true },
		});
		if (!task) throw notFound();

		const result = canTransition(user, task, input.status, {
			pendingPrerequisites,
		});
		if (!result.ok)
			throw new AppError(
				result.httpStatus,
				result.code,
				result.reason,
				result.details,
			);

		await updateTaskWithVersion(
			tx,
			id,
			input.version,
			{ status: input.status },
			user,
		);

		await recomputeBlocked(tx, [id, ...(await dependentIdsOf(tx, id))], user);

		return tx.task.findFirstOrThrow({
			where: { id },
			select: taskInternalSelect,
		});
	});
}

export async function deleteTask(
	user: AuthUser,
	id: string,
	version: number,
): Promise<void> {
	await prisma.$transaction(async (tx) => {
		await updateTaskWithVersion(
			tx,
			id,
			version,
			{ deletedAt: new Date() },
			user,
		);
		await recomputeBlocked(tx, await dependentIdsOf(tx, id), user);
	});
}
