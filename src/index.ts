import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./config/env";
import { errorHandler } from "./middlewares/error-handler";
import { authRoute } from "./modules/auth/auth.route";
import { clientRoute } from "./modules/clients/client.route";
import { projectRoute } from "./modules/projects/project.route";
import { taskRoute } from "./modules/tasks/task.route";
import { userRoute } from "./modules/users/user.route";
import type { AppEnv } from "./types/app";

const app = new Hono<AppEnv>();

app.use("*", logger());
app.use(
	"*",
	cors({
		origin: env.CORS_ORIGINS,
		allowHeaders: ["Content-Type", "Authorization"],
		allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
	}),
);

app.get("/health", (c) => c.json({ success: true, data: { status: "ok" } }));
app.route("/auth", authRoute);
app.route("/users", userRoute);
app.route("/clients", clientRoute);
app.route("/projects", projectRoute);
app.route("/tasks", taskRoute);

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
