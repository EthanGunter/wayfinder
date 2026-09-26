# Tutorials

A small engine for in-app, step-by-step walkthroughs, and the onboarding tour built on it.
Wayfinder's pitch is that tasks form a prerequisite graph and the planner only surfaces what's
actionable. The onboarding tour shows this by having the visitor build a small graph
("Go to the ball 💃🕺") and then watch the planner work through it.

Import everything from `$lib/tutorials` (see `index.ts`).

## The engine

The engine has four parts: a persisted store, UI primitives, watchers, and a centered fallback.
None of them know anything about Wayfinder routes.

### Store (`store.ts`)

`tutorials` is a Svelte readable of every tutorial's progress, persisted to
`localStorage['wf.tutorials.v1']`:

```ts
{ [tutorialId]: { completed: boolean, step: number, data?: Record<string, Json> } }
```

- Progress: `getStep`, `setStep` (resume), `advance`, `complete`, `isDone`, `reset`.
- Bulk: `skipAll(ids)` ("skip walkthrough"), `resetAll(ids)` (replay; also clears data).
- Data: `getData` / `setData` (shallow merge; `undefined` deletes a key), `clearData`, and
  `data(id)` as a readable. Parts of a multi-page tour use data to hand ids to each other.
- `createTutorials(storage)` builds an isolated instance for tests (`store.test.ts`). Parsing is
  lenient, so records written before `data` existed still load.

Each tutorial component keeps its current step in the store. The markup is a plain
`{#if step === n}` chain. Because every transition is written to storage, a reload resumes where
the user left off.

### Primitives (`primitives/`)

| Component      | What it does                                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `TModal`       | The step card. Without `selector` it is centered. With `selector` it becomes a popover anchored to that element (`placement`, arrow, scrolled into view). It dims the rest of the page (`blockPage`) and can shield the anchor (`disableTargetInteraction`). |
| `TGate`        | A backdrop with a cutout. Only the element matching `selector` stays clickable. It follows the element if it re-renders.                                                                                                                                     |
| `EventHandler` | A delegated listener on `document` for events inside `selector`. It listens in the capture phase by default, so `preventDefault()` + `stopImmediatePropagation()` fully replaces the app's own handler (e.g. "we'll create this one for you").               |
| `StoreWatcher` | Advances on app state instead of DOM events: `<StoreWatcher store={selectedNode} when={(n) => n?.id === id} onMatch={next} />`. The function form is `onStore()` in `watch.ts`.                                                                              |
| `DropWatcher`  | Fires when a pragmatic-drag-and-drop drop reorders items of one list (`listId`). There is no DOM event for this. It uses `monitorForElements` and doesn't disturb the list's own monitor. The function form is `monitorListDrops()` in `dnd.ts`.             |
| `TTooltip`     | A lightweight, non-blocking hint anchored to `selector` (currently unused).                                                                                                                                                                                  |

### Centered fallback

The one rule the tour must keep is that nothing dead-ends the user. An anchored `TModal`
switches to a centered panel, and calls `onFallback(reason)`, in three cases:

- `missing`: the anchor didn't appear within `anchorTimeoutMs` (default 3s).
- `hidden`: the anchor is zero-size, `display:none` (including an ancestor, e.g. `hidden sm:block`),
  or `visibility:hidden`.
- `offscreen`: the anchor is outside the viewport, checked only below the `sm` breakpoint (640px).

It re-checks every 250ms and on resize, and re-anchors when the element becomes usable again.
A fallback that has no buttons never blocks the page, so the user can still do whatever the step
is waiting for. On narrow screens it docks at the bottom. Steps use `onFallback` to offer a way
forward when the anchor can't be reached. Examples: A1 shows "Create it", B8 shows "Skip" for
drag-and-drop, and B9 shows "Got it".

Anchored popovers are capped to floating-ui's available width. On a phone they wrap their text
instead of running off the edge of the screen.

## The onboarding tour

There are three tutorials, one per route. The ids are in `ids.ts`, and the helpers are in
`onboarding.ts`.

| Part | Id                           | Route            | Component                                                |
| ---- | ---------------------------- | ---------------- | -------------------------------------------------------- |
| A    | `onboarding.welcome`         | `/projects`      | `routes/(authenticated)/projects/TutorialWelcome.svelte` |
| B    | `onboarding.example-project` | `/projects/[id]` | `…/projects/[projectId]/TutorialExampleProject.svelte`   |
| C    | `onboarding.planner`         | `/planner`       | `…/planner/TutorialPlanner.svelte`                       |

The parts share one data record, `onboarding` (`ONBOARDING_DATA`), typed as `OnboardingData`:

