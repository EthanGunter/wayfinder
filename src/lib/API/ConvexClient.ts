import { ConvexClient } from "convex/browser";
import { PUBLIC_CONVEX_URL } from "$env/static/public";

/**
 * Shared ConvexClient instance used across the application.
 * Auth token management is handled by ConvexAuthProvider.
 */
export const sharedConvexClient = new ConvexClient(PUBLIC_CONVEX_URL);

