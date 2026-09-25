export const TRACKED_TASK_FIELDS = [
  "title",
  "description",
  "department",
  "status",
  "assigneeId",
  "clientVisible",
  "deletedAt",
] as const;

export type AuditChange = {
  changedColumn: string;
  oldValue: string | null;
  newValue: string | null;
};

export function toAuditValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function diffTaskChanges(before: Record<string, unknown>, changes: Record<string, unknown>): AuditChange[] {
  const rows: AuditChange[] = [];
  for (const field of TRACKED_TASK_FIELDS) {
    if (!(field in changes) || changes[field] === undefined) continue;
    const oldValue = toAuditValue(before[field]);
    const newValue = toAuditValue(changes[field]);
    if (oldValue !== newValue) rows.push({ changedColumn: field, oldValue, newValue });
  }
  return rows;
}