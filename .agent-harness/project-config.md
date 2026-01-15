# Wayfinder 

## Tech Stack
- Frontend: Svelte (SvelteKit)
- Backend: Convex (serverless functions, reactive DB)
- State: Svelte stores reactive to Convex data


# Design Philosophy

## User = Architect | AI Agents = Builders
When in doubt, ask in chat. The user should always have the final say on design decisions with long-term consequences.

## Local Overrides & Variations
- **Document Exceptions:** Any discussed variations from these global rules must be documented in the nearest `index.ts` file. Always check for an `index.ts` in the current or parent directories for custom handling instructions before suggesting refactors.

## Abstraction Policy
- **Encapsulate where possible:** Do not create files spread across the galaxy if it can all fit in one place. This makes future refactoring easier.
- **Compose, don't duplicate:** 
	- If a public solution already exists, prefer it instead.
	- Prefer lib/components & Shadcn UI elements before creating new ones from scratch.
	- Extract repeated validation, transformations, or UI patterns to the appropriate layer.
	- Update `index.ts` with docstrings for extracted logic.
- **You Aren't Gonna Need It (YAGNI):** Do not abstract prematurely. Future agents will refactor your code if they can take advantage of it.
	- Inline until a second use case exists.
	- Avoid abstractions with only one call site or "Config" objects that configure nothing.
- **Private helpers:** Put all private functions in `//#region Utilities` at EOF

## Logic & State
- **Logic Leakage:** Business logic, complex transformations, and validation should not live in UI files.
	- Extract to logically-grouped `.ts` files in the same "routes" directory.
	- Extract to `/domain` (transforms) or `/convex` (mutations/validation).
- **State Hierarchy:** Persistent data → global store. Local state → ephemeral UI only.

## Boundaries
- **Layers:** Respect the Client <-> Middleware <-> Server hierarchy. Move code to the correct layer if boundaries are violated.
- **API:** All Server access flows through `/lib/API` which converts convex query callbacks into subscribable svelte stores.


# Testing Philosophy

## Exceptions
If a user declares we're protoyping, tests are not required. The pace of prototyping will make tests obsolete faster than we can right them. 
All other rules must still be followed.