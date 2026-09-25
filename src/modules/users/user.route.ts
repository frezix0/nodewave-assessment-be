import { Hono } from "hono";
import { parseJsonBody } from "../../lib/http";
import { requireAuth, requireRole } from "../../middlewares/auth";
import type { AppEnv } from "../../types/app";
import { createUserSchema } from "./user.schema";
import { createUser } from "./user.service";

export const userRoute = new Hono<AppEnv>().post(
	"/",
	requireAuth,
	requireRole("PM"),
	async (c) => {
		const input = await parseJsonBody(c, createUserSchema);
		const user = await createUser(input);
		return c.json({ success: true, data: user }, 201);
	},
);
