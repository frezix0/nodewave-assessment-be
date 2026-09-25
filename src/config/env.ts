import { z } from "zod";

const envSchema = z.object({
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(86_400),
    CORS_ORIGIN: z.string().default("http://localhost:3000"),
    PORT: z.coerce.number().int().positive().default(3001),
    ALLOW_PUBLIC_REGISTER: z
        .enum(["true", "false"])
        .default("false")
        .transform((v) => v === "true"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error("Invalid configuration:");
    for (const issue of parsed.error.issues) {
        console.error(`- ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
}

export const env = {
    ...parsed.data,
    CORS_ORIGINS: parsed.data.CORS_ORIGIN.split(",").map((o) => o.trim()),
};