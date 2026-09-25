import { Hono } from "hono";
import { parseJsonBody } from "../../lib/http";
import { requireAuth, requireRole } from "../../middlewares/auth";
import type { AppEnv } from "../../types/app";
import {
	addMemberSchema,
	createProjectSchema,
	updateProjectSchema,
} from "./project.schema";
import {
	addMember,
	createProject,
	deleteProject,
	getProject,
	getProjectProgress,
	listMembers,
	listProjects,
	removeMember,
	updateProject,
} from "./project.service";

export const projectRoute = new Hono<AppEnv>()
	.use("*", requireAuth)
	.get("/", async (c) => {
		return c.json({
			success: true,
			data: await listProjects(c.get("user"), c.req.query()),
		});
	})
	.post("/", requireRole("PM"), async (c) => {
		const input = await parseJsonBody(c, createProjectSchema);
		return c.json({ success: true, data: await createProject(input) }, 201);
	})
	.get("/:id", async (c) => {
		return c.json({
			success: true,
			data: await getProject(c.get("user"), c.req.param("id")),
		});
	})
    .get("/:id/progress", async (c) => {
        return c.json({
            success: true,
            data: await getProjectProgress(c.get("user"), c.req.param("id")),
        });
    })
	.patch("/:id", requireRole("PM"), async (c) => {
		const input = await parseJsonBody(c, updateProjectSchema);
		return c.json({
			success: true,
			data: await updateProject(c.req.param("id"), input),
		});
	})
	.delete("/:id", requireRole("PM"), async (c) => {
		await deleteProject(c.req.param("id"));
		return c.json({ success: true, data: null });
	})
	.get("/:id/members", async (c) => {
		return c.json({
			success: true,
			data: await listMembers(c.get("user"), c.req.param("id")),
		});
	})
	.post("/:id/members", requireRole("PM"), async (c) => {
		const { userId } = await parseJsonBody(c, addMemberSchema);
		return c.json(
			{ success: true, data: await addMember(c.req.param("id"), userId) },
			201,
		);
	})
	.delete("/:id/members/:userId", requireRole("PM"), async (c) => {
		await removeMember(c.req.param("id"), c.req.param("userId"));
		return c.json({ success: true, data: null });
	});
