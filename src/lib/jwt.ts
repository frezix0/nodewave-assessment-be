import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env";
import { AppError } from "./errors";

const payloadSchema = z.object({
    sub: z.string(),
    tv: z.number().int(),
});

export type AccessTokenPayload = z.infer<typeof payloadSchema>;

export function signAccessToken(userId: string, tokenVersion: number): string {
    return jwt.sign({ tv: tokenVersion }, env.JWT_SECRET, {
        subject: userId,
        expiresIn: env.JWT_EXPIRES_IN_SECONDS,
        algorithm: "HS256",
    });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
    try {
        const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
        return payloadSchema.parse(decoded);
    } catch {
        throw new AppError(401, "UNAUTHENTICATED", "Invalid or expired access token");
    }
}