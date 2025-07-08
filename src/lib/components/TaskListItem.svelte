<script lang="ts">
	import { goto } from '$app/navigation';
	import { draggable } from '$lib/actions/dnd';
	import type { Task } from '$lib/DataAPI/Task';
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
	function handleGhostRender(args: any) {
		ghostRenderOverride?.(args);
	}
	function handleEdit() {
		editName = true;
	}
	function handleInput(e: Event) {
		title = (e.target as HTMLInputElement).value;
	}
	function handleBlur() {
		editName = false;
		// Save logic here if needed
	}
</script>

<!-- ondblclick={() => (editName = true)} -->
<li
	class="list-item"
	use:draggable={{
		type: 'task',
		data: task,
		onDragStart: handleDragStart,
		onDrop: handleDrop
	}}
>
	{#if editName}
		<input
			type="text"
			bind:value={title}
			onblur={handleBlur}
			onkeydown={(e) => e.key === 'Enter' && handleBlur()}
		/>
	{:else}
		<span
			class="list-item-title"
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
	<TaskItemContextMenu {task} />
</li>

<style lang="scss">
	.list-item {
		// Layout
		position: relative;
		display: grid;
		justify-content: space-between;
		grid-template-areas: 'checkbox header menu' 'checkbox header menu';
		grid-template-columns: 1fr auto;
		grid-template-rows: 1fr auto;

		// Style
		list-style: none;
		align-items: center;
		gap: 0.2rem;
		border: 1px solid var(--c-border);
		border-radius: 1rem;
		min-height: min-content;
		background: var(--c-bg_-1);
		// cursor: grab;
		user-select: none;
	}
	.list-item-header {
		grid-area: header;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.list-item-checkbox {
		grid-area: checkbox;
	}
	.list-item-title {
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
		background: none;
		align-content: center;
		text-align: start;

		> input {
			width: 100%;
		}
	}
	.list-item-details {
		// Layout
		display: flex;
		align-items: center;

		// Style
		margin-left: 0.5rem;
		gap: 0.75rem;
		color: var(--c-text_2);
		svg {
			width: 1.2rem;
		}
	}
	.list-item-checkmark {
		grid-area: checkmark;
	}
	.list-item-menu {
		grid-area: menu;
		cursor: pointer;
	}

	// Completion % gradient bar
	.list-item::before,
	.list-item::after {
		content: '';
		width: 94%;
		left: 2%;
		position: absolute;
		bottom: 0;
		height: 0.1em;
		pointer-events: none;
		border-radius: 0 0 100% 100%;
	}
	.list-item::before {
		background-color: var(--c-bg_-2);
	}
	.list-item::after {
		display: var(--completion, none);
		mask-image: linear-gradient(90deg, #000 var(--completion), transparent 0);
		background: linear-gradient(
			90deg,
			var(--c-border) 0%,
			/* rgb(198, 198, 198) 40%, */ var(--c-success) 100%
		);
		// border-radius: 0 0 0.5rem 0.5rem;
	}

	.list-item[data-completed]::after {
		background: var(--c-success);
	}

	input[type='text'] {
		width: 100%;
		font-size: 1em;
		padding: 0.2em 0.5em;
	}
</style>
