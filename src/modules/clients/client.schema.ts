import { z } from "zod";

export const createClientSchema = z.object({
    name: z.string().trim().min(1).max(150),
});

export type CreateClientInput = z.output<typeof createClientSchema>;