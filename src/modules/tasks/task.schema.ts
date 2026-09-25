import { z } from "zod";
import { departmentEnum } from "../users/user.schema";

export const taskStatusEnum = z.enum([
	"TODO",
	"IN_PROGRESS",
	"BLOCKED",
	"DONE",
]);
const version = z.number().int().positive();

export const createTaskSchema = z.object({
	projectId: z.uuid(),
	title: z.string().trim().min(1).max(200),
	description: z.string().trim().max(5000).default(""),
	department: departmentEnum,
	assigneeId: z.uuid().nullable().optional(),
	clientVisible: z.boolean().default(false),
});

// PM only. `version` optimistic locking.
export const updateTaskSchema = z
	.object({
		version,
		title: z.string().trim().min(1).max(200).optional(),
		description: z.string().trim().max(5000).optional(),
		department: departmentEnum.optional(),
		assigneeId: z.uuid().nullable().optional(),
		clientVisible: z.boolean().optional(),
	})
	.refine((v) => Object.keys(v).length > 1, {
		message: "At least one field other than version must be provided",
	});

export const changeStatusSchema = z.object({
	status: taskStatusEnum,
	version,
});

export const deleteTaskQuerySchema = z.object({
	version: z.coerce.number().int().positive(),
});

export type CreateTaskInput = z.output<typeof createTaskSchema>;
export type UpdateTaskInput = z.output<typeof updateTaskSchema>;
export type ChangeStatusInput = z.output<typeof changeStatusSchema>;
