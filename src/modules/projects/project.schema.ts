import { z } from "zod";

export const createProjectSchema = z.object({
	name: z.string().trim().min(1).max(150),
	description: z.string().trim().max(2000).optional(),
	clientId: z.uuid(),
});

export const updateProjectSchema = z
	.object({
		name: z.string().trim().min(1).max(150).optional(),
		description: z.string().trim().max(2000).nullable().optional(),
	})
	.refine((v) => Object.keys(v).length > 0, {
		message: "At least one field must be provided",
	});

export const addMemberSchema = z.object({
	userId: z.uuid(),
});

export type CreateProjectInput = z.output<typeof createProjectSchema>;
export type UpdateProjectInput = z.output<typeof updateProjectSchema>;
