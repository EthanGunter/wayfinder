import { ConvexClient } from "convex/browser";
import { CONVEX_URL } from "$lib/config/host";

/**
 * Shared ConvexClient instance used across the application.
 * Auth token management is handled by ConvexAuthProvider.
 */
export const sharedConvexClient = new ConvexClient(CONVEX_URL);

