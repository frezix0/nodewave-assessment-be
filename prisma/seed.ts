import { prisma } from "../src/db/prisma";
import type { Department, Role } from "../src/generated/prisma/client";

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "Password123!";

const CLIENTS = [
	{ id: "00000000-0000-4000-8000-000000000001", name: "PT Maju Jaya" },
	{ id: "00000000-0000-4000-8000-000000000002", name: "PT Sentosa Abadi" },
] as const;

type SeedUser = {
	email: string;
	name: string;
	role: Role;
	department?: Department;
	clientId?: string;
};

const USERS: SeedUser[] = [
	{ email: "pm@nodewave.test", name: "Product Manager", role: "PM" },
	{
		email: "uiux@nodewave.test",
		name: "UI/UX Designer",
		role: "INTERNAL",
		department: "UI_UX",
	},
	{
		email: "frontend@nodewave.test",
		name: "Frontend Engineer",
		role: "INTERNAL",
		department: "FRONTEND",
	},
	{
		email: "backend@nodewave.test",
		name: "Backend Engineer",
		role: "INTERNAL",
		department: "BACKEND",
	},
	{
		email: "client@majujaya.test",
		name: "Client Maju Jaya",
		role: "CLIENT",
		clientId: CLIENTS[0].id,
	},
	{
		email: "client@sentosa.test",
		name: "Client Sentosa",
		role: "CLIENT",
		clientId: CLIENTS[1].id,
	},
];

async function main() {
	for (const client of CLIENTS) {
		await prisma.client.upsert({
			where: { id: client.id },
			update: { name: client.name, deletedAt: null },
			create: client,
		});
	}

	const passwordHash = await Bun.password.hash(SEED_PASSWORD);

	const userIds = new Map<string, string>();
	for (const u of USERS) {
		const data = {
			name: u.name,
			role: u.role,
			department: u.department ?? null,
			clientId: u.clientId ?? null,
			passwordHash,
			deletedAt: null,
		};
		const user = await prisma.user.upsert({
			where: { email: u.email },
			update: data,
			create: { email: u.email, ...data },
		});
		userIds.set(u.email, user.id);
	}

	console.log(`Seeding Status: ${CLIENTS.length} client, ${USERS.length} user`);

	const PROJECTS = [
		{
			id: "10000000-0000-4000-8000-000000000001",
			name: "Website Redesign Maju Jaya",
			clientId: CLIENTS[0].id,
			members: [
				"uiux@nodewave.test",
				"frontend@nodewave.test",
				"backend@nodewave.test",
			],
		},
		{
			id: "10000000-0000-4000-8000-000000000002",
			name: "Mobile App Development Sentosa",
			clientId: CLIENTS[1].id,
			members: ["uiux@nodewave.test"],
		},
	];

	for (const { members, ...p } of PROJECTS) {
		await prisma.project.upsert({
			where: { id: p.id },
			update: { name: p.name, clientId: p.clientId, deletedAt: null },
			create: p,
		});

		for (const email of members) {
			const userId = userIds.get(email);
			if (!userId) {
				throw new Error(`User with email ${email} not found`);
			}
			await prisma.projectMember.upsert({
				where: { projectId_userId: { projectId: p.id, userId } },
				update: { deletedAt: null },
				create: { projectId: p.id, userId },
			});
		}
	}

	main()
		.then(() => prisma.$disconnect())
		.catch(async (err) => {
			console.error(err);
			await prisma.$disconnect();
			process.exit(1);
		});
}
