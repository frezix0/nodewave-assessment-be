import { Hono } from "hono";
import { parseJsonBody } from "../../lib/http";
import { requireAuth, requireRole } from "../../middlewares/auth";
import type { AppEnv } from "../../types/app";
import { createClientSchema } from "./client.schema";
import { createClient, listClients } from "./client.service";

export const clientRoute = new Hono<AppEnv>()
  .use("*", requireAuth, requireRole("PM"))
  .get("/", async (c) => {
    return c.json({ success: true, data: await listClients(c.req.query()) });
  })
  .post("/", async (c) => {
    const input = await parseJsonBody(c, createClientSchema);
    return c.json({ success: true, data: await createClient(input) }, 201);
  });