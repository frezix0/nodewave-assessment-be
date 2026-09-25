import { Hono } from "hono";
import { env } from "../../config/env";
import { AppError } from "../../lib/errors";
import { parseJsonBody } from "../../lib/http";
import { requireAuth } from "../../middlewares/auth";
import type { AppEnv } from "../../types/app";
import { toPublicUser } from "./auth.select";
import { loginSchema, registerSchema } from "./auth.schema";
import { login, logout, registerInternal } from "./auth.service";

export const authRoute = new Hono<AppEnv>()
    .post("/register", async (c) => {
        if (!env.ALLOW_PUBLIC_REGISTER) {
        throw new AppError(403, "REGISTRATION_DISABLED", "Register user is disabled");
        }
        const input = await parseJsonBody(c, registerSchema);
        const user = await registerInternal(input);
        return c.json({ success: true, data: user }, 201);
    })
    .post("/login", async (c) => {
        const input = await parseJsonBody(c, loginSchema);
        const result = await login(input);
        return c.json({ success: true, data: result });
    })
    .post("/logout", requireAuth, async (c) => {
        await logout(c.get("user").id);
        return c.json({ success: true, data: null });
    })
    .get("/me", requireAuth, (c) => {
        return c.json({ success: true, data: toPublicUser(c.get("user")) });
    });