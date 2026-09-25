import type { ListSpec } from "../../lib/query";

export const userListSpec: ListSpec = {
	fields: {
		name: { kind: "string" },
		email: { kind: "string" },
		role: { kind: "enum", values: ["PM", "INTERNAL", "CLIENT"] },
		department: { kind: "enum", values: ["UI_UX", "FRONTEND", "BACKEND"] },
		clientId: { kind: "string" },
		createdAt: { kind: "date" },
	},
	filterable: ["role", "department", "clientId"],
	searchable: ["name", "email"],
	rangeable: ["createdAt"],
	sortable: ["name", "email", "createdAt"],
	defaultOrder: { key: "name", rule: "asc" },
};
