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
- [ ] Check `/src/old-react-code/pages/task-browser/components/` for additional files

### Settings Page
- [ ] **settings.tsx** → `routes/settings/+page.svelte`

### Alternative Search Component
- [ ] **tasks-search-bar_rebuild.tsx** → Determine if needed or can be removed

## 🔍 INVESTIGATION NEEDED

### Unknown Components
- [ ] **Check `/src/old-react-code/pages/task-browser/components/`** - List and convert any sub-components
- [ ] **Check `/src/old-react-code/hooks/`** - Convert React hooks to Svelte actions/utilities
- [ ] **Verify no other .tsx files** - Search for any missed React components

### Duplicate/Alternative Files
- [ ] **tasks-search-bar_rebuild.tsx** - Determine if this replaces the original or can be removed
- [ ] **task-list-item (sortable).tsx** - Check if this is an alternative version or additional functionality

## 🎯 CONVERSION PRIORITY

### Phase 1: Essential Components - complete
1. `TaskItemContextMenu.svelte` - Core task interaction
2. `TagListInput.svelte` - Used in task editing
3. `BubbleText.svelte` - UI component

### Phase 2: Tutorial System - complete
1. `WelcomeTutorial.svelte` - User onboarding
2. `TasksTutorial.svelte` - Feature guidance

### Phase 3: Additional Pages
1. `routes/settings/+page.svelte` - App settings

### Phase 4: Handler Components
These will be moved from components to root-level layout initialization
1. `AppHandlerBackButton.svelte` - Mobile navigation
2. `AppHandlerStateChange.svelte` - App lifecycle

## 🔄 POST-CONVERSION CLEANUP

### After All Files Converted
- [ ] **Remove `/src/old-react-code/` directory**
- [ ] **Update any remaining imports**
- [ ] **Verify no .tsx/.jsx files remain**

---

**Focus**: Convert JSX structure to Svelte5 syntax, maintain component interfaces, preserve styling
