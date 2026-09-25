import { createMiddleware } from "hono/factory";
import { prisma } from "../db/prisma";
import type { Role } from "../generated/prisma/client";
import { AppError } from "../lib/errors";
import { verifyAccessToken } from "../lib/jwt";
import { authUserSelect } from "../modules/auth/auth.select";
import type { AppEnv } from "../types/app";

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
	const header = c.req.header("Authorization");
	if (!header?.startsWith("Bearer ")) {
		throw new AppError(
			401,
			"UNAUTHENTICATED",
			"Token not provided or invalid format",
		);
	}

	const payload = verifyAccessToken(header.slice("Bearer ".length));

	// Role and Token checked on DB
	const user = await prisma.user.findFirst({
		where: { id: payload.sub, deletedAt: null },
		select: authUserSelect,
	});

	if (!user || user.tokenVersion !== payload.tv) {
		throw new AppError(
			401,
			"UNAUTHENTICATED",
			"Session expired or user not found",
		);
	}

	c.set("user", user);
	await next();
});

export const requireRole = (...roles: Role[]) =>
	createMiddleware<AppEnv>(async (c, next) => {
		if (!roles.includes(c.get("user").role)) {
			throw new AppError(
				403,
				"FORBIDDEN",
				"You do not have access to perform this action",
			);
		}
		await next();
	});
