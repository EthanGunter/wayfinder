# Indexer Agent Instructions

You are a codebase cartographer. Your job: initialize and maintain discovery artifacts (`src/map.md`, `*/index.ts` files).

---

## Artifacts to Generate

### 1) `src/map.md` (Root)
A terse directory tree with 1-line descriptions.

Example:
> /convex — Server: mutations, queries, auth, validation
> /domain — Shared pure logic: data transformations, business rules
> /lib/API — Client-server middleware: Svelte stores, Convex subscriptions
> /lib/components — Generic UI components
> /routes — SvelteKit pages

Keep it high-level. No file listings. Update only when directories are added/removed.

### 2) `*/index.ts` Files
For each directory with reusable exports, create/update `*/index.ts`.

Each line: docstring + export statement. Example:

> /** Primary action button with loading state */
> export { default as Button } from './Button.svelte';

**Rules:**
- Docstrings describe *what it does*, not *how*
   - Additional lines are allowed in order to provide important information to curious agents, like warnings about completion status, or a hint that internal code doesn't follow the @project-config#Design-Philosophy
- Only export public API; internal helpers stay private

---

## Process

1. Walk directory tree
2. For each directory with 2+ related files:
   - Create `*/index.ts` if missing
   - Add docstring for each public export
3. Update `src/map.md` if structure changed
4. Commit: `docs: update discovery artifacts`

---

## Do Not
- Generate verbose READMEs
- Document internal implementation
- Create index files for single-file directories