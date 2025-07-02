<script lang="ts">
	import { TaskStatus, type Task } from '$lib/DataAPI/Task';
	import { type Snippet } from 'svelte';
	interface Props {
		task: Task;
		onTaskChange?: (update: Partial<Task>) => void;
		children: Snippet;
	}
	let { task = $bindable(), onTaskChange, children }: Props = $props();

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		onTaskChange?.({ [target.name]: target.value });
	}

	function handleCheckbox(event: Event) {
		const target = event.target as HTMLInputElement;
		onTaskChange?.({ status: target.checked ? TaskStatus.complete : TaskStatus.incomplete });
	}
</script>

<div class="task-editor">
	<div class="header">
		<input
			name="title"
			class="task-title"
			placeholder="Title"
			bind:value={task.title}
			oninput={handleInput}
		/>
	</div>
	<div class="content">
		{@render children()}
	</div>
	<div class="footer">
		<span>
			<input
				type="checkbox"
				name="completed"
				bind:checked={task.completed}
				onchange={handleCheckbox}
			/>
			<label for="task-editor-completion">Completed</label>
		</span>
		<span>
			<label for="task-editor-notes">Notes</label>
			<textarea
				name="description"
				id="task-editor-notes"
				placeholder="Notes"
				bind:value={task.content}
				oninput={handleInput}
			></textarea>
		</span>
	</div>
</div>

<style>
	.task-editor {
		display: flex;
		flex-direction: column;
		background-color: var(--c-bg);
		height: 100%;
	}

	.task-editor > .header {
		display: flex;
		border-top: 1px solid var(--c-border);
		align-items: center;
	}

	.task-title {
		flex-grow: 1;
		font-size: var(--font-size-h3);
		border-bottom: 1px solid var(--c-border);
		margin: 1rem;
	}

	.task-editor > .content {
		position: relative;
		display: flex;
		flex-direction: column;
		padding-bottom: var(--gap-small);
	}

	.task-editor > .content:before {
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

	.task-editor > .footer > span {
		display: flex;
		align-items: center;
		justify-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		border-bottom: 1px solid var(--c-border);
	}

	.task-editor > .footer > span > :nth-child(1) {
		display: flex;
		justify-content: center;
		align-items: center;
		width: 2rem;
		margin: 0 1rem;
		color: var(--c-text_2);
	}

	.task-editor > .footer > span > :nth-child(2) {
		flex-grow: 1;
	}

	#task-editor-notes {
		min-height: 3rem;
	}
</style>
