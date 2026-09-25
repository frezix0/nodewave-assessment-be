import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client";
import { AppError } from "../lib/errors";
import type { AppEnv } from "../types/app";

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
    if (err instanceof AppError) {
        return c.json(
            { success: false, error: { code: err.code, message: err.message, details: err.details } },
            err.status,
        );
    }

    if (err instanceof ZodError) {
        return c.json(
            {
                success: false,
                error: {
                    code: "VALIDATION_ERROR",
                    message: "Input tidak valid",
                    details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
                },
            },
            400,
        );
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return c.json({ success: false, error: { code: "CONFLICT", message: "Data sudah ada" } }, 409);
    }

    if (err instanceof HTTPException) {
        return err.getResponse();
    }

    console.error(err);
    return c.json(
        { success: false, error: { code: "INTERNAL_ERROR", message: "Terjadi kesalahan pada server" } },
        500,
    );
};