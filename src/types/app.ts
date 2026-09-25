import type { AuthUser } from "../modules/auth/auth.select";

export type AppEnv = {
	Variables: {
		user: AuthUser;
	};
};
