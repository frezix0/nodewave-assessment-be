import { prisma } from "../../db/prisma";
import type { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../lib/errors";
import { type ListSpec, parseListQuery, toPaginated } from "../../lib/query";
import type { AuthUser } from "../auth/auth.select";
import { assertInternalTaskAccess } from "../tasks/task.access";
import { taskScope } from "../tasks/task.policy";

const commentSelect = {
	id: true,
	taskId: true,
	body: true,
	createdAt: true,
	updatedAt: true,
	author: {
		select: { id: true, name: true, avatarUrl: true, department: true },
	},
} as const satisfies Prisma.CommentSelect;

const commentListSpec: ListSpec = {
	fields: {
		body: { kind: "string" },
		authorId: { kind: "string" },
		createdAt: { kind: "date" },
	},
	filterable: ["authorId"],
	searchable: ["body"],
	rangeable: ["createdAt"],
	sortable: ["createdAt"],
	defaultOrder: { key: "createdAt", rule: "asc" },
};

const notFound = () => new AppError(404, "NOT_FOUND", "Comment not found");

async function findOwnComment(user: AuthUser, id: string, allowPm: boolean) {
	if (user.role === "CLIENT") throw notFound();
	const comment = await prisma.comment.findFirst({
		where: { id, deletedAt: null, task: taskScope(user) },
		select: { authorId: true },
	});
	if (!comment) throw notFound();
	const isAuthor = comment.authorId === user.id;
	if (!isAuthor && !(allowPm && user.role === "PM")) {
		throw new AppError(
			403,
			"FORBIDDEN",
			"Only the comment author can perform this action",
		);
	}
}

export async function listComments(
	user: AuthUser,
	taskId: string,
	rawQuery: Record<string, string | undefined>,
) {
	await assertInternalTaskAccess(user, taskId);
	const q = parseListQuery(rawQuery, commentListSpec);
	const where: Prisma.CommentWhereInput = {
		AND: [q.where as Prisma.CommentWhereInput, { taskId, deletedAt: null }],
	};

	const [entries, total] = await prisma.$transaction([
		prisma.comment.findMany({
			where,
			orderBy: q.orderBy as Prisma.CommentOrderByWithRelationInput[],
			skip: q.skip,
			take: q.take,
			select: commentSelect,
		}),
		prisma.comment.count({ where }),
	]);
	return toPaginated(entries, total, q.rows);
}

export async function createComment(
	user: AuthUser,
	taskId: string,
	body: string,
) {
	await assertInternalTaskAccess(user, taskId);
	return prisma.comment.create({
		data: { taskId, authorId: user.id, body },
		select: commentSelect,
	});
}

export async function updateComment(user: AuthUser, id: string, body: string) {
	await findOwnComment(user, id, false); // edit: author only
	return prisma.comment.update({
		where: { id },
		data: { body },
		select: commentSelect,
	});
}

export async function deleteComment(user: AuthUser, id: string): Promise<void> {
	await findOwnComment(user, id, true); // hapus: author or PM
	await prisma.comment.update({
		where: { id },
		data: { deletedAt: new Date() },
	});
}