```ts
{ demoProjectId?, dressId?, genieId?, replay? }
```

**Part A (welcome).** It starts only after the projects query resolves with zero projects, or
when the `replay` flag is set. A1 intercepts the create button and opens the real
`CreateProjectModal`, prefilled with "Go to the ball 💃🕺". When the project is created,
`completeWelcome(id)` stores `demoProjectId`, clears `replay`, and navigates to the project.
New accounts land on `/projects` so this can happen.

**Part B (example project).** It is active only when `page.params.projectId === demoProjectId`,
so no other project ever shows it.

- B1 creates "Get dress clothes" for the user and stores its id as `dressId`.
- B4 advances when the `selectedNode` store becomes that task, so clicking the graph node works
  as well as clicking the list item.
- B6 is a hint rendered _inside_ `TaskCreationDialog` (the dialog's `hint` snippet), because an
  external popover would fight the dialog's focus trap. The user's create really goes through,
  and the result is stored as `genieId`.
- B7 calls the `seedDemoProject` Convex mutation (`src/convex/demo.ts`), which adds the rest of
  the graph. If the user already made the genie task, the mutation re-parents it instead of
  duplicating it. The mutation is idempotent, so a reload or retry can't double-seed.
- B8 waits for a `DropWatcher` reorder.
- B9 points at the Planner link.

On load, `reconcile()` checks the stored step against what actually exists in the project. For
example, it adopts an existing dress task, returns to B5 if the dialog was closed before a genie
existed, and skips ahead to B7 if the genie exists. Reloading at any step lands somewhere
sensible.

**Part C (planner).** It starts once Part B is done, the demo project still exists, and the
genie is rendered as a suggestion. The page passes in `revealProject` so the project's
collapsed suggestions open.

- C2 gates everything except the genie's "+" button and advances when the genie shows up in
  today's list.
- C4 advances when the genie is completed. At that point the four tasks it was blocking appear
  as suggestions live, with no reload.
- C6 offers "Keep it" or "Delete example project". Delete uses the page's `deleteProject`, which
  drops that project's live suggestions subscription first so the page shows no error state,
  then clears the stored ids.

Parts can't start out of order because each one gates on the previous part being complete.

### Replay and reset

- **In the app:** Help menu (the feedback icon in the header) → **Replay tutorial**. This calls
  `replayOnboarding()`, which runs `resetAll` on the three parts plus the data record, sets
  `{ replay: true }`, and navigates to `/projects`. Part A then starts even though the user has
  projects. Its A1 step points at the grid's "+" (`#btn-create-project`) and creates a fresh
  demo project.
- **By hand:** run `localStorage.removeItem('wf.tutorials.v1')` in the console, then open
  `/projects` with an account that has zero projects.
- **Skip:** "skip walkthrough" at A1 calls `skipOnboarding()`, which marks all three parts
  complete.

Progress is per browser. An existing user who signs in on a new device has projects, so
nothing auto-starts for them.

## Adding a tutorial

1. Add an id to `ids.ts`. If the tutorial spans pages, add a typed data record too.
2. Write a component that reads `$tutorials[ID]`. Derive `active` from its own preconditions
   (route, data, whether the previous part is done), then render one `{#if step === n}` branch
   per step using the primitives. Advance with `tutorials.advance(ID)` from button handlers,
   `EventHandler`, `StoreWatcher` or `DropWatcher`, and call `tutorials.complete(ID)` at the end.
3. Anchor to stable hooks (`id` / `data-*` attributes), not styling classes. Make every step
   finishable when its anchor can't be reached, using buttons or `onFallback`.
4. Mount it from the route's `+page.svelte`. Keep the route's changes to props and callbacks,
   such as `revealProject` or a dialog `hint` snippet.
5. If a reload mid-way could leave the stored step inconsistent with the data, reconcile it on
   load the way Part B does.

## Verifying

`store.test.ts` and `projects/tutorial-welcome.test.ts` cover the store and Part A logic
(`npx vitest run`). The full tour was checked end to end with headless Playwright at 1440×900
and 390×844:

- all steps from A0 to C6, with both endings;
- the exact demo graph after B7;
- live suggestions after C4;
- skip, replay, reload at B3/B6/B7/B8, non-demo projects, and a fresh-device login.

Running locally needs the Convex backend
(`env -u TZ CONVEX_AGENT_MODE=anonymous npx convex dev --local`; Convex requires TZ to be unset) with `BETTER_AUTH_SECRET` and `PUBLIC_SITE_URL` set in the Convex env,
plus `npx vite dev`. Sign up with email and password; no verification is needed.
