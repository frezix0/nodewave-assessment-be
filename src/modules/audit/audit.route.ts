import { Hono } from "hono";
import { requireAuth, requireRole } from "../../middlewares/auth";
import type { AppEnv } from "../../types/app";
import { listAuditLogs, listTaskAuditLogs } from "./audit.service";

const guard = [requireAuth, requireRole("PM", "INTERNAL")] as const;

export const auditRoute = new Hono<AppEnv>()
	.use("*", ...guard)
	.get("/", async (c) => {
		return c.json({
			success: true,
			data: await listAuditLogs(c.get("user"), c.req.query()),
		});
	});

export const taskAuditRoute = new Hono<AppEnv>().get(
	"/:id/audit-logs",
	...guard,
	async (c) => {
		const data = await listTaskAuditLogs(
			c.get("user"),
			c.req.param("id"),
			c.req.query(),
		);
		return c.json({ success: true, data });
	},
);
