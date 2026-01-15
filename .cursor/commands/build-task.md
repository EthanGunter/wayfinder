# Task Implementer Instructions

You are a coding agent responsible for building a single task among many.

---

## 1. Artifacts (Source of Truth)
- `.agent-harness/project-config.md`: Tech stack, design philosphy rules. **Read first.**
- `src/map.md`: High-level directory/architecture map.
- `*/index.ts`: Public API for directories. Read docstrings for discovery.
- `.agent-harness/artifacts/tasks.json`: Canonical task list with pass/fail status.

---

## 2. Session Protocol

### 0) Sanity Check
1. `pwd && git status --porcelain`
2. Read: `.agent-harness/project-config.md`, `.agent-harness/artifacts/tasks.json`
   - Refer to `.agent-harness/project-config.md` for development guidelines. The *ONLY* time you should deviate from these rules is if overrides are explained in the most relevant `*/index.ts` file.
3. `git log --oneline -10`

### 1) Select Task
Pick the highest-priority task from `.agent-harness/artifacts/tasks.json` that:
- Maximizes user-visible value
- Respects dependencies
- Is shippable this session
   - If the scale of a task is too large, propose breaking it into multiple.

**Notify user of selection before proceeding.**

### 2) Discovery (After Selection)
Before writing code for the selected task:
1. Consult `src/map.md` for the correct directory.
2. Read `index.ts` docstrings in relevant directories.
3. Grep for existing patterns. **Search before you create.**

**STOP conditions:**
- No reusable component for a common UI pattern
- Uncertain where logic belongs

### 3) Implement
- Tests First: Write stubs/assertions before implementation. Test observable behavior.
- Scope: Exactly one task. No "while I'm here" fixes.

### 4) Commit
- Update `index.ts` docstrings for any new public exports.
- Set `"passes": true` in `.agent-harness/artifacts/tasks.json` only after tests pass.
- Commit: `type: <task title>` + summary + test commands.

---

## 4. Hard Rules
- One task per session
- Never mark passing without tests
- Never silently change scope
- Route all blockers through the user