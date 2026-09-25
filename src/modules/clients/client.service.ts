import { prisma } from "../../db/prisma";
import type { Prisma } from "../../generated/prisma/client";
import { type ListSpec, parseListQuery, toPaginated } from "../../lib/query";
import type { CreateClientInput } from "./client.schema";

const clientListSpec: ListSpec = {
  fields: { name: { kind: "string" }, createdAt: { kind: "date" } },
  filterable: [],
  searchable: ["name"],
  rangeable: ["createdAt"],
  sortable: ["name", "createdAt"],
  defaultOrder: { key: "name", rule: "asc" },
};

const clientSelect = { id: true, name: true, createdAt: true } as const satisfies Prisma.ClientSelect;

export async function listClients(rawQuery: Record<string, string | undefined>) {
  const q = parseListQuery(rawQuery, clientListSpec);
  const where: Prisma.ClientWhereInput = { AND: [q.where as Prisma.ClientWhereInput, { deletedAt: null }] };

  const [entries, total] = await prisma.$transaction([
    prisma.client.findMany({
      where,
      orderBy: q.orderBy as Prisma.ClientOrderByWithRelationInput[],
      skip: q.skip,
      take: q.take,
      select: clientSelect,
    }),
    prisma.client.count({ where }),
  ]);

  return toPaginated(entries, total, q.rows);
}

export function createClient(input: CreateClientInput) {
  return prisma.client.create({ data: input, select: clientSelect });
}