import { z } from "zod";
import { departmentEnum, userBaseSchema } from "../users/user.schema";

// role & clientId sengaja TIDAK diterima dari body register publik
export const registerSchema = userBaseSchema.extend({
	department: departmentEnum,
});

export const loginSchema = z.object({
	email: z.email().transform((v) => v.toLowerCase()),
	password: z.string().min(1),
});

export type RegisterInput = z.output<typeof registerSchema>;
export type LoginInput = z.output<typeof loginSchema>;
