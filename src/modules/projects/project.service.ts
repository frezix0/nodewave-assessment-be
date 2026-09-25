import { prisma } from "../../db/prisma";
import type { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../lib/errors";
import { parseListQuery, toPaginated } from "../../lib/query";
import type { AuthUser } from "../auth/auth.select";
import { projectListSpec, projectScope } from "./project.policy";
import type { CreateProjectInput, UpdateProjectInput } from "./project.schema";
import {
	memberSelect,
	projectClientSelect,
	projectInternalSelect,
} from "./project.select";

const notFound = () =>
	new AppError(404, "NOT_FOUND", "Project not found or deleted");

function scopedWhere(
	user: AuthUser,
	extra: Prisma.ProjectWhereInput,
): Prisma.ProjectWhereInput {
	return { AND: [extra, projectScope(user), { deletedAt: null }] };
}

/** Dipakai modul lain (task, M3) untuk memastikan project bisa diakses user ini. */
export async function assertProjectAccessible(
	user: AuthUser,
	projectId: string,
): Promise<void> {
	const project = await prisma.project.findFirst({
		where: scopedWhere(user, { id: projectId }),
		select: { id: true },
	});
	if (!project) throw notFound();
}

export async function listProjects(
	user: AuthUser,
	rawQuery: Record<string, string | undefined>,
) {
	const q = parseListQuery(rawQuery, projectListSpec(user));
	const where = scopedWhere(user, q.where as Prisma.ProjectWhereInput);
	const paging = {
		where,
		orderBy: q.orderBy as Prisma.ProjectOrderByWithRelationInput[],
		skip: q.skip,
		take: q.take,
	};

	if (user.role === "CLIENT") {
		const [entries, total] = await prisma.$transaction([
			prisma.project.findMany({ ...paging, select: projectClientSelect }),
			prisma.project.count({ where }),
		]);
		return toPaginated(entries, total, q.rows);
	}

	const [entries, total] = await prisma.$transaction([
		prisma.project.findMany({ ...paging, select: projectInternalSelect }),
		prisma.project.count({ where }),
	]);
	return toPaginated(entries, total, q.rows);
}

export async function getProject(user: AuthUser, id: string) {
	const where = scopedWhere(user, { id });
	const project =
		user.role === "CLIENT"
			? await prisma.project.findFirst({ where, select: projectClientSelect })
			: await prisma.project.findFirst({
					where,
					select: projectInternalSelect,
				});
	if (!project) throw notFound();
	return project;
}

export async function getProjectProgress(user: AuthUser, projectId: string) {
    await assertProjectAccessible(user, projectId);
    const where = { projectId, deletedAt: null };
    const [total, done] = await prisma.$transaction([
        prisma.task.count({ where }),
        prisma.task.count({ where: { ...where, status: "DONE" } }),
    ]);
    return { total, done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export async function createProject(input: CreateProjectInput) {
	const client = await prisma.client.findFirst({
		where: { id: input.clientId, deletedAt: null },
		select: { id: true },
	});
	if (!client)
		throw new AppError(422, "CLIENT_NOT_FOUND", "Client not found or deleted");

	return prisma.project.create({ data: input, select: projectInternalSelect });
}

export async function updateProject(id: string, input: UpdateProjectInput) {
	const res = await prisma.project.updateMany({
		where: { id, deletedAt: null },
		data: input,
	});
	if (res.count === 0) throw notFound();
	return prisma.project.findFirstOrThrow({
		where: { id },
		select: projectInternalSelect,
	});
}

export async function deleteProject(id: string): Promise<void> {
	const res = await prisma.project.updateMany({
		where: { id, deletedAt: null },
		data: { deletedAt: new Date() },
	});
	if (res.count === 0) throw notFound();
}

export async function listMembers(user: AuthUser, projectId: string) {
	// Data internal hideden from client guest
	if (user.role === "CLIENT") throw notFound();
	await assertProjectAccessible(user, projectId);

	return prisma.projectMember.findMany({
		where: { projectId, deletedAt: null, user: { deletedAt: null } },
		select: memberSelect,
		orderBy: { createdAt: "asc" },
	});
}

export async function addMember(projectId: string, userId: string) {
	const project = await prisma.project.findFirst({
		where: { id: projectId, deletedAt: null },
		select: { id: true },
	});
	if (!project) throw notFound();

	const user = await prisma.user.findFirst({
		where: { id: userId, deletedAt: null },
		select: { role: true },
	});
	if (!user) throw new AppError(404, "NOT_FOUND", "User not found or deleted");
	if (user.role !== "INTERNAL") {
		throw new AppError(
			422,
			"MEMBER_MUST_BE_INTERNAL",
			"Internal user only can be added as project member",
		);
	}

	// Soft delete
	return prisma.projectMember.upsert({
		where: { projectId_userId: { projectId, userId } },
		update: { deletedAt: null },
		create: { projectId, userId },
		select: memberSelect,
	});
}

export async function removeMember(
	projectId: string,
	userId: string,
): Promise<void> {
	const res = await prisma.projectMember.updateMany({
		where: { projectId, userId, deletedAt: null },
		data: { deletedAt: new Date() },
	});
	if (res.count === 0)
		throw new AppError(404, "NOT_FOUND", "Member not found or already deleted");
}
