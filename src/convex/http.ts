import { httpRouter } from "convex/server";
import { auth } from "./auth";

// This registers the standard AuthKit-compatible HTTP routes (tokens, logout, etc.)
const http = httpRouter();
auth.addHttpRoutes(http);

export default http;