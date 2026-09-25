import type { Role, TaskStatus } from "../../generated/prisma/client";

export type TransitionActor = { id: string; role: Role };
export type TransitionTask = { status: TaskStatus; assigneeId: string | null };
export type PendingPrerequisite = { id: string; title: string; status: TaskStatus };
export type TransitionContext = { pendingPrerequisites: PendingPrerequisite[] };

export type TransitionDenied = {
  ok: false;
  httpStatus: 403 | 422;
  code: string;
  reason: string;
  details?: unknown;
};
export type TransitionResult = { ok: true } | TransitionDenied;

const OK: TransitionResult = { ok: true };
const deny = (httpStatus: 403 | 422, code: string, reason: string, details?: unknown): TransitionDenied => ({
  ok: false,
  httpStatus,
  code,
  reason,
  details,
});

const NO_PREREQUISITES: TransitionContext = { pendingPrerequisites: [] };

export function canTransition(
  actor: TransitionActor,
  task: TransitionTask,
  target: TaskStatus,
  ctx: TransitionContext = NO_PREREQUISITES,
): TransitionResult {
  if (actor.role === "CLIENT") {
    return deny(403, "FORBIDDEN", "Client cannot change task status");
  }

  const isPm = actor.role === "PM";
  const isAssignee = task.assigneeId !== null && task.assigneeId === actor.id;

  if (!isPm && !isAssignee) {
    return deny(403, "NOT_ASSIGNEE", "Only the assignee can change the task status");
  }

  if (target === task.status) {
    return deny(422, "INVALID_TRANSITION", `Task is already in status ${target}`);
  }

  if (task.status === "BLOCKED") {
    return target === "IN_PROGRESS"
      ? deny(422, "TASK_BLOCKED", "Task still has pending prerequisites", {
          pendingPrerequisites: ctx.pendingPrerequisites,
        })
      : deny(422, "SYSTEM_MANAGED_STATUS", "Status BLOCKED is managed automatically by the system");
  }
  if (target === "BLOCKED") {
    return deny(422, "SYSTEM_MANAGED_STATUS", "Status BLOCKED is managed automatically by the system");
  }

  switch (`${task.status}->${target}`) {
    case "TODO->IN_PROGRESS":
      return ctx.pendingPrerequisites.length > 0
        ? deny(422, "TASK_BLOCKED", "Prerequisite is not completed", {
            pendingPrerequisites: ctx.pendingPrerequisites,
          })
        : OK;
    case "IN_PROGRESS->DONE":
      return isAssignee ? OK : deny(403, "NOT_EXECUTOR", "Only executor (assignee) can complete the task");
    case "IN_PROGRESS->TODO":
      return OK;
    case "DONE->IN_PROGRESS":
      return isPm ? OK : deny(403, "FORBIDDEN", "Only Product Manager can reopen the task");
    default:
      return deny(422, "INVALID_TRANSITION", `Transition ${task.status} → ${target} is not allowed`);
  }
}

const USER_TARGETS: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"];

export type AvailableTransition =
  | { target: TaskStatus; allowed: true }
  | { target: TaskStatus; allowed: false; code: string; reason: string };

export function listTransitions(
  actor: TransitionActor,
  task: TransitionTask,
  ctx: TransitionContext = NO_PREREQUISITES,
): AvailableTransition[] {
  return USER_TARGETS.filter((t) => t !== task.status).map((target) => {
    const r = canTransition(actor, task, target, ctx);
    return r.ok ? { target, allowed: true } : { target, allowed: false, code: r.code, reason: r.reason };
  });
}