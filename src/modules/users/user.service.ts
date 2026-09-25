import { prisma } from "../../db/prisma";
import { Prisma } from "../../generated/prisma/client";
import { AppError } from "../../lib/errors";
import {
	authUserSelect,
	type PublicUser,
	toPublicUser,
} from "../auth/auth.select";
import type { CreateUserInput } from "./user.schema";

export async function createUser(input: CreateUserInput): Promise<PublicUser> {
	if (input.clientId) {
		const client = await prisma.client.findFirst({
			where: { id: input.clientId, deletedAt: null },
			select: { id: true },
		});
		if (!client)
			throw new AppError(
				422,
				"CLIENT_NOT_FOUND",
				"Client not found or deleted",
			);
	}

	const passwordHash = await Bun.password.hash(input.password);

	try {
		const user = await prisma.user.create({
			data: {
				name: input.name,
				email: input.email,
				passwordHash,
				role: input.role,
				department: input.department ?? null,
				clientId: input.clientId ?? null,
			},
			select: authUserSelect,
		});
		return toPublicUser(user);
	} catch (err) {
		if (
			err instanceof Prisma.PrismaClientKnownRequestError &&
			err.code === "P2002"
		) {
			throw new AppError(409, "EMAIL_TAKEN", "Email already registered");
		}
		throw err;
	}
}
