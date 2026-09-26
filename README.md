# NodeWave Assessment — Backend

REST API for tracking deliverables on client projects. Built for the NodeWave Fullstack Engineer assessment.

| | |
|---|---|
| **Live API** | https://nodewave-assessment-be-production.up.railway.app |
| **Health check** | [`/health`](https://nodewave-assessment-be-production.up.railway.app/health) |
| **Frontend** | https://nodewave-assessment-fe-fawn.vercel.app |
| **API collection** | [`docs/postman`](docs/postman) (Postman v2.1) |

## Stack

TypeScript (strict) · Bun · Hono · Prisma 7 + PostgreSQL · JWT (`jsonwebtoken`) · Zod · `@nodewave/prisma-ezfilter` · Biome · Husky · Commitlint

## Seeded accounts

All accounts share the password set in `SEED_PASSWORD` (`<SEED_PASSWORD>` on the live deployment).

| Role | Email | Scope |
|---|---|---|
| Product Manager | `pm@nodewave.test` | Everything |
| Internal · UI/UX | `uiux@nodewave.test` | Member of both projects |
| Internal · Frontend | `frontend@nodewave.test` | Member of *Website Redesign Maju Jaya* |
| Internal · Backend | `backend@nodewave.test` | Member of *Website Redesign Maju Jaya* |
| Client · PT Maju Jaya | `client@majujaya.test` | Own project, client-visible tasks only |
| Client · PT Sentosa Abadi | `client@sentosa.test` | Own project, client-visible tasks only |

The seed sets up the dependency chain from the brief on *Website Redesign Maju Jaya*:
`UI Design (Done)` + `Backend API (In progress)` → `Frontend slicing (Blocked)`.

## Running locally

```sh
bun install
cp .env.example .env            # adjust if needed
docker compose up -d            # PostgreSQL on localhost:5433
bunx prisma migrate deploy
bun prisma/seed.ts
bun run dev                     # http://localhost:3001
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | At least 32 characters |
| `JWT_EXPIRES_IN_SECONDS` | Token lifetime, default `86400` |
| `CORS_ORIGIN` | Comma-separated list of allowed frontend origins |
| `PORT` | Default `3001` |
| `ALLOW_PUBLIC_REGISTER` | `true` enables `POST /auth/register` |
| `SEED_PASSWORD` | Password for every seeded account |

Scripts: `bun run lint`, `bun run format`, `bun run typecheck`, `bun test`.

## How the business rules are enforced

Every rule below is enforced in the API. The frontend mirrors them for UX, but is never the security boundary.

### Access control (RBAC + ABAC)
- **Scoping happens in the query.** `projectScope` / `taskScope` (`src/modules/*/…policy.ts`) are merged into every Prisma `where`. A PM sees all projects, an Internal user only projects they are a member of, a Client only their own tenant's projects and tasks flagged `clientVisible`. Filters from the query string are combined with `AND`, so they can narrow the result but never widen it.
- **Out-of-scope resources return `404`**, not `403`, so IDs from other tenants cannot be probed.
- **Only the PM** can create/edit tasks, change descriptions and define dependencies. Internal users can change status and upload attachments on tasks in their projects.

### Data masking for Client Guests
Clients receive a different Prisma `select` (`task.select.ts`, `project.select.ts`): no assignee, department, creator, version or internal IDs. Comments, attachments, dependencies, members and audit logs return `404` for clients. The fields are never loaded, not just hidden.

### Task state machine (`task.transitions.ts`)
| From → To | Allowed for |
|---|---|
| `TODO → IN_PROGRESS` | Assignee or PM, only when every prerequisite is `DONE` |
| `IN_PROGRESS → DONE` | **Assignee only** — the PM cannot complete work |
| `IN_PROGRESS → TODO` | Assignee or PM |
| `DONE → IN_PROGRESS` | PM only (reopen) |
| `BLOCKED` | Never set manually — managed by the system |

`GET /tasks/:id` returns `availableTransitions` with a reason for every denied move, which the UI uses to disable buttons and explain why.

### Dependency-aware blocking
- Dependencies must stay inside one project, cannot point to the task itself, and cannot form a cycle (checked with a recursive CTE).
- Adding or removing a dependency is serialised per project with `pg_advisory_xact_lock`.
- Whenever a task's status changes, its dependents are recomputed: `TODO ↔ BLOCKED`. These automatic changes are written to the audit log with `source = SYSTEM`.
- Starting a task locks its prerequisites with `FOR SHARE`, so a prerequisite cannot be reopened in the same instant.

### Optimistic locking
`Task.version` is incremented on every write. `PATCH /tasks/:id`, `PATCH /tasks/:id/status` and `DELETE /tasks/:id` require the version the client last read. The update runs as `UPDATE … WHERE id = ? AND version = ?`; if no row matches, the API responds:

```json
409 { "success": false, "error": { "code": "VERSION_CONFLICT", "message": "…", "details": { "current": { …latest task… } } } }
```

The latest task is included so the client can show what changed and let the user re-apply their edit.

### Audit trail and soft delete
- Every task change writes one row per changed column to `AuditLog` (`userId`, `timestamp`, `changedColumn`, `oldValue`, `newValue`, `source`) inside the same transaction as the change.
- `AuditLog` is immutable at the database level: a trigger rejects `UPDATE`, `DELETE` and `TRUNCATE` (see migration `20260925155002_audit`).
- No entity is physically deleted. Every model has `deletedAt`, and all queries filter it out.

## List queries

All list endpoints follow the shared contract: `filters`, `searchFilters`, `rangedFilters`, `page`, `rows`, `orderKey`, `orderRule`.

```http
GET /tasks?filters={"status":"BLOCKED","projectId":"10000000-0000-4000-8000-000000000001"}&searchFilters={"title":"dashboard"}&page=1&rows=20&orderKey=updatedAt&orderRule=desc
```

Each endpoint declares which fields may be filtered, searched, ranged and sorted (`ListSpec`). Anything outside that list, invalid JSON, `rows > 100`, `page < 1`, `start > end` or an unknown `orderRule` returns `400 INVALID_QUERY`. Clients get a narrower spec (e.g. they cannot filter by assignee or department).

Response shape:

```json
{ "success": true, "data": { "entries": [ … ], "totalData": 42, "totalPage": 3 } }
```

## Endpoints

All endpoints except `/health`, `/auth/login` and `/auth/register` require `Authorization: Bearer <token>`.

| Method | Path | Roles | Notes |
|---|---|---|---|
| `POST` | `/auth/register` | public | Creates an Internal user; disabled unless `ALLOW_PUBLIC_REGISTER=true` |
| `POST` | `/auth/login` | public | Returns `{ token, user }` |
| `POST` | `/auth/logout` | any | Revokes every token of the user (`tokenVersion++`) |
| `GET` | `/auth/me` | any | |
| `GET` `POST` | `/users` | PM | List / create users of any role |
| `GET` `POST` | `/clients` | PM | Client companies (tenants) |
| `GET` | `/projects` | any | Scoped by role |
| `POST` | `/projects` | PM | |
| `GET` | `/projects/:id` | any | |
| `GET` | `/projects/:id/progress` | any | `{ total, done, percent }` |
| `PATCH` `DELETE` | `/projects/:id` | PM | Delete is a soft delete |
| `GET` | `/projects/:id/members` | PM, Internal | |
| `POST` | `/projects/:id/members` | PM | Internal users only |
| `DELETE` | `/projects/:id/members/:userId` | PM | |
| `GET` | `/tasks` | any | Scoped by role; masked for clients |
| `POST` | `/tasks` | PM | Assignee must be a project member of the same department |
| `GET` | `/tasks/:id` | any | Internal response includes `blockedBy` and `availableTransitions` |
| `PATCH` | `/tasks/:id` | PM | Requires `version` |
| `PATCH` | `/tasks/:id/status` | PM, Internal | Requires `version`; state machine above |
| `DELETE` | `/tasks/:id?version=` | PM | Soft delete |
| `GET` `POST` | `/tasks/:id/dependencies` | GET: PM, Internal · POST: PM | |
| `DELETE` | `/tasks/:id/dependencies/:dependsOnId` | PM | |
| `GET` | `/tasks/:id/audit-logs` | PM, Internal | |
| `GET` | `/audit-logs` | PM, Internal | Filter by `projectId`, `taskId`, `userId`, `changedColumn`, `source`; range on `timestamp` |
| `GET` `POST` | `/tasks/:id/attachments` | PM, Internal | Multipart field `file`, max 5 MB, allow-listed MIME types |
| `GET` | `/attachments/:id/download` | PM, Internal | |
| `DELETE` | `/attachments/:id` | PM or uploader | |
| `GET` `POST` | `/tasks/:id/comments` | PM, Internal | Paginated |
| `PATCH` | `/comments/:id` | author | |
| `DELETE` | `/comments/:id` | author or PM | |
