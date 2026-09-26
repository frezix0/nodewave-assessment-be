import { Hono } from "hono";
import { parseJsonBody } from "../../lib/http";
import { requireAuth } from "../../middlewares/auth";
import type { AppEnv } from "../../types/app";
import { commentBodySchema } from "./comment.schema";
import {
	createComment,
	deleteComment,
	listComments,
	updateComment,
} from "./comment.service";

export const taskCommentRoute = new Hono<AppEnv>()
	.get("/:id/comments", requireAuth, async (c) => {
		const data = await listComments(
			c.get("user"),
			c.req.param("id"),
			c.req.query(),
		);
		return c.json({ success: true, data });
	})
	.post("/:id/comments", requireAuth, async (c) => {
		const { body } = await parseJsonBody(c, commentBodySchema);
		return c.json(
			{
				success: true,
				data: await createComment(c.get("user"), c.req.param("id"), body),
			},
			201,
		);
	});

export const commentRoute = new Hono<AppEnv>()
	.use("*", requireAuth)
	.patch("/:id", async (c) => {
		const { body } = await parseJsonBody(c, commentBodySchema);
		return c.json({
			success: true,
			data: await updateComment(c.get("user"), c.req.param("id"), body),
		});
	})
	.delete("/:id", async (c) => {
		await deleteComment(c.get("user"), c.req.param("id"));
		return c.json({ success: true, data: null });
	});
