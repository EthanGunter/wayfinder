<script lang="ts">
	import type { Task } from '$lib/DataAPI/Task';
	import SearchBar from './SearchBar.svelte';
	import { goto } from '$app/navigation';
	import Modal from '$lib/components/overlays/Modal.svelte';
	import type { ITaskStorage } from '$lib/DataAPI/types';
	import { BrowserTaskStorage } from '$lib/DataAPI/BrowserTaskStorage';
	import TooltipStatic from './overlays/TooltipStatic.svelte';
	import OverlayElement from './overlays/OverlayElement.svelte';

	interface Props {
		task: Task;
		displayGotoOption?: boolean;
		onRename?: () => void;
		deleteOverride?: () => void;
		onTaskDeleted?: (taskId: string) => void;
		onTaskMoved?: (taskId: string, newParentId?: string) => void;
	}

	const {
		task,
		displayGotoOption = false,
		onRename,
		deleteOverride,
		onTaskDeleted,
		onTaskMoved
	}: Props = $props();

	let API = $state<Promise<ITaskStorage>>(BrowserTaskStorage.get());
	let showContextMenu = $state(false);
	let showDeleteDialog = $state(false);
	let showMoveMenu = $state(false);
	let searchExpanded = $state(false);

	// Promise resolvers for dialog interactions
	let deleteResolver: ((value: boolean) => void) | null = null;
	let moveResolver: ((value: any) => void) | null = null;

	function openContextMenu(event: MouseEvent) {
		event.stopPropagation();
		event.preventDefault();
		showContextMenu = true;
	}

	function closeContextMenu() {
		showContextMenu = false;
	}

	function rename() {
		onRename?.();
		closeContextMenu();
	}

	function gotoTask() {
		goto(`/tasks/?id=${task.id}`);
		closeContextMenu();
	}

	async function openDeleteDialogue(event: MouseEvent) {
		const api = await API;

		event.preventDefault();
		closeContextMenu();

		showDeleteDialog = true;
		const deleteSubtree = await new Promise<boolean>((resolve) => {
			deleteResolver = resolve;
		});

		if (deleteSubtree) {
			if (deleteOverride) {
				deleteOverride();
			} else {
				try {
					const result = await api.deleteTask(task.id, true);
					if (result.isOk()) {
						console.log('Task deleted successfully:', task.id);
						onTaskDeleted?.(task.id);
					} else {
						console.error('Failed to delete task:', result.error);
					}
				} catch (error) {
					console.error('Error deleting task:', error);
				}
			}
		}

		showDeleteDialog = false;
		deleteResolver = null;
	}

	async function openMoveDialogue(event: MouseEvent) {
		const api = await API;

		event.preventDefault();
		closeContextMenu();

		showMoveMenu = true;
		const moveTarget = await new Promise<any>((resolve) => {
			moveResolver = resolve;
		});

		if (typeof moveTarget === 'string') {
			try {
				const result = await api.updateTask(task.id, { parent: undefined });
				if (result.isOk()) {
					console.log('Moved to root:', task.id);
					onTaskMoved?.(task.id);
					goto('/tasks/');
				} else {
					console.error('Failed to move task to root:', result.error);
				}
			} catch (error) {
				console.error('Error moving task to root:', error);
			}
		} else if (moveTarget) {
			try {
				const result = await api.updateTask(task.id, { parent: moveTarget.id });
				if (result.isOk()) {
					console.log('Moved to parent:', moveTarget.id);
					onTaskMoved?.(task.id, moveTarget.id);
					goto(`/tasks/?id=${moveTarget.id}`);
				} else {
					console.error('Failed to move task to parent:', result.error);
				}
			} catch (error) {
				console.error('Error moving task to parent:', error);
			}
		} else if (moveTarget === null) {
			try {
				const result = await api.updateTask(task.id, { parent: undefined });
				if (result.isOk()) {
					console.log('Moved to root (null):', task.id);
					onTaskMoved?.(task.id);
					goto('/tasks');
				} else {
					console.error('Failed to move task to root (null):', result.error);
				}
			} catch (error) {
				console.error('Error moving task to root (null):', error);
			}
		}

		showMoveMenu = false;
		moveResolver = null;
	}

	function resolveDelete(value: boolean) {
		deleteResolver?.(value);
	}

	function resolveMove(value: any) {
		moveResolver?.(value);
	}

	// async function handleMoveQueryUpdate(query: string) {
	// 	searchExpanded = query.length > 0;
	// 	try {
	// 		const results = await searchTasks(query);
	// 		return results.map((task) => task.title || task.id);
	// 	} catch (error) {
	// 		console.error('Error searching tasks:', error);
	// 		return ['Search error occurred', 'Please try again...'];
	// 	}
	// }

	// Close menus when clicking outside
	function handleOutsideClick(event: MouseEvent) {
		const target = event.target as Element;
		if (!target.closest('.context-menu') && !target.closest('.list-item-menu')) {
			showContextMenu = false;
		}
		if (!target.closest('.delete-dialog')) {
			if (showDeleteDialog && deleteResolver) {
				resolveDelete(false);
			}
		}
		if (!target.closest('.move-menu')) {
			if (showMoveMenu && moveResolver) {
				resolveMove(null);
			}
		}
	}
