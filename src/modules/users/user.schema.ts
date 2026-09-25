import { z } from "zod";

export const roleEnum = z.enum(["PM", "INTERNAL", "CLIENT"]);
export const departmentEnum = z.enum(["UI_UX", "FRONTEND", "BACKEND"]);

export const userBaseSchema = z.object({
	name: z.string().trim().min(1).max(100),
	email: z.email().transform((v) => v.toLowerCase()),
	password: z.string().min(8).max(128),
});

// Validate role, department, and clientId based on the role
export const createUserSchema = userBaseSchema
	.extend({
		role: roleEnum,
		department: departmentEnum.optional(),
		clientId: z.uuid().optional(),
	})
	.superRefine((v, ctx) => {
		if ((v.role === "INTERNAL") !== (v.department !== undefined)) {
			ctx.addIssue({
				code: "custom",
				path: ["department"],
				message:
					"Department is required for INTERNAL role and must not be provided for other roles",
			});
		}
		if ((v.role === "CLIENT") !== (v.clientId !== undefined)) {
			ctx.addIssue({
				code: "custom",
				path: ["clientId"],
				message:
					"clientId is required for CLIENT role and must not be provided for other roles",
			});
		}
	});

export type CreateUserInput = z.output<typeof createUserSchema>;
