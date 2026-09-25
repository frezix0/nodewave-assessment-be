import type { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../lib/errors";
import type { ListSpec } from "../../lib/query";
import type { AuthUser } from "../auth/auth.select";

export function projectScope(user: AuthUser): Prisma.ProjectWhereInput {
	switch (user.role) {
		case "PM":
			return {};
		case "INTERNAL":
			return { members: { some: { userId: user.id, deletedAt: null } } };
		case "CLIENT":
			if (!user.clientId)
				throw new AppError(
					403,
					"FORBIDDEN",
					"Client account does not connect to any tenant",
				);
			return { clientId: user.clientId };
	}
}

const projectFields: ListSpec["fields"] = {
	name: { kind: "string" },
	description: { kind: "string" },
	clientId: { kind: "string" },
	createdAt: { kind: "date" },
	updatedAt: { kind: "date" },
};

export function projectListSpec(user: AuthUser): ListSpec {
	if (user.role === "CLIENT") {
		return {
			fields: projectFields,
			filterable: [],
			searchable: ["name", "description"],
			rangeable: ["createdAt"],
			sortable: ["name", "createdAt", "updatedAt"],
			defaultOrder: { key: "createdAt", rule: "desc" },
		};
	}
	return {
		fields: projectFields,
		filterable: ["clientId"],
		searchable: ["name", "description"],
		rangeable: ["createdAt", "updatedAt"],
		sortable: ["name", "createdAt", "updatedAt"],
		defaultOrder: { key: "createdAt", rule: "desc" },
	};
}
