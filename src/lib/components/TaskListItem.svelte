<script lang="ts">
	import { goto } from '$app/navigation';
	import { draggable, dragGroup } from '$lib/actions/dnd';
	import type { Task } from '$lib/API/Tasks/Task';
	import * as Sheet from './ui/sheet';
	import { Button } from './ui/button';
	import * as Dialog from './ui/dialog';

	const {
		task,
		onDragStart,
		onDrop,
		onDelete /* children */,
		onTaskChange
	}: {
		task: Task;
		onDragStart?: (e: CustomEvent) => void;
		onDrop?: (e: CustomEvent) => void;
		onDelete?: (task: Task) => void;
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
		if (title != task.title) {
			onTaskChange?.(task, { title });
		}
	}
</script>

<li bind:this={listItemEl} class="flex justify-between items-center gap-1 border border-gray-400 rounded-2xl min-h-min min-w-64 bg-white overflow-hidden text-ellipsis" use:dragGroup>
	<span
		class="px-4 text-xl font-thin opacity-50"
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
			class="whitespace-nowrap text-ellipsis overflow-hidden bg-transparent align-content-center text-start w-full h-full cursor-text p-1"
			type="text"
			bind:value={title}
			onblur={handleBlur}
			onkeydown={(e) => e.key === 'Enter' && handleBlur()}
		/>
	{:else}
		<span
			class="whitespace-nowrap text-ellipsis overflow-hidden bg-transparent align-content-center text-start w-full h-full cursor-text p-1"
			role="button"
			tabindex={0}
			onclick={handleTitleClick}
			onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handleTitleClick()}
			aria-label="Edit task title"
		>
			{title}
		</span>
	{/if}
	<Button onclick={() => (showContextMenu = true)}>⫶</Button>

	<Sheet.Root bind:open={showContextMenu}>
		<Sheet.Content side="bottom" class="p-6 animate-slide-up">
			<Sheet.Header>
				<Sheet.Title>Task Actions</Sheet.Title>
			</Sheet.Header>
			<div class="flex flex-col gap-3">
				<Button onclick={rename} class="w-full justify-start">✏️ Rename</Button>
				<!-- <Button onclick={openMoveDialogue}> ↗️ Move </Button> -->
				<!-- <Button onclick={handleTitleClick}> 🔗 Open </Button> -->
				<Button class="alert w-full justify-start" onclick={openDeleteDialogue}>🗑️ Delete</Button>
			</div>
		</Sheet.Content>
	</Sheet.Root>
	<Dialog.Root bind:open={showDeleteDialog}>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title>Delete Task</Dialog.Title>
			</Dialog.Header>
			<div class="p-4">
				<p>Are you sure you want to delete <strong>{task.title}</strong>?</p>
				<!-- {#if task.children.length > 0}
				 // TODO This is currently not true
					<p>This will also delete <em>all</em> descendants.</p>
				{/if} -->
			</div>
			<Dialog.Footer>
				<Button class="alert" onclick={() => resolveDelete(true)}>Yes</Button>
				<Button onclick={() => resolveDelete(false)}>Cancel</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
	<!-- <TaskItemContextMenu {task} /> -->
</li>
