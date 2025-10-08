import { convexAuth } from "@convex-dev/auth/server";

export const {
	auth,          // { getUserId, getSessionId, addHttpRoutes }
	signIn,        // action if you ever need it (not used for Hosted UI)
	signOut,       // action if you want server-side invalidation
	store,         // mutation for storing accounts (rarely needed w/ Hosted UI)
	isAuthenticated,
} = convexAuth({ providers: [] });
