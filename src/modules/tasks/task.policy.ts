import type { Prisma } from "../../generated/prisma/client";
import type { ListSpec } from "../../lib/query";
import type { AuthUser } from "../auth/auth.select";
import { projectScope } from "../projects/project.policy";

export function taskScope(user: AuthUser): Prisma.TaskWhereInput {
	return {
		deletedAt: null,
		project: { AND: [projectScope(user), { deletedAt: null }] },
		...(user.role === "CLIENT" ? { clientVisible: true } : {}),
	};
}

const STATUS = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as const;
const DEPARTMENT = ["UI_UX", "FRONTEND", "BACKEND"] as const;

const taskFields: ListSpec["fields"] = {
	title: { kind: "string" },
	description: { kind: "string" },
	status: { kind: "enum", values: STATUS },
	department: { kind: "enum", values: DEPARTMENT },
	assigneeId: { kind: "string" },
	projectId: { kind: "string" },
	clientVisible: { kind: "boolean" },
	createdAt: { kind: "date" },
	updatedAt: { kind: "date" },
};

export function taskListSpec(user: AuthUser): ListSpec {
	if (user.role === "CLIENT") {
		// Filter or sort by department, assigneeId, or clientVisible is not allowed for clients
		return {
			fields: taskFields,
			filterable: ["status", "projectId"],
			searchable: ["title"],
			rangeable: ["createdAt"],
			sortable: ["title", "status", "createdAt", "updatedAt"],
			defaultOrder: { key: "createdAt", rule: "desc" },
		};
	}
	return {
		fields: taskFields,
		filterable: [
			"status",
			"department",
			"assigneeId",
			"projectId",
			"clientVisible",
		],
		searchable: ["title", "description"],
		rangeable: ["createdAt", "updatedAt"],
		sortable: ["title", "status", "department", "createdAt", "updatedAt"],
		defaultOrder: { key: "createdAt", rule: "desc" },
	};
}
