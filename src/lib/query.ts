import { BuildQueryFilter, type RangedFilter } from "@nodewave/prisma-ezfilter";
import { AppError } from "./errors";

export type FieldType =
    | { kind: "string" }
    | { kind: "number" }
    | { kind: "boolean" }
    | { kind: "date" }
    | { kind: "enum"; values: readonly string[] };

export type OrderRule = "asc" | "desc";

export type ListSpec = {
    fields: Record<string, FieldType>;
    filterable: readonly string[];
    searchable: readonly string[];
    rangeable: readonly string[];
    sortable: readonly string[];
    defaultOrder: { key: string; rule: OrderRule };
};

export type ParsedListQuery = {
    where: Record<string, unknown>;
    orderBy: Record<string, OrderRule>[];
    skip: number;
    take: number;
    rows: number;
};

type Scalar = string | number | boolean;

const DEFAULT_ROWS = 10;
const MAX_ROWS = 100;
const MAX_SEARCH_LENGTH = 100;
const MAX_RANGED_FILTERS = 5;

const builder = new BuildQueryFilter({ defaultSearchMode: "insensitive" });

const invalid = (message: string) => new AppError(400, "INVALID_QUERY", message);

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isOrderRule(v: string): v is OrderRule {
    return v === "asc" || v === "desc";
}

function parseJsonParam(raw: string | undefined, name: string): unknown {
    if (raw === undefined || raw.trim() === "") return undefined;
    try {
        return JSON.parse(raw);
    } catch {
        throw invalid(`${name} is not valid JSON`);
    }
}

function fieldType(spec: ListSpec, key: string): FieldType {
    const type = spec.fields[key];
    if (!type) throw invalid(`Field '${key}' unknown`);
    return type;
}

function checkScalar(key: string, type: FieldType, value: unknown): Scalar {
    switch (type.kind) {
        case "string":
            if (typeof value === "string") return value;
            break;
        case "number":
            if (typeof value === "number" && Number.isFinite(value)) return value;
            break;
        case "boolean":
            if (typeof value === "boolean") return value;
            break;
        case "enum":
            if (typeof value === "string" && type.values.includes(value)) return value;
            break;
        case "date":
            throw invalid(`Field '${key}' only supports range filters, not scalar values`);
    }
    throw invalid(`Value for filter '${key}' is not valid`);
}

function parseFilters(raw: unknown, spec: ListSpec): Record<string, Scalar | Scalar[]> | undefined {
    if (raw === undefined) return undefined;
    if (!isPlainObject(raw)) throw invalid("Filters must be an object");

    const result: Record<string, Scalar | Scalar[]> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (!spec.filterable.includes(key)) throw invalid(`Filter '${key}' is not allowed`);
        if (value === null) continue;
        const type = fieldType(spec, key);
        if (Array.isArray(value)) {
        if (value.length === 0) continue;
            result[key] = value.map((v) => checkScalar(key, type, v));
        } else {
            result[key] = checkScalar(key, type, value);
        }
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

function parseSearch(raw: unknown, spec: ListSpec): Record<string, string[]> | undefined {
    if (raw === undefined) return undefined;
    if (!isPlainObject(raw)) throw invalid("searchFilters must be an object");

    const result: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (!spec.searchable.includes(key)) throw invalid(`Search on '${key}' is not allowed`);
        if (fieldType(spec, key).kind !== "string") throw invalid(`Search is only allowed on text fields: '${key}'`);
        if (value === null) continue;

    const keywords = (Array.isArray(value) ? value : [value])
        .map((v) => {
            if (typeof v !== "string") throw invalid(`Nilai search '${key}' must be a string`);
            const trimmed = v.trim();
            if (trimmed.length > MAX_SEARCH_LENGTH) throw invalid(`Search '${key}' must not exceed ${MAX_SEARCH_LENGTH} characters`);
            return trimmed;
        })
        .filter((v) => v.length > 0); // empty string ignored

        if (keywords.length > 0) result[key] = keywords;
    }
    return Object.keys(result).length > 0 ? result : undefined;
}

function toDate(v: unknown): Date | null {
    if (typeof v !== "string") return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
}

function parseRanged(raw: unknown, spec: ListSpec): RangedFilter[] | undefined {
    if (raw === undefined) return undefined;
    if (!Array.isArray(raw)) throw invalid("rangedFilters must be an array");
    if (raw.length > MAX_RANGED_FILTERS) throw invalid(`rangedFilters max ${MAX_RANGED_FILTERS} item`);

    const result = raw.map((item): RangedFilter => {
        if (!isPlainObject(item) || typeof item.key !== "string") {
            throw invalid("Format rangedFilters not valid");
        }
    const { key, start, end } = item;
    if (!spec.rangeable.includes(key)) throw invalid(`Range on '${key}' not allowed`);
    const type = fieldType(spec, key);

    if (type.kind === "number") {
        if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end)) {
            throw invalid(`Range '${key}' must be a number`);
        }
        if (start > end) throw invalid(`Range '${key}': start must not be greater than end`);
            return { key, start, end };
        }

        if (type.kind === "date") {
            const s = toDate(start);
            const e = toDate(end);
            if (!s || !e) throw invalid(`Range '${key}' must be a valid ISO 8601 date`);
            if (s > e) throw invalid(`Range '${key}': start must not be greater than end`);
            return { key, start: s, end: e };
        }

        throw invalid(`Field '${key}' does not support range`);
    });

    return result.length > 0 ? result : undefined;
}

function parseIntParam(raw: string | undefined, name: string, fallback: number, max?: number): number {
    if (raw === undefined || raw === "") return fallback;
    if (!/^\d+$/.test(raw)) throw invalid(`${name} must be a positive integer`);
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < 1) throw invalid(`${name} must be a positive integer`);
    if (max !== undefined && n > max) throw invalid(`${name} must not exceed ${max}`);
    return n;
}

function buildOrderBy(query: Record<string, string | undefined>, spec: ListSpec): Record<string, OrderRule>[] {
    const { orderKey, orderRule } = query;

    if (orderKey !== undefined && !spec.sortable.includes(orderKey)) {
        throw invalid(`Sort on '${orderKey}' not allowed`);
    }
    if (orderRule !== undefined && !isOrderRule(orderRule)) {
        throw invalid("orderRule must 'asc' or 'desc'");
    }

    const key = orderKey ?? spec.defaultOrder.key;
    const rule: OrderRule = orderRule ?? (orderKey ? "asc" : spec.defaultOrder.rule);

    return key === "id" ? [{ id: rule }] : [{ [key]: rule }, { id: "asc" }];
}

export function parseListQuery(query: Record<string, string | undefined>, spec: ListSpec): ParsedListQuery {
    const filters = parseFilters(parseJsonParam(query.filters, "filters"), spec);
    const searchFilters = parseSearch(parseJsonParam(query.searchFilters, "searchFilters"), spec);
    const rangedFilters = parseRanged(parseJsonParam(query.rangedFilters, "rangedFilters"), spec);
    const page = parseIntParam(query.page, "page", 1);
    const rows = parseIntParam(query.rows, "rows", DEFAULT_ROWS, MAX_ROWS);

    const built = builder.buildWithoutValidation({ filters, searchFilters, rangedFilters, page, rows });

    return {
        where: built.where,
        orderBy: buildOrderBy(query, spec),
        skip: built.skip,
        take: built.take,
        rows,
    };
}

export function toPaginated<T>(entries: T[], totalData: number, rows: number) {
    return { entries, totalData, totalPage: Math.ceil(totalData / rows) };
}