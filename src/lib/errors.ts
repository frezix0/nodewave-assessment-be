import type { ContentfulStatusCode } from "hono/utils/http-status";

export class AppError extends Error {
    readonly status: ContentfulStatusCode;
    readonly code: string;
    readonly details?: unknown;

    constructor(status: ContentfulStatusCode, code: string, message: string, details?: unknown) {
        super(message);
        this.name = "AppError";
        this.status = status;
        this.code = code;
        this.details = details;
    }
}