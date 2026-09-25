import type { Prisma } from "../../generated/prisma/client";
import type { ListSpec } from "../../lib/query";
import type { AuthUser } from "../auth/auth.select";
import { projectScope } from "../projects/project.policy";

export function auditScope(user: AuthUser): Prisma.AuditLogWhereInput {
  return { task: { project: { AND: [projectScope(user), { deletedAt: null }] } } };
}

export const auditListSpec: ListSpec = {
  fields: {
    taskId: { kind: "string" },
    projectId: { kind: "string" },
    userId: { kind: "string" },
    changedColumn: { kind: "string" },
    source: { kind: "enum", values: ["USER", "SYSTEM"] },
    timestamp: { kind: "date" },
  },
  filterable: ["taskId", "projectId", "userId", "changedColumn", "source"],
  searchable: [],
  rangeable: ["timestamp"],
  sortable: ["timestamp"],
  defaultOrder: { key: "timestamp", rule: "desc" },
};