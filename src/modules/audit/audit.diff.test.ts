import { describe, expect, test } from "bun:test";
import { diffTaskChanges, toAuditValue } from "./audit.diff";

const before = {
	title: "Frontend slicing",
	description: "",
	department: "FRONTEND",
	status: "IN_PROGRESS",
	assigneeId: "user-fe",
	clientVisible: false,
	deletedAt: null,
};

describe("diffTaskChanges", () => {
	test("mencatat perubahan status sesuai contoh brief", () => {
		expect(diffTaskChanges(before, { status: "DONE" })).toEqual([
			{ changedColumn: "status", oldValue: "IN_PROGRESS", newValue: "DONE" },
		]);
	});

	test("satu baris per kolom yang berubah", () => {
		const rows = diffTaskChanges(before, {
			description: "Baru",
			assigneeId: "user-2",
		});
		expect(rows.map((r) => r.changedColumn)).toEqual([
			"description",
			"assigneeId",
		]);
	});

	test("nilai yang sama tidak dicatat", () => {
		expect(
			diffTaskChanges(before, {
				title: "Frontend slicing",
				status: "IN_PROGRESS",
			}),
		).toEqual([]);
	});

	test("unassign dicatat sebagai newValue null", () => {
		expect(diffTaskChanges(before, { assigneeId: null })).toEqual([
			{ changedColumn: "assigneeId", oldValue: "user-fe", newValue: null },
		]);
	});

	test("boolean dan soft delete diserialisasi", () => {
		const deletedAt = new Date("2026-09-24T10:30:00Z");
		expect(diffTaskChanges(before, { clientVisible: true, deletedAt })).toEqual(
			[
				{ changedColumn: "clientVisible", oldValue: "false", newValue: "true" },
				{
					changedColumn: "deletedAt",
					oldValue: null,
					newValue: "2026-09-24T10:30:00.000Z",
				},
			],
		);
	});

	test("field yang tidak dilacak (version) diabaikan", () => {
		expect(diffTaskChanges(before, { version: 7 })).toEqual([]);
	});
});

describe("toAuditValue", () => {
	test("serialisasi berbagai tipe", () => {
		expect(toAuditValue(undefined)).toBeNull();
		expect(toAuditValue(3)).toBe("3");
		expect(toAuditValue({ a: 1 })).toBe('{"a":1}');
	});
});
