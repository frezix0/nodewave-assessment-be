import { describe, expect, test } from "bun:test";
import {
	canTransition,
	listTransitions,
	type TransitionActor,
	type TransitionTask,
} from "./task.transitions";

const pm: TransitionActor = { id: "pm", role: "PM" };
const fe: TransitionActor = { id: "fe", role: "INTERNAL" };
const be: TransitionActor = { id: "be", role: "INTERNAL" };
const client: TransitionActor = { id: "client", role: "CLIENT" };

const task = (
	status: TransitionTask["status"],
	assigneeId: string | null = "fe",
): TransitionTask => ({
	status,
	assigneeId,
});

const code = (r: ReturnType<typeof canTransition>) => (r.ok ? "OK" : r.code);

describe("canTransition", () => {
	test("assignee begin task TODO", () => {
		expect(code(canTransition(fe, task("TODO"), "IN_PROGRESS"))).toBe("OK");
	});

	test("PM can begin task TODO", () => {
		expect(code(canTransition(pm, task("TODO"), "IN_PROGRESS"))).toBe("OK");
	});

	test("assignee can complete task", () => {
		expect(code(canTransition(fe, task("IN_PROGRESS"), "DONE"))).toBe("OK");
	});

	test("PM cannot transition IN_PROGRESS -> DONE (only executor)", () => {
		expect(code(canTransition(pm, task("IN_PROGRESS"), "DONE"))).toBe(
			"NOT_EXECUTOR",
		);
	});

	test("task without assignee cannot be marked as DONE by anyone", () => {
		expect(code(canTransition(pm, task("IN_PROGRESS", null), "DONE"))).toBe(
			"NOT_EXECUTOR",
		);
	});

	test("internal non-assignee rejected", () => {
		expect(code(canTransition(be, task("TODO"), "IN_PROGRESS"))).toBe(
			"NOT_ASSIGNEE",
		);
	});

	test("client always rejected", () => {
		expect(code(canTransition(client, task("TODO"), "IN_PROGRESS"))).toBe(
			"FORBIDDEN",
		);
	});

	test("only PM can reopen DONE -> IN_PROGRESS", () => {
		expect(code(canTransition(pm, task("DONE"), "IN_PROGRESS"))).toBe("OK");
		expect(code(canTransition(fe, task("DONE"), "IN_PROGRESS"))).toBe(
			"FORBIDDEN",
		);
	});

	test("IN_PROGRESS -> TODO can be done by assignee and PM", () => {
		expect(code(canTransition(fe, task("IN_PROGRESS"), "TODO"))).toBe("OK");
		expect(code(canTransition(pm, task("IN_PROGRESS"), "TODO"))).toBe("OK");
	});

	test("from TODO -> DONE rejected", () => {
		expect(code(canTransition(fe, task("TODO"), "DONE"))).toBe(
			"INVALID_TRANSITION",
		);
	});

	test("same status rejected", () => {
		expect(code(canTransition(fe, task("TODO"), "TODO"))).toBe(
			"INVALID_TRANSITION",
		);
	});

	test("BLOCKED cannot be set manually", () => {
		expect(code(canTransition(pm, task("TODO"), "BLOCKED"))).toBe(
			"SYSTEM_MANAGED_STATUS",
		);
	});

	test("task BLOCKED cannot be started", () => {
		expect(code(canTransition(fe, task("BLOCKED"), "IN_PROGRESS"))).toBe(
			"TASK_BLOCKED",
		);
		expect(code(canTransition(pm, task("BLOCKED"), "TODO"))).toBe(
			"SYSTEM_MANAGED_STATUS",
		);
	});

	test("prerequisite have not DONE reject TODO -> IN_PROGRESS", () => {
		const ctx = {
			pendingPrerequisites: [
				{ id: "a", title: "UI Design", status: "IN_PROGRESS" as const },
			],
		};
		const r = canTransition(fe, task("TODO"), "IN_PROGRESS", ctx);
		expect(code(r)).toBe("TASK_BLOCKED");
		expect(r.ok ? null : r.details).toEqual({
			pendingPrerequisites: ctx.pendingPrerequisites,
		});
	});
});

describe("listTransitions", () => {
	test("provide reasons for each rejected target", () => {
		const list = listTransitions(pm, task("IN_PROGRESS"));
		expect(list).toEqual([
			{ target: "TODO", allowed: true },
			{
				target: "DONE",
				allowed: false,
				code: "NOT_EXECUTOR",
				reason: "Only executor (assignee) can complete the task",
			},
		]);
	});
});
