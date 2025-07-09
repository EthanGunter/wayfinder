<script lang="ts">
	import { draggable, dragGroup } from '$lib/actions/dnd';
	import type { Task } from '$lib/DataAPI/Task';
	import ContextMenu from './ContextMenu.svelte';
	import Modal from './overlays/Modal.svelte';
	import TaskItemContextMenu from './TaskItemContextMenu.svelte';

	const { task, onDragStart, onDrop, ghostRenderOverride, children } = $props<{
		task: Task;
		onDragStart?: (e: CustomEvent) => void;
		onDrop?: (e: CustomEvent) => void;
	}>();

	let editName = $state(false);
	let title = $state(task.title);

	function handleDragStart(e: CustomEvent) {
		onDragStart?.(e);
	}
	function handleDrop(e: CustomEvent) {
		onDrop?.(e);
	}
	function handleDragOver(args: any) {
		ghostRenderOverride?.(args);
	}
	function handleEdit() {
		editName = true;
	}
	function handleBlur() {
		console.log('Blur');

		editName = false;
		// Save logic here if needed
	}
</script>

<li class="list-item" use:dragGroup>
	<span
		class="drag-handle"
		use:draggable={{
			type: 'task',
			data: task,
			onDragStart: handleDragStart,
			onDrop: handleDrop,
			onDragOver: handleDragOver,
			delay: 0
		}}
	>
		<!-- ∷ ⧚ -->
		⧚
	</span>
	{#if editName}
		<input
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
			ondblclick={handleEdit}
			onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleEdit()}
			aria-label="Edit task title"
		>
			{title}
		</span>
	{/if}
	{@render children?.()}
	<ContextMenu>
		<!-- Context Menu -->
		<Modal bind:open={showContextMenu}>
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
				{#if task.dependsOn && task.dependsOn.length > 0}
					<p>This will also delete <em>all</em> descendants.</p>
				{/if}
				<div class="dialog-buttons">
					<button class="warning" onclick={() => resolveDelete(true)}> Yes </button>
					<button onclick={() => resolveDelete(false)}> Cancel </button>
				</div>
			</div>
		</Modal>
	</ContextMenu>
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
		background: var(--c-bg);
		overflow: hidden;
	}

	.title {
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
		background: none;
		align-content: center;
		text-align: start;
		width: 100%;
		cursor: text;
	}
	.drag-handle {
		padding: 0 1rem;
		font-size: x-large;
		font-weight: 100;
		opacity: 50%;
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
