import { Hono } from "hono";
import { parseJsonBody } from "../../lib/http";
import { requireAuth, requireRole } from "../../middlewares/auth";
import type { AppEnv } from "../../types/app";
import { addDependencySchema } from "./dependency.schema";
import {
	addDependency,
	listDependencies,
	removeDependency,
} from "./dependency.service";

export const dependencyRoute = new Hono<AppEnv>()
	.use("*", requireAuth)
	.get("/:id/dependencies", async (c) => {
		return c.json({
			success: true,
			data: await listDependencies(c.get("user"), c.req.param("id")),
		});
	})
	.post("/:id/dependencies", requireRole("PM"), async (c) => {
		const { dependsOnId } = await parseJsonBody(c, addDependencySchema);
		const data = await addDependency(
			c.get("user"),
			c.req.param("id"),
			dependsOnId,
		);
		return c.json({ success: true, data }, 201);
	})
	.delete("/:id/dependencies/:dependsOnId", requireRole("PM"), async (c) => {
		const data = await removeDependency(
			c.get("user"),
			c.req.param("id"),
			c.req.param("dependsOnId"),
		);
		return c.json({ success: true, data });
	});
