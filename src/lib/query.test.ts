import { describe, expect, test } from "bun:test";
import { AppError } from "./errors";
import { type ListSpec, parseListQuery } from "./query";

const spec: ListSpec = {
	fields: {
		title: { kind: "string" },
		description: { kind: "string" },
		status: {
			kind: "enum",
			values: ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"],
		},
		clientVisible: { kind: "boolean" },
		points: { kind: "number" },
		createdAt: { kind: "date" },
	},
	filterable: ["status", "clientVisible"],
	searchable: ["title", "description"],
	rangeable: ["createdAt", "points"],
	sortable: ["title", "createdAt"],
	defaultOrder: { key: "createdAt", rule: "desc" },
};

const parse = (query: Record<string, string>) => parseListQuery(query, spec);

function expectInvalid(query: Record<string, string>, message?: RegExp) {
	try {
		parse(query);
	} catch (err) {
		expect(err).toBeInstanceOf(AppError);
		expect((err as AppError).status).toBe(400);
		expect((err as AppError).code).toBe("INVALID_QUERY");
		if (message) expect((err as AppError).message).toMatch(message);
		return;
	}
	throw new Error(`expected INVALID_QUERY for ${JSON.stringify(query)}`);
}

describe("parseListQuery — pagination & ordering", () => {
	test("defaults: page 1, 10 rows, default order with id tiebreaker", () => {
		const q = parse({});
		expect(q.skip).toBe(0);
		expect(q.take).toBe(10);
		expect(q.orderBy).toEqual([{ createdAt: "desc" }, { id: "asc" }]);
	});

	test("page/rows translate to skip/take", () => {
		const q = parse({ page: "3", rows: "20" });
		expect(q.skip).toBe(40);
		expect(q.take).toBe(20);
	});

	test.each([
		[{ page: "0" }, /page/],
		[{ page: "-1" }, /page/],
		[{ rows: "0" }, /rows/],
		[{ rows: "101" }, /rows/],
		[{ rows: "abc" }, /rows/],
		[{ orderKey: "description" }, /Sort/],
		[{ orderRule: "sideways" }, /orderRule/],
	])("rejects %p", (query, message) => expectInvalid(query, message));

	test("orderKey without orderRule sorts ascending", () => {
		expect(parse({ orderKey: "title" }).orderBy).toEqual([
			{ title: "asc" },
			{ id: "asc" },
		]);
	});
});

describe("parseListQuery — filters", () => {
	test("exact filter and multi-value OR filter", () => {
		const where = JSON.stringify(
			parse({ filters: JSON.stringify({ status: ["TODO", "BLOCKED"] }) }).where,
		);
		expect(where).toContain("TODO");
		expect(where).toContain("BLOCKED");
	});

	test("empty array and null values are ignored", () => {
		expect(
			parse({ filters: JSON.stringify({ status: [], clientVisible: null }) })
				.where,
		).toEqual(parse({}).where);
	});

	test.each([
		[{ filters: "{not json" }, /filters is not valid JSON/],
		[{ filters: "[]" }, /object/],
		[{ filters: JSON.stringify({ title: "x" }) }, /not allowed/],
		[{ filters: JSON.stringify({ status: "ARCHIVED" }) }, /not valid/],
		[{ filters: JSON.stringify({ clientVisible: "yes" }) }, /not valid/],
	])("rejects %p", (query, message) => expectInvalid(query, message));
});

describe("parseListQuery — search", () => {
	test("empty search value is ignored", () => {
		expect(
			parse({ searchFilters: JSON.stringify({ title: "   " }) }).where,
		).toEqual(parse({}).where);
	});

	test("search is case-insensitive contains on the requested columns", () => {
		const where = JSON.stringify(
			parse({
				searchFilters: JSON.stringify({ title: "Dash", description: "Dash" }),
			}).where,
		);
		expect(where).toContain("Dash");
		expect(where).toContain("insensitive");
	});

	test.each([
		[{ searchFilters: "nope" }, /searchFilters is not valid JSON/],
		[{ searchFilters: JSON.stringify({ status: "TODO" }) }, /not allowed/],
		[{ searchFilters: JSON.stringify({ title: "x".repeat(101) }) }, /100/],
	])("rejects %p", (query, message) => expectInvalid(query, message));
});

describe("parseListQuery — ranged filters", () => {
	test("inclusive date range", () => {
		const where = JSON.stringify(
			parse({
				rangedFilters: JSON.stringify([
					{
						key: "createdAt",
						start: "2026-01-01T00:00:00Z",
						end: "2026-01-31T23:59:59Z",
					},
				]),
			}).where,
		);
		expect(where).toContain("2026-01-01T00:00:00.000Z");
		expect(where).toContain("2026-01-31T23:59:59.000Z");
	});

	test.each([
		[{ rangedFilters: "{}" }, /array/],
		[
			{
				rangedFilters: JSON.stringify([{ key: "title", start: "a", end: "b" }]),
			},
			/not allowed/,
		],
		[
			{ rangedFilters: JSON.stringify([{ key: "points", start: 10, end: 5 }]) },
			/start must not be greater/,
		],
		[
			{
				rangedFilters: JSON.stringify([
					{ key: "createdAt", start: "2026-02-01", end: "2026-01-01" },
				]),
			},
			/start must not be greater/,
		],
		[
			{
				rangedFilters: JSON.stringify([
					{ key: "createdAt", start: "yesterday", end: "today" },
				]),
			},
			/ISO 8601/,
		],
		[
			{
				rangedFilters: JSON.stringify([{ key: "points", start: "1", end: 2 }]),
			},
			/number/,
		],
	])("rejects %p", (query, message) => expectInvalid(query, message));
});

describe("parseListQuery — combined", () => {
	test("filter + search + range + pagination + ordering in one request", () => {
		const q = parse({
			filters: JSON.stringify({ status: "IN_PROGRESS" }),
			searchFilters: JSON.stringify({ title: "api" }),
			rangedFilters: JSON.stringify([{ key: "points", start: 1, end: 8 }]),
			page: "2",
			rows: "5",
			orderKey: "title",
			orderRule: "desc",
		});
		const where = JSON.stringify(q.where);
		expect(where).toContain("IN_PROGRESS");
		expect(where).toContain("api");
		expect(q.skip).toBe(5);
		expect(q.orderBy).toEqual([{ title: "desc" }, { id: "asc" }]);
	});
});
