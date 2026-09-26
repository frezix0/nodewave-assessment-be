import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { AppError } from "../../lib/errors";
import { requireAuth } from "../../middlewares/auth";
import type { AppEnv } from "../../types/app";
import { MAX_ATTACHMENT_BYTES } from "./attachment.config";
import {
	deleteAttachment,
	downloadAttachment,
	listAttachments,
	uploadAttachment,
} from "./attachment.service";

// Maximum file size is 5 MB, but we allow a bit more for multipart overhead (64 KB)
const uploadLimit = bodyLimit({
	maxSize: MAX_ATTACHMENT_BYTES + 64 * 1024,
	onError: () => {
		throw new AppError(413, "FILE_TOO_LARGE", "Maximum file size is 5 MB");
	},
});

export const taskAttachmentRoute = new Hono<AppEnv>()
	.get("/:id/attachments", requireAuth, async (c) => {
		return c.json({
			success: true,
			data: await listAttachments(c.get("user"), c.req.param("id")),
		});
	})
	.post("/:id/attachments", requireAuth, uploadLimit, async (c) => {
		const body = await c.req.parseBody();
		const file = body.file;
		if (!(file instanceof File)) {
			throw new AppError(
				400,
				"FILE_REQUIRED",
				"Please upload a file via the 'file' multipart field",
			);
		}
		const data = await uploadAttachment(c.get("user"), c.req.param("id"), file);
		return c.json({ success: true, data }, 201);
	});

export const attachmentRoute = new Hono<AppEnv>()
	.use("*", requireAuth)
	.get("/:id/download", async (c) => {
		const file = await downloadAttachment(c.get("user"), c.req.param("id"));
		return c.body(file.data, 200, {
			"Content-Type": file.mimeType,
			"Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
			// Prevent browsers from sniffing the content type, which can be a security risk
			"X-Content-Type-Options": "nosniff",
			"Cache-Control": "private, no-store",
		});
	})
	.delete("/:id", async (c) => {
		await deleteAttachment(c.get("user"), c.req.param("id"));
		return c.json({ success: true, data: null });
	});
