<script lang="ts">
	import { TaskStatus, type Task } from '$lib/API/Tasks/Task';
	import { type Snippet } from 'svelte';
	interface Props {
		task: Task;
		onTaskChange?: (original: Task, update: Partial<Task>) => void;
		children: Snippet;
	}
	let { task = $bindable(), onTaskChange, children }: Props = $props();
	let checked = $derived(task.status === TaskStatus.complete);

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.name === 'description') {
			task.content = target.value;
		}
		onTaskChange?.(task, { [target.name]: target.value });
	}

	function handleCheckbox(event: Event) {
		const target = event.target as HTMLInputElement;
		onTaskChange?.(task, { status: target.checked ? TaskStatus.complete : TaskStatus.incomplete });
	}
</script>

<div class="task-editor">
	<div class="title">
		<input type="checkbox" name="completed" bind:checked onchange={handleCheckbox} />
		<input
			name="title"
			class="task-title"
			placeholder="Title"
			bind:value={task.title}
			oninput={handleInput}
		/>
	</div>
	<div class="editor-controls">
		<textarea
			name="description"
			id="task-editor-notes"
			placeholder="Notes"
			bind:value={task.content}
			oninput={handleInput}
		></textarea>
	</div>
	<div class="subtasks">
		{@render children()}
	</div>
</div>

<style>
	.task-editor {
		display: flex;
		flex-direction: column;
		/* background-color: var(--c-bg); */
		height: 100%;

		.title {
			display: flex;
			align-items: center;

			border-top: 1px solid var(--c-border);
			border-bottom: 1px solid var(--c-border);
			/* background-color: var(--c-bg); */

			input[type='checkbox'] {
				margin-left: 1rem;
			}

			.task-title {
				flex-grow: 1;
				font-size: var(--font-size-h3);
				border-bottom: 1px solid var(--c-border);
				margin: 1rem;
			}
		}

		.editor-controls {
			display: flex;
			padding: 0.5rem;
			gap: 0.5rem;

			> * {
				width: 100%;
			}

			span {
				display: flex;
				align-items: center;
				justify-items: center;
				gap: 0.5rem;
				padding: 0.5rem;
				/* border-bottom: 1px solid var(--c-border); */
			}
		}
	}
	.task-editor > .editor-controls > span > :nth-child(1) {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 2rem;
		margin: 0 1rem;
		color: var(--c-text_2);
	}

	.task-editor > .editor-controls > span > :nth-child(2) {
		flex-grow: 1;
	}

	#task-editor-notes {
		min-height: 3rem;
	}

	.task-editor > .subtasks {
		position: relative;
		display: flex;
		flex-direction: column;
		margin-bottom: var(--gap-small);
		flex-grow: 1;
	}

	.task-editor > .subtasks:before {
		content: '';
		pointer-events: none;
		display: block;
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
		z-index: 5;
		box-shadow:
			inset 0 10px 0.6rem -10px var(--c-shadow),
			inset 0 -10px 0.6rem -10px var(--c-shadow);
		border-bottom: 1px solid var(--c-border);
	}
</style>
