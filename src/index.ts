import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./config/env";
import { errorHandler } from "./middlewares/error-handler";
import { auditRoute, taskAuditRoute } from "./modules/audit/audit.route";
import { authRoute } from "./modules/auth/auth.route";
import { clientRoute } from "./modules/clients/client.route";
import { dependencyRoute } from "./modules/dependency/dependency.route";
import { projectRoute } from "./modules/projects/project.route";
import { taskRoute } from "./modules/tasks/task.route";
import { userRoute } from "./modules/users/user.route";
import { attachmentRoute, taskAttachmentRoute } from "./modules/attachment/attachment.route";
import { commentRoute, taskCommentRoute } from "./modules/comment/comment.route";
import type { AppEnv } from "./types/app";

const app = new Hono<AppEnv>();

app.use("*", logger());
app.use(
	"*",
	cors({
		origin: env.CORS_ORIGINS,
		allowHeaders: ["Content-Type", "Authorization"],
		allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
		exposeHeaders: ["Content-Disposition"],
	}),
);

app.get("/health", (c) => c.json({ success: true, data: { status: "ok" } }));
app.route("/auth", authRoute);
app.route("/users", userRoute);
app.route("/clients", clientRoute);
app.route("/projects", projectRoute);
app.route("/tasks", taskRoute);
app.route("/tasks", dependencyRoute);
app.route("/tasks", taskAuditRoute);
app.route("/tasks", taskAttachmentRoute);
app.route("/tasks", taskCommentRoute);
app.route("/attachments", attachmentRoute);
app.route("/comments", commentRoute);
app.route("/audit-logs", auditRoute);

app.notFound((c) =>
	c.json(
		{
			success: false,
			error: { code: "NOT_FOUND", message: "Endpoint not found" },
		},
		404,
	),
);
app.onError(errorHandler);

export default {
	port: env.PORT,
	fetch: app.fetch,
};
