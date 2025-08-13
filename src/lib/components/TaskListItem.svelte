<script lang="ts">
	import { goto } from '$app/navigation';
	import { draggable, dragGroup } from '$lib/actions/dnd';
	import type { Task } from '$lib/API/Tasks/Task';
	import ContextMenu from './ContextMenu.svelte';
	import Modal from './overlays/Modal.svelte';

	const {
		task,
		onDragStart,
		onDrop,
		onDelete /* children */
	}: {
		task: Task;
		onDragStart?: (e: CustomEvent) => void;
		onDrop?: (e: CustomEvent) => void;
		onDelete?: (task: Task) => void;
	} = $props();
	
	let listItemEl = $state<HTMLLIElement>();
	let inputEl = $state<HTMLInputElement>();

	let editName = $state(false);
	let title = $state(task.title);

	const DBL_CLICK_MS = 200;
	let dblClickTimeout: NodeJS.Timeout | null;

	// Context menu state
	let showContextMenu = $state(false);
	let showDeleteDialog = $state(false);
	function rename() {
		editName = true;
		showContextMenu = false;
		setTimeout(() => inputEl?.focus(), 0);
	}
	function handleTitleClick() {
		if (!dblClickTimeout) {
			// Single click
			dblClickTimeout = setTimeout(() => {
				goto(`/tasks/?id=${task.id}`);
			}, DBL_CLICK_MS);
		} else {
			// Double click
			clearTimeout(dblClickTimeout);
			dblClickTimeout = null;
			rename();
		}
	}
	function openDeleteDialogue() {
		showDeleteDialog = true;
		showContextMenu = false;
	}
	async function resolveDelete(confirm: boolean) {
		if (confirm) {
			onDelete?.(task);
		}
		showDeleteDialog = false;
	}

	function handleDragStart(e: CustomEvent) {
		onDragStart?.(e);
	}
	function handleDrop(e: CustomEvent) {
		onDrop?.(e);
	}
	function handleBlur() {
		editName = false;
	}
</script>

<li bind:this={listItemEl} class="list-item" use:dragGroup>
	<span
		class="drag-handle"
		use:draggable={{
			type: 'task',
			data: task,
			onDragStart: handleDragStart,
			onDrop: handleDrop,
			delay: 0
		}}
	>
		⧚
	</span>
	{#if editName}
		<input
			bind:this={inputEl}
			class="title"
			type="text"
			bind:value={title}
			onblur={handleBlur}
			onkeydown={(e) => e.key === 'Enter' && handleBlur()}
		/>
	{:else}
		<span
			class="title"
			role="button"
			tabindex="0"
			onclick={handleTitleClick}
			onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleTitleClick()}
			aria-label="Edit task title"
		>
			{title}
		</span>
	{/if}
	<button onclick={() => (showContextMenu = true)}> ⫶ </button>

	<ContextMenu target={listItemEl} bind:open={showContextMenu}>
		<button onclick={rename}> ✏️ Rename </button>
		<!-- <button onclick={openMoveDialogue}> ↗️ Move </button> -->
		<!-- <button onclick={handleTitleClick}> 🔗 Open </button> -->
		<button class="alert" onclick={openDeleteDialogue}> 🗑️ Delete </button>

		<!-- Delete Confirmation Dialog -->
	</ContextMenu>
	<Modal bind:open={showDeleteDialog}>
		<div class="delete-dialog dialog">
			<p>Are you sure you want to delete <strong>{task.title}</strong>?</p>
			<!-- {#if task.children.length > 0}
			 // TODO This is currently not true
				<p>This will also delete <em>all</em> descendants.</p>
			{/if} -->
			<div class="dialog-buttons">
				<button class="alert" onclick={() => resolveDelete(true)}> Yes </button>
				<button onclick={() => resolveDelete(false)}> Cancel </button>
			</div>
		</div>
	</Modal>
	<!-- <TaskItemContextMenu {task} /> -->
</li>

<style lang="scss">
	.list-item {
		// 	// Layout
		// 	position: relative;
		display: flex;
		justify-content: space-between;

		// 	// Style
		// 	list-style: none;
		align-items: center;
		gap: 0.2rem;
		border: 1px solid var(--c-border);
		border-radius: 1rem;
		min-height: min-content;
		min-width: 16rem;
		background: var(--c-bg);
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.title {
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
		background: none;
		align-content: center;
		text-align: start;
		width: 100%;
		height: 100%;
		cursor: text;
		padding: 0.2rem;
	}
	.drag-handle {
		padding: 0 1rem;
		font-size: x-large;
		font-weight: 100;
		opacity: 50%;
	}
	:global(.context-menu button:not(:hover)) {
		border: 1px solid var(--c-bg_-2);
	}
	// // Completion % gradient bar
	// .list-item::before,
	// .list-item::after {
	// 	content: '';
	// 	width: 94%;
	// 	left: 2%;
	// 	position: absolute;
	// 	bottom: 0;
	// 	height: 0.1em;
	// 	pointer-events: none;
	// 	border-radius: 0 0 100% 100%;
	// }
	// .list-item::before {
	// 	background-color: var(--c-bg_-2);
	// }
	// .list-item::after {
	// 	display: var(--completion, none);
	// 	mask-image: linear-gradient(90deg, #000 var(--completion), transparent 0);
	// 	background: linear-gradient(
	// 		90deg,
	// 		var(--c-border) 0%,
	// 		/* rgb(198, 198, 198) 40%, */ var(--c-success) 100%
	// 	);
	// 	// border-radius: 0 0 0.5rem 0.5rem;
	// }

	// .list-item[data-completed]::after {
	// 	background: var(--c-success);
	// }
</style>
