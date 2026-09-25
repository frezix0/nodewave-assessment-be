import type { Prisma } from "../../generated/prisma/client";

export const projectInternalSelect = {
  id: true,
  name: true,
  description: true,
  clientId: true,
  client: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ProjectSelect;

// Client Guest: data internal project select is not exposed to client guest, only public project select is exposed
export const projectClientSelect = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ProjectSelect;

export const memberSelect = {
  createdAt: true,
  user: {
    select: { id: true, name: true, email: true, avatarUrl: true, department: true },
  },
} as const satisfies Prisma.ProjectMemberSelect;