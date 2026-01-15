# Refactor Audit: `lib/` Directory

**Date:** 2025-01-27  
**Scope:** `lib/query`, `lib/config`

---

## Summary

Audit of `lib/` subdirectories against Design Philosophy in `.agent-harness/project-config.md`. Found violations in abstraction policy, logic organization, and consistency.

---

## Findings

### `lib/config/user-settings/index.ts` - Logic Organization

**File:** `src/lib/config/user-settings/index.ts`  
**Lines:** 12-113  
**Violation Type:** Logic & State - Complex logic in config layer

**Issues:**

1. **Complex path aliasing logic** (lines 32-44):
   - `applySettings()` contains hardcoded path mapping logic (`llm/*` → `llm/llm/*`)
   - This business logic should be extracted to a dedicated utility or documented as a known exception

2. **IIFE initialization pattern** (lines 96-113):
   - Uses `void (async () => {...})()` for side-effect initialization
   - This pattern obscures initialization flow and makes testing harder
   - Consider extracting to a named initialization function

3. **Mixed concerns**:
   - `flattenSettings()` and `applySettings()` are utility functions but live in the index file
   - Should be moved to a `//#region Utilities` section or separate utility file

**Proposed Fix:**
- Extract path aliasing logic to a documented utility function: `normalizeSettingPath(path: string): string`
- Extract initialization to a named function: `initializeUserSettings()` 
- Move utility functions (`flattenSettings`, `applySettings`, `collectDeviceSettingPaths`) to EOF `//#region Utilities` section
- Document the `llm/*` path aliasing exception in the file header or nearest `index.ts`

**Rationale:** Config files should be declarative. Complex logic should be clearly separated and documented.

---

### `lib/config/user-settings/` - UI Components in Config Layer

**File:** `src/lib/config/user-settings/Editors/*.svelte`  
**Violation Type:** Boundaries - UI components in config layer

**Issue:**
- Editor components (`.svelte` files) live in `lib/config/user-settings/Editors/`
- According to boundaries, UI should be separate from config/data layers
- However, these editors are tightly coupled to the settings schema

**Assessment:**
- This appears to be a deliberate architectural choice (settings system includes its own UI)
- The `UserSettings.svelte` component orchestrates these editors
- **Recommendation:** Document this exception in `lib/config/user-settings/index.ts` if this is intentional

**Proposed Fix:**
- If intentional: Add documentation in `index.ts` explaining why UI lives in config layer
- If not intentional: Consider moving editors to `lib/components/settings/` and importing them

**Rationale:** Boundaries should be respected unless explicitly documented as exceptions.

---

### `lib/query/` - Assessment

**Files:** `src/lib/query/*.ts`  
**Status:** ✅ **No violations found**

**Assessment:**
- Well-organized query parsing/evaluation system
- Used in multiple locations (project search, TaskSearchService)
- Private helpers correctly placed (e.g., `collectionASTHasAnd` in evaluator)
- Proper separation of concerns (tokenizer → parser → evaluator)
- Types are well-defined and exported appropriately

**Note:** `taskQueryHandlers.ts` contains some console.log statements, but those are in a different file (`lib/API/Tasks/`) and not part of this audit scope.

---

## Recommendations Priority

1. **Medium:** Refactor `config/user-settings/index.ts` utilities organization
2. **Low:** Document or refactor UI components in config layer (requires architectural decision)

---

## Notes

- `lib/query/` is well-structured and requires no changes
- `lib/config/host.ts` is simple and appropriate
- Most violations are minor organizational issues, not architectural problems
