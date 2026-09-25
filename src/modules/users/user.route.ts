import { Hono } from "hono";
import { parseJsonBody } from "../../lib/http";
import { requireAuth, requireRole } from "../../middlewares/auth";
import type { AppEnv } from "../../types/app";
import { listUsers } from "./user.list";
import { createUserSchema } from "./user.schema";
import { createUser } from "./user.service";

export const userRoute = new Hono<AppEnv>()
	.use("*", requireAuth, requireRole("PM"))
	.get("/", async (c) => {
		return c.json({
			success: true,
			data: await listUsers(c.req.query()),
		});
	})
	.post("/", async (c) => {
		const input = await parseJsonBody(c, createUserSchema);
		return c.json({ success: true, data: await createUser(input) }, 201);
	});
