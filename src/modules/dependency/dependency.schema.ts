import { z } from "zod";

export const addDependencySchema = z.object({
    dependsOnId: z.uuid(),
});