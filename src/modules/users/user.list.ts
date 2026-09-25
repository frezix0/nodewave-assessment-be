import { prisma } from "../../db/prisma";
import type { Prisma } from "../../generated/prisma/client";
import { parseListQuery, toPaginated } from "../../lib/query";
import { userListSpec } from "./user.policy";

const userListSelect = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
  department: true,
  clientId: true,
  createdAt: true,
} as const satisfies Prisma.UserSelect;

export async function listUsers(rawQuery: Record<string, string | undefined>) {
  const q = parseListQuery(rawQuery, userListSpec);
  const where: Prisma.UserWhereInput = { AND: [q.where as Prisma.UserWhereInput, { deletedAt: null }] };

  const [entries, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      orderBy: q.orderBy as Prisma.UserOrderByWithRelationInput[],
      skip: q.skip,
      take: q.take,
      select: userListSelect,
    }),
    prisma.user.count({ where }),
  ]);

  return toPaginated(entries, total, q.rows);
}