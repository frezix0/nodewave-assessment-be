import type { Prisma } from "../../generated/prisma/client";

export const taskInternalSelect = {
	id: true,
	projectId: true,
	title: true,
	description: true,
	department: true,
	status: true,
	clientVisible: true,
	version: true,
	assigneeId: true,
	assignee: {
		select: { id: true, name: true, avatarUrl: true, department: true },
	},
	createdBy: { select: { id: true, name: true } },
	createdAt: true,
	updatedAt: true,
} as const satisfies Prisma.TaskSelect;

// Client Guest: without department, version, assigneeId, createdBy
export const taskClientSelect = {
	id: true,
	projectId: true,
	title: true,
	description: true,
	status: true,
	createdAt: true,
	updatedAt: true,
} as const satisfies Prisma.TaskSelect;
