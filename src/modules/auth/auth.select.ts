import type { Prisma } from "../../generated/prisma/client";

export const authUserSelect = {
	id: true,
	email: true,
	name: true,
	avatarUrl: true,
	role: true,
	department: true,
	clientId: true,
	tokenVersion: true,
} as const satisfies Prisma.UserSelect;

export type AuthUser = Prisma.UserGetPayload<{ select: typeof authUserSelect }>;
export type PublicUser = Omit<AuthUser, "tokenVersion">;

export function toPublicUser({
	tokenVersion: _tokenVersion,
	...user
}: AuthUser): PublicUser {
	return user;
}
