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

	for (const u of USERS) {
		const data = {
			name: u.name,
			role: u.role,
			department: u.department ?? null,
			clientId: u.clientId ?? null,
			passwordHash,
			deletedAt: null,
		};
		await prisma.user.upsert({
			where: { email: u.email },
			update: data,
			create: { email: u.email, ...data },
		});
	}

	console.log(`Seeding Status: ${CLIENTS.length} client, ${USERS.length} user`);
}

main()
	.then(() => prisma.$disconnect())
	.catch(async (err) => {
		console.error(err);
		await prisma.$disconnect();
		process.exit(1);
	});
