<script lang="ts">
	import { onMount } from 'svelte';
	import { Handle, Position } from '@xyflow/svelte';
	import type { Task } from '$lib/API/Tasks/Task';
	import { isTaskCompleted } from '$lib/API/Tasks/Task';
	import * as Dialog from '$lib/components/ui/dialog';
	import TaskNodeEditor from '../tasks/TaskEditor.svelte';
	import { taskAPIPromise } from '$lib/stores/services';
	import type { ILocalTasks } from '$lib/API/Tasks/types';

	let { data }: { data: Task } = $props();

	let editorOpen = $state(false);
	let pressing = $state(false);
	let moved = $state(false);
	let startX = 0;
	let startY = 0;
	let downTime = 0;
	const TAP_MAX_MOVEMENT = 6;
	const TAP_MAX_DURATION_MS = 250;

	let tasks: ILocalTasks | null = $state(null);

	onMount(async () => {
		tasks = await taskAPIPromise;
	});

	function onPointerDown(event: PointerEvent) {
		pressing = true;
		moved = false;
		startX = event.clientX;
		startY = event.clientY;
		downTime = performance.now();
	}
	function onPointerMove(event: PointerEvent) {
		if (!pressing) return;
		const dx = event.clientX - startX;
		const dy = event.clientY - startY;
		if (Math.hypot(dx, dy) > TAP_MAX_MOVEMENT) moved = true;
	}
	function onPointerUp(event: PointerEvent) {
		if (!pressing) return;
		pressing = false;
		const duration = performance.now() - downTime;
		const isHandle = (event.target as HTMLElement)?.closest?.('.svelte-flow__handle');
		if (!moved && duration <= TAP_MAX_DURATION_MS && !isHandle) {
			editorOpen = true;
		}
	}
	function onPointerCancel() {
		pressing = false;
		moved = false;
	}

	async function onTaskChange(original: Task, update: Partial<Task>) {
		try {
			if (!tasks) tasks = await taskAPIPromise;
			const res = await tasks!.updateTask({ id: original.id, data: update });
			(res as any)?.match?.(
				() => {},
				(err: any) => err?.logError?.()
			);
		} catch (e) {
			console.error('Failed to update task', e);
		}
	}

	async function onDelete(task: Task, recursive: boolean) {
		try {
			if (!tasks) tasks = await taskAPIPromise;
			await tasks!.deleteTask({ id: task.id, recursive });
			// Close editor after deletion
			editorOpen = false;
		} catch (e) {
			console.error('Failed to delete task', e);
		}
	}
</script>

<Dialog.Root bind:open={editorOpen}>
	<div
		class="task-node relative max-w-[280px] min-w-[100px] rounded-md border-1 border-gray-300 bg-white shadow-sm transition-shadow duration-150 hover:shadow-md"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerCancel}
	>
		<div class="flex items-start gap-2 px-3 py-2 {isTaskCompleted(data) ? 'bg-green-100' : ''}">
			<div class="min-w-0 flex-1">
				<div class="truncate text-sm font-semibold text-gray-900" title={data?.title}>
					{data?.title}
				</div>
				{#if data?.content}
					<div class="mt-0.5 line-clamp-2 text-xs text-gray-600" title={data?.content}>
						{data?.content}
					</div>
				{/if}
			</div>
		</div>

		<Handle type="target" position={Position.Top} />
		<Handle type="source" position={Position.Bottom} />
	</div>

	<Dialog.Content>
		<TaskNodeEditor task={data} {onDelete} {onTaskChange} />
	</Dialog.Content>
</Dialog.Root>

<style>
	.task-node :global(.svelte-flow__handle) {
		width: 12px;
		height: 12px;
		border-radius: 9999px;
		border: 2px solid #d1d5db;
		background: white;
	}
</style>