</script>

<!-- Context Menu Trigger -->
<button class="list-item-menu" onclick={openContextMenu} aria-label="Open task menu"> ⋮ </button>

<!-- Context Menu -->
<Modal bind:open={showContextMenu} >
	<div class="context-menu">
		{#if onRename}
			<button onclick={rename}> ✏️ Rename </button>
		{/if}
		<!-- <button onclick={openMoveDialogue}> ↗️ Move </button> -->
		{#if displayGotoOption}
			<button onclick={gotoTask}> 🔗 Open </button>
		{/if}
		<button class="warning" onclick={openDeleteDialogue}> 🗑️ Delete </button>
	</div>
</Modal>

<!-- Delete Confirmation Dialog -->
<Modal bind:open={showDeleteDialog}>
	<div class="delete-dialog dialog">
		<p>Are you sure you want to delete <strong>{task.title}</strong>?</p>
		{#if task.children && task.children.length > 0}
			<p>This will also delete <em>all</em> descendants.</p>
		{/if}
		<div class="dialog-buttons">
			<button class="warning" onclick={() => resolveDelete(true)}> Yes </button>
			<button onclick={() => resolveDelete(false)}> Cancel </button>
		</div>
	</div>
</Modal>

<!-- Move Task Menu -->
<!-- <Modal bind:open={showMoveMenu}>
	<div class="move-menu dialog" class:expanded={searchExpanded}>
		<h4>Move</h4>
		<h2>{task.title}</h2>
		<SearchBar
			inverted={true}
			onItemSelected={resolveMove}
			defaultOptions={["Searching doesn't work yet"]}
			onQueryUpdate={handleMoveQueryUpdate}
		/>
	</div>
</Modal> -->

<style>
	.list-item-menu {
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.25rem;
		font-size: 1.2rem;
		color: var(--text-muted, #666);
		border-radius: 4px;
	}

	.list-item-menu:hover {
		background-color: var(--background-modifier-hover, #f5f5f5);
		color: var(--text-normal, #000);
	}

	.context-menu {
		/* min-width: 120px;
		min-height: 150px; */

		z-index: 1000;
		padding: 0.5rem 0;

		background: var(--background-primary, white);
		/* border: 1px solid var(--border-color, #ddd); */
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.context-menu button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 1rem;
		border: none;
		background: none;
		text-align: left;
		cursor: pointer;
		font-size: 0.9rem;
		color: var(--text-normal, #000);
	}

	.context-menu button:hover {
		background-color: var(--background-modifier-hover, #f5f5f5);
	}

	.context-menu button.warning {
		color: var(--text-error, #d73a49);
	}

	.context-menu button.warning:hover {
		background-color: var(--background-modifier-error-hover, #ffeaea);
	}

	.dialog-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
	}

	.dialog {
		background: var(--background-primary, white);
		border-radius: 8px;
		padding: 1.5rem;
		max-width: 400px;
		width: 90%;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
	}

	.delete-dialog p {
		margin: 0 0 1rem 0;
		color: var(--text-normal, #000);
	}

	.dialog-buttons {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 1.5rem;
	}

	.dialog-buttons button {
		padding: 0.5rem 1rem;
		/* border: 1px solid var(--border-color, #ddd); */
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.dialog-buttons button.warning {
		background: var(--color-error, #d73a49);
		color: white;
		border-color: var(--color-error, #d73a49);
	}

	.dialog-buttons button:not(.warning) {
		background: var(--background-secondary, #f6f8fa);
		color: var(--text-normal, #000);
	}

	.dialog-buttons button:hover {
		opacity: 0.9;
	}

	.move-menu {
		max-width: 500px;
		width: 95%;
	}

	.move-menu.expanded {
		height: 100vh;
		max-height: none;
		border-radius: 0;
		width: 100%;
		max-width: none;
	}

	#move-task-menu.expanded {
		height: 100vh;
	}

	.move-menu h4,
	.move-menu h2 {
		margin: 0 0 1rem 0;
		color: var(--text-normal, #000);
	}

	.move-menu h4 {
		font-size: 1rem;
		font-weight: 500;
		opacity: 0.8;
	}

	.move-menu h2 {
		font-size: 1.2rem;
		font-weight: 600;
	}

	.move-task-search-results {
		max-height: 300px;
		overflow-y: auto;
	}
</style>
