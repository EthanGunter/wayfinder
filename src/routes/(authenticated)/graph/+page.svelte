<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { SvelteFlow, SvelteFlowProvider, Background } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import TaskCreationDrawer from './TaskCreationDrawer.svelte';
	import TaskNode from './TaskNode.svelte';
	import TaskEdge from './TaskEdge.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Resizable from '$lib/components/ui/resizable';
	import TaskEditor from './TaskEditor.svelte';
	import tasksAPI from '$lib/API/Tasks';
	import { type Task } from '$domain/models/task';
	import { page } from '$app/state';
	import Icon from '@iconify/svelte';

	import { appData, svelteFlowInstance } from './logic/shared-state';
	import { initializeFromUrl, centerAndHighlightNode } from './logic/navigation';
	import { SvelteFlowAdapter, SvelteFlowEventHandlers } from './logic/svelte-flow';
	import {
		selectedNode as selectedNode,
		editorLayoutState,
		drawerParams,
		drawerOpen,
		// layoutPaused,
		showCompletedNodes,
		autoLayout
	} from './logic/ui-state';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import TaskSearchBar from '$lib/components/ui/task-searchbar/TaskSearchBar.svelte';
	import { layoutEngine } from './logic/layout';
	import { Switch } from '$lib/components/ui/switch';

	let unsubTasksStore: (() => void) | null = null;
	let unsubShowNodes: (() => void) | null = null;
	const sfAdapter: SvelteFlowAdapter = new SvelteFlowAdapter();
	const nodes = sfAdapter.nodes;
	const edges = sfAdapter.edges;

	onMount(() => {
		unsubTasksStore = tasksAPI.getAllUserTasks().subscribe(async (taskSub) => {
			if (taskSub.status !== 'resolved') return;

			// Get set of IDs from server
			const serverIds = new Set(taskSub.value.map((node) => node.id));
			// Get set of IDs currently in appData
			const currentIds = new Set(appData.keys());

			// Find IDs to delete (in appData but not in server)
			const idsToDelete = Array.from(currentIds).filter((id) => !serverIds.has(id));

			// Delete items that are no longer in server response
			for (const id of idsToDelete) {
				appData.delete(id);
			}

			// Calculate what items have changed
			// Efficiently find changed/added tasks to avoid unnecessary updates
			const changes: [string, Task][] = [];
			// TODO:Refactor this should be moved up to the convex task provider,
			// probably inside the createQueryable function.
			for (const node of taskSub.value) {
				const existing = appData.get(node.id);
				// Compare existing node with new node. If different or missing, add to changes.
				if (!existing || JSON.stringify(existing) !== JSON.stringify(node)) {
					changes.push([node.id, node]);
				}
			}

			// Add/update items from server
			changes.forEach(([id, node]) => {
				appData.set(id, node);
			});

			layoutEngine.start(300);
			// $layoutPaused = false;

			setTimeout(() => {
				$svelteFlowInstance?.fitView();
			}, 100);
		});
		unsubShowNodes = showCompletedNodes.subscribe((show) => {
			if (show) {
				layoutEngine.start();
			}
		});

		initializeFromUrl(page.url.searchParams);
		return () => {
			unsubTasksStore?.();
		};
	});

	onDestroy(() => {
		unsubTasksStore?.();
		layoutEngine.destroy();
		sfAdapter.destroy();
	});

	async function onTaskChange(original: Task, update: Partial<Task>) {
		const [_, err] = await tasksAPI.updateTask({ id: original.id, ...update });
		if (err) err.UNHANDLED();
	}

	async function onEditorDelete(task: Task) {
		const parent = appData.get(task.parents[0]);
		$selectedNode = parent ?? null;
		await tasksAPI.deleteTask({ id: task.id });
	}

	function onSelectNode(taskId: string) {
		$selectedNode = appData.get(taskId) ?? null;
		centerAndHighlightNode(taskId);
	}
</script>

<AppHeader>
	<TaskSearchBar
		class="my-2 mr-4 ml-auto max-w-md justify-self-end"
		onTaskSelected={(t) => onSelectNode(t.id)}
	/>
</AppHeader>
<Resizable.PaneGroup direction="horizontal" class="flex min-h-0">
	<Resizable.Pane class="flex min-h-0 min-w-0" defaultSize={70} minSize={40}>
		<SvelteFlowProvider>
			<div class="relative flex h-full w-full">
				<SvelteFlow
					class="h-full w-full"
					minZoom={0.1}
					maxZoom={2}
					nodeTypes={{ task: TaskNode }}
					nodeOrigin={[0.5, 0.5]}
					edgeTypes={{ task: TaskEdge }}
					defaultEdgeOptions={{ type: 'task' }}
					bind:nodes={$nodes}
					bind:edges={$edges}
					{...SvelteFlowEventHandlers}
				>
					<Background bgColor="var(--background)" />
				</SvelteFlow>
				<Button
					variant="outline"
					class="absolute right-6 bottom-6 h-9 w-10 rounded-full border-1 border-border bg-white"
					onclick={() => {
						drawerParams.set(null);
						drawerOpen.set(true);
					}}
				>
					+
				</Button>
				<div class="width-max absolute top-6 right-6 grid grid-cols-[12rem] [&>*]:h-[3rem] items-center gap-1">
					<label
						class="flex items-center gap-2 rounded-md border-1 border-border bg-white px-3 py-1.5 text-sm"
					>
						<Switch bind:checked={$showCompletedNodes} />
						<span>Show completed</span>
					</label>
					<label
						class="flex items-center gap-2 rounded-md border-1 border-border bg-white px-3 py-1.5 text-sm"
					>
						<Switch bind:checked={$autoLayout} />
						<span>Auto layout</span>
						{#if !$autoLayout}
							<Button
								variant="outline"
								class="h-7 w-8 rounded-full border-1 border-border bg-white p-0 m-auto"
								onclick={() => {
									layoutEngine.start();
								}}
							>
								<Icon icon="lucide:refresh-cw" />
							</Button>
						{/if}
					</label>
				</div>
			</div>
		</SvelteFlowProvider>
	</Resizable.Pane>
	{#if $selectedNode}
		<Resizable.Handle />
		<Resizable.Pane
			class="flex h-full min-h-0 flex-col border-l border-gray-200 bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.06)]"
			defaultSize={30}
			minSize={24}
		>
			{#if $selectedNode.data.type === 'task'}
				<TaskEditor
					bind:task={$selectedNode as Task}
					bind:layoutState={$editorLayoutState}
					{onTaskChange}
					onDelete={onEditorDelete}
					{onSelectNode}
				/>
			{/if}
		</Resizable.Pane>
	{/if}
</Resizable.PaneGroup>

<TaskCreationDrawer
	bind:open={$drawerOpen}
	relation={$drawerParams?.relation}
	relationMode={$drawerParams?.mode}
/>

<style>
	:global(.svelte-flow__attribution) {
		display: none;
	}

	:global(.svelte-flow__edgeupdater) {
		z-index: 20;
		pointer-events: all;
	}
</style>
