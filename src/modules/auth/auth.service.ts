import { prisma } from "../../db/prisma";
import { AppError } from "../../lib/errors";
import { signAccessToken } from "../../lib/jwt";
import { createUser } from "../users/user.service";
import { authUserSelect, toPublicUser } from "./auth.select";
import type { LoginInput, RegisterInput } from "./auth.schema";

// Timing attack mitigation: always verify password even if user not found
const DUMMY_HASH = await Bun.password.hash("timing-attack-mitigation");

export async function login(input: LoginInput) {
    const user = await prisma.user.findFirst({
        where: { email: input.email, deletedAt: null },
        select: { ...authUserSelect, passwordHash: true },
    });

    const valid = await Bun.password.verify(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) {
        throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    const { passwordHash: _passwordHash, ...authUser } = user;
    return {
        token: signAccessToken(authUser.id, authUser.tokenVersion),
        user: toPublicUser(authUser),
    };
}

// Increment tokenVersion -> invalidate all existing tokens for users
export async function logout(userId: string): Promise<void> {
    await prisma.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
    });
}

export function registerInternal(input: RegisterInput) {
    return createUser({ ...input, role: "INTERNAL" });
}