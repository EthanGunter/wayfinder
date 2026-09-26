<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { SvelteFlow, SvelteFlowProvider, Background, type NodeTypes } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import TaskCreationDrawer from './TaskCreationDialog.svelte';
	import TaskNode from './TaskNode.svelte';
	import FallbackNode from './FallbackNode.svelte';
	import TaskEdge from './TaskEdge.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Resizable from '$lib/components/ui/resizable';
	import TaskEditor from './TaskEditor.svelte';
	import ProjectEditor from './ProjectEditor.svelte';
	import tasksAPI from '$lib/API/Tasks';
	import type { AppNode, IAppNode } from '$domain/models/node';
	import type { Task } from '$domain/models/task';
	import type { ProjectData } from '$domain/models/project';
	import { page } from '$app/state';
	import Icon from '@iconify/svelte';

	import { appData, svelteFlowInstance, restoreCollapseState } from './logic/shared-state';
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
	import type { ProjectEditorLayoutState } from './ProjectEditor.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import TaskSearchBar from '$lib/components/ui/task-searchbar/TaskSearchBar.svelte';
	import { layoutEngine } from './logic/layout';
	import { Switch } from '$lib/components/ui/switch';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import { settings } from '$lib/user-settings';
	import { keybind } from '$lib/keybind-action';
	import { chordPrimaryToDisplay } from '$lib/user-settings/keybind';
	import type { PageProps } from './$types';

	const fitViewKeybind = settings.graph.keybinds.fitView;
	const searchKeybind = settings.graph.keybinds.search;

	let unsubTasksStore: (() => void) | null = null;
	let unsubShowNodes: (() => void) | null = null;
	let initialLoadDone = false;
	const sfAdapter: SvelteFlowAdapter = new SvelteFlowAdapter();
	const nodes = sfAdapter.nodes;
	const edges = sfAdapter.edges;
	const nodeTypes = { task: TaskNode, fallback: FallbackNode } as NodeTypes;

	let searchBar = $state<TaskSearchBar>();

	const { data }: PageProps = $props();
	const projectStore = data.subtreeStore;
	let project = $derived.by(() => {
		return $projectStore.status === 'resolved'
			? $projectStore.value.find((node) => node.id === page.params.projectId)
			: null;
	});

	let projectEditorLayoutState = $state<ProjectEditorLayoutState>({
		accordionValues: ['children', 'settings'],
		showCompletedTasks: false
	});

	onMount(() => {
		unsubTasksStore = projectStore.subscribe(async (taskSub) => {
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
			const changes: [string, AppNode][] = [];
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

			// Restore persisted collapse state on first load
			if (!initialLoadDone) {
				initialLoadDone = true;
				restoreCollapseState();
			}
		});
		unsubShowNodes = showCompletedNodes.subscribe((show) => {
			if (show) {
				layoutEngine.start(150);
			}
		});

		initializeFromUrl(page.url.searchParams);

		setTimeout(() => {
			layoutEngine.start();
			fitTarget();
		}, 200);

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

	async function onProjectDelete(project: IAppNode<ProjectData>) {
		// Navigate back to projects list after deletion
		await tasksAPI.deleteTask({ id: project.id });
		window.location.href = '/projects';
	}

	function onSelectNode(taskId: string) {
		$selectedNode = appData.get(taskId) ?? null;
		centerAndHighlightNode(taskId);
	}

	function fitTarget() {
		if ($selectedNode) {
			centerAndHighlightNode($selectedNode.id);
		} else {
			$svelteFlowInstance?.fitView({ duration: 400 });
		}
	}
</script>

<AppHeader>
	<!-- svelte-ignore element_invalid_self_closing_tag -->
	<div
		class="hidden"
		use:keybind={{
			setting: settings.graph.keybinds.search,
			action: () => searchBar?.select(),
			target: document
		}}
	/>
	<TaskSearchBar
		bind:this={searchBar}
		class="my-2 mr-4 ml-auto max-w-md justify-self-end"
		subtreeId={page.params.projectId}
		onTaskSelected={(t) => onSelectNode(t.id)}
		onLocateTask={(t) => centerAndHighlightNode(t.id)}
	/>
</AppHeader>
{#if $projectStore.status === 'error'}
	<div class="flex min-h-0 flex-1 items-center justify-center gap-2 text-destructive">
		<Icon icon="lucide:alert-circle" class="h-5 w-5" />
		<span>Failed to load project.</span>
	</div>
{:else if $projectStore.status === 'loading'}
	<div class="flex min-h-0 flex-1 items-center justify-center gap-2 text-muted-foreground">
		<Icon icon="lucide:loader-circle" class="h-5 w-5 animate-spin" />
		<span>Loading project…</span>
	</div>
{:else if $projectStore.status === 'resolved' && $projectStore.value.length === 0}
	<!-- TODO:bug this makes the app literally unusable -->
	<div class="flex min-h-0 flex-1 items-center justify-center gap-2 text-muted-foreground">
		<Icon icon="lucide:folder-open" class="h-5 w-5" />
		<span>This project has no tasks yet.</span>
	</div>
{:else}
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class="flex min-h-0 flex-1 flex-col"
		tabindex="0"
		use:keybind={{
			setting: fitViewKeybind,
			action: fitTarget
		}}
	>
		<Resizable.PaneGroup direction="horizontal" class="flex min-h-0">
			<Resizable.Pane class="relative flex min-h-0 min-w-0" defaultSize={70} minSize={40}>
				<SvelteFlowProvider>
					<div class="relative flex h-full w-full">
						<SvelteFlow
							class="h-full w-full"
							minZoom={0.1}
							maxZoom={2}
							{nodeTypes}
							nodeOrigin={[0.5, 0.5]}
							edgeTypes={{ task: TaskEdge }}
							defaultEdgeOptions={{ type: 'task' }}
							bind:nodes={$nodes}
							bind:edges={$edges}
							{...SvelteFlowEventHandlers}
						>
							<Background bgColor="var(--background)" />
						</SvelteFlow>
						<div
							class="width-max absolute top-6 right-6 grid grid-cols-[12rem] items-center gap-1 [&>*]:h-[3rem]"
						>
							<!-- 					<Select.Root
						type="single"
						value={$algorithmSetting}
						onValueChange={(v) => {
							if (v) {
								algorithmSetting.set(v as typeof $algorithmSetting);
								layoutEngine.start();
							}
						}}
					>
						<Select.Trigger
							class="h-9 w-full rounded-md border-1 border-border bg-white px-3 text-sm"
						>
							{$algorithmSetting}
						</Select.Trigger>
						<Select.Content>
							{#each algorithmSetting.options as opt}
								<Select.Item value={opt.value}>{opt.label}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root> -->

							<label
								class="flex items-center gap-2 rounded-md border-1 border-border bg-white px-3 py-1.5 text-sm"
							>
								<Switch bind:checked={$autoLayout} />
								<span>Auto layout</span>
								<Button
									variant="outline"
									class="m-auto h-7 w-8 rounded-full border-1 border-border bg-white p-0"
									onclick={() => {
										layoutEngine.start();
									}}
								>
									<Icon icon="lucide:refresh-cw" />
								</Button>
							</label>
							<label
								class="flex items-center gap-2 rounded-md border-1 border-border bg-white px-3 py-1.5 text-sm"
							>
								<Switch bind:checked={$showCompletedNodes} />
								<span>Show completed</span>
							</label>
							<ButtonGroup.Root class="flex w-full justify-end">
								<Button
									title={`Fit View (${chordPrimaryToDisplay($fitViewKeybind)})`}
									variant="outline"
									class="flex h-9 items-center justify-center gap-2 rounded-md border-1 border-border bg-white px-3 text-sm"
									onclick={() => {
										fitTarget();
									}}
								>
									<Icon icon="fluent:page-fit-24-regular" class="size-6" />
								</Button>
							</ButtonGroup.Root>
						</div>

						{#if project}
							<Button
								class="absolute right-6 bottom-6 h-12 w-12 rounded-full shadow-lg"
								onclick={() => {
									drawerParams.set({ mode: 'parent', relation: project! });
									drawerOpen.set(true);
								}}
							>
								+
							</Button>
						{/if}
					</div>
				</SvelteFlowProvider>
			</Resizable.Pane>
			<Resizable.Handle />
			<Resizable.Pane
				id="editor-pane"
				class="flex h-full min-h-0 flex-col border-l border-gray-200 bg-white shadow-[-2px_0_8px_rgba(0,0,0,0.06)]"
				defaultSize={30}
				minSize={24}
			>
				{#if $selectedNode && $selectedNode.data.type === 'task'}
					<TaskEditor
						bind:task={$selectedNode as Task}
						bind:layoutState={$editorLayoutState}
						{onTaskChange}
						onDelete={onEditorDelete}
						{onSelectNode}
					/>
				{:else if project && project.data.type === 'project'}
					<ProjectEditor
						bind:project={project as IAppNode<ProjectData>}
						bind:layoutState={projectEditorLayoutState}
						onDelete={onProjectDelete}
						{onSelectNode}
					/>
				{/if}
			</Resizable.Pane>
		</Resizable.PaneGroup>
	</div>
{/if}

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
