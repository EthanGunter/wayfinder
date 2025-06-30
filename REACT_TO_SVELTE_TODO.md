# React to Svelte File Conversion TODO

## Overview
This document tracks JSX to Svelte file conversions. TODO-tagged functionality is documented elsewhere and will be addressed after the structural conversion is complete.

### Pages
- [x] **app-layout.tsx** → `+layout.svelte` (Root layout)
- [x] **todays-tasks.tsx** → `routes/home/+page.svelte` (Home page structure)
- [x] **task-browser.tsx** → `routes/tasks/+page.svelte` (Tasks page structure)

### Components  
- [x] **app-header.tsx** → `AppHeader.svelte`
- [x] **app-footer.tsx** → `AppFooter.svelte`
- [x] **task-list.tsx** → `TaskList.svelte`
- [x] **task-list-item.tsx** → `TaskListItem.svelte`
- [x] **tasks-search-bar.tsx** → `TasksSearchBar.svelte`
- [x] **bug-report-menu.tsx** → `BugReportMenu.svelte`

### Core Components
- [x] **tag-list-input.tsx** → `TagListInput.svelte`
- [x] **task-item-context-menu.tsx** → `TaskItemContextMenu.svelte`
- [x] **bubble-text.tsx** → `BubbleText.svelte`

### Task Browser Sub-components
- [x] **task-editor.tsx** → `TaskEditor.svelte`

### Non-component logic
- [ ] **Check `/src/old-react-code/hooks/`** - Convert React hooks to Svelte actions/utilities

## 🎯 CONVERSION PRIORITY

### Phase 1: Essential Components - complete
### Phase 2: Tutorial System - complete
### Phase 3: Additional Pages
1. `routes/settings/+page.svelte` - App settings
### Phase 4: Handler Components
These will be moved from components to root-level layout initialization
1. `AppHandlerBackButton.svelte` - Mobile navigation
2. `AppHandlerStateChange.svelte` - App lifecycle

---

**Focus**: Convert JSX structure to Svelte5 syntax, maintain component interfaces, preserve styling
