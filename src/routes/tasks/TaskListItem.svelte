<script lang="ts">
	import { goto } from '$app/navigation';
	import { draggable, dragGroup } from '$lib/actions/dnd';
	import * as Sheet from '../../lib/components/ui/sheet';
	import { Button } from '../../lib/components/ui/button';
	import * as Dialog from '../../lib/components/ui/dialog';
	import Icon from '@iconify/svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { dev } from '$app/environment';
	import { isTaskCompleted, TaskStatus, type Task } from '$domain/models/task';

	const {
		task = $bindable(),
		onDragStart,
		onDrop,
		onDelete /* children */,
		onTaskChange
	}: {
		task: Task;
		onDragStart?: (e: CustomEvent) => void;
		onDrop?: (e: CustomEvent) => void;
		onDelete?: (task: Task, recursive: boolean) => void;
		onTaskChange?: (original: Task, changes: Partial<Task>) => void;
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

	// Create a reactive variable that's properly bound to the checkbox
	let checked = $state(isTaskCompleted(task));

	// Keep isCompleted in sync with external changes to task.status
	$effect(() => {
		checked = isTaskCompleted(task);
	});

	// If checkbox changes isCompleted, update the task
	$effect(() => {
		const newStatus = checked ? TaskStatus.complete : TaskStatus.incomplete;
		if (task.status !== newStatus) {
			task.status = newStatus;
			onTaskChange?.(task, { status: newStatus });
		}
	});

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
		} // TODO add touch-hold to rename
	}
	function openDeleteDialogue() {
		showDeleteDialog = true;
		showContextMenu = false;
	}
	async function resolveDelete(confirm: boolean) {
		if (confirm) {
			onDelete?.(task, true);
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
		if (title != task.title) {
			onTaskChange?.(task, { title });
		}
	}
</script>

<li bind:this={listItemEl} class="task-list-item" class:completed={checked} use:dragGroup>
	<Checkbox
		class="mx-3 rounded-md border-gray-500 p-2 text-xl"
		bind:checked
		aria-label={checked ? 'Mark as incomplete' : 'Mark as complete'}
	/>

	{#if editName}
		<input
			bind:this={inputEl}
			class="align-content-center h-full w-full cursor-text overflow-hidden bg-transparent p-1 text-start text-ellipsis whitespace-nowrap"
			type="text"
			bind:value={title}
			onblur={handleBlur}
			onkeydown={(e) => e.key === 'Enter' && handleBlur()}
		/>
	{:else}
		<span
			class="align-content-center h-full w-full cursor-pointer overflow-hidden bg-transparent p-1 text-start text-ellipsis whitespace-nowrap"
			role="button"
			tabindex={0}
			onclick={handleTitleClick}
			onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleTitleClick()}
			aria-label="Edit task title"
			use:draggable={{
				type: 'task',
				data: task,
				onDragStart: handleDragStart,
				onDrop: handleDrop,
				delay: 150
			}}
		>
			{title}
		</span>
	{/if}
	{#if dev}
		<span>{task.id}</span>
	{/if}
	<Button class="rounded-none bg-gray-800" onclick={() => (showContextMenu = true)}>
		<Icon icon="ix:context-menu" />
	</Button>

	<Sheet.Root bind:open={showContextMenu}>
		<Sheet.Content side="bottom" class="animate-slide-up p-6">
			<Sheet.Header>
				<Sheet.Title>Task Actions</Sheet.Title>
			</Sheet.Header>
			<div class="flex flex-col gap-3">
				<Button onclick={rename} class="w-full justify-start">✏️ Rename</Button>
				<!-- <Button onclick={openMoveDialogue}> ↗️ Move </Button> -->
				<!-- <Button onclick={handleTitleClick}> 🔗 Open </Button> -->
				<Button variant="destructive" onclick={openDeleteDialogue}>🗑️ Delete</Button>
			</div>
		</Sheet.Content>
	</Sheet.Root>
	<Dialog.Root bind:open={showDeleteDialog}>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>Are you sure you want to delete <strong>{task.title}</strong>?</Dialog.Title>
			</Dialog.Header>
			<div class="p-4">
				{#if task.children.length > 0}
					<p>This will also delete <em>all</em> descendants.</p>
				{/if}
			</div>
			<Dialog.Footer>
				<Button onclick={() => resolveDelete(false)}>Cancel</Button>
				<Button variant="destructive" onclick={() => resolveDelete(true)}>Yes</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
	<!-- <TaskItemContextMenu {task} /> -->
</li>
