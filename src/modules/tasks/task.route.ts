import { Hono } from "hono";
import { parseJsonBody } from "../../lib/http";
import { requireAuth, requireRole } from "../../middlewares/auth";
import type { AppEnv } from "../../types/app";
import {
	changeStatusSchema,
	createTaskSchema,
	deleteTaskQuerySchema,
	updateTaskSchema,
} from "./task.schema";
import {
	changeTaskStatus,
	createTask,
	deleteTask,
	getTask,
	listTasks,
	updateTask,
} from "./task.service";

export const taskRoute = new Hono<AppEnv>()
	.use("*", requireAuth)
	.get("/", async (c) => {
		return c.json({
			success: true,
			data: await listTasks(c.get("user"), c.req.query()),
		});
	})
	.post("/", requireRole("PM"), async (c) => {
		const input = await parseJsonBody(c, createTaskSchema);
		return c.json(
			{ success: true, data: await createTask(c.get("user"), input) },
			201,
		);
	})
	.get("/:id", async (c) => {
		return c.json({
			success: true,
			data: await getTask(c.get("user"), c.req.param("id")),
		});
	})
	.patch("/:id", requireRole("PM"), async (c) => {
		const input = await parseJsonBody(c, updateTaskSchema);
		return c.json({
			success: true,
			data: await updateTask(c.get("user"), c.req.param("id"), input),
		});
	})
	.patch("/:id/status", async (c) => {
		const input = await parseJsonBody(c, changeStatusSchema);
		return c.json({
			success: true,
			data: await changeTaskStatus(c.get("user"), c.req.param("id"), input),
		});
	})
	.delete("/:id", requireRole("PM"), async (c) => {
		const { version } = deleteTaskQuerySchema.parse(c.req.query());
		await deleteTask(c.get("user"), c.req.param("id"), version);
		return c.json({ success: true, data: null });
	});
