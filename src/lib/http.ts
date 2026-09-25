import type { Context } from "hono";
import type { z } from "zod";
import { AppError } from "./errors";

export async function parseJsonBody<T extends z.ZodType>(c: Context, schema: T): Promise<z.output<T>> {
    let raw: unknown;
    try {
        raw = await c.req.json();
    } catch {
        throw new AppError(400, "INVALID_JSON", "Request body is not valid JSON");
    }
    return schema.parse(raw);
}