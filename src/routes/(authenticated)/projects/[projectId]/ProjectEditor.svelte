<script lang="ts">
	import Icon from '@iconify/svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Accordion from '$lib/components/ui/accordion';
	import * as Select from '$lib/components/ui/select';
	import { Switch } from '$lib/components/ui/switch';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import ScrollWithHeader from '$lib/components/ScrollWithHeader.svelte';
	import MarkdownEditor from '$lib/components/ui/markdown-editor';
	import tasksAPI from '$lib/API/Tasks';
	import { Err } from '$domain/errors';
	import type { IAppNode } from '$domain/models/node';
	import type { ProjectData } from '$domain/models/project';
	import { ProjectStatus, isProjectActive } from '$domain/models/project';
	import { confirm } from '$lib/components/ui/inline-modals';
	import TaskList from './TaskList.svelte';
	import type { Task } from '$domain/models/task';
	import { drawerOpen, drawerParams } from './logic/ui-state';

	export interface ProjectEditorLayoutState {
		accordionValues: ('children' | 'settings')[];
		showCompletedTasks: boolean;
	}

	interface Props {
		project: IAppNode<ProjectData>;
		onDelete: (project: IAppNode<ProjectData>) => void;
		onSelectNode?: (taskId: string) => void;
		layoutState?: ProjectEditorLayoutState;
	}

	// Props
	let {
		project = $bindable(),
		layoutState = $bindable({
			accordionValues: ['children', 'settings'],
			showCompletedTasks: false
		}),
		onDelete,
		onSelectNode
	}: Props = $props();

	// Internals
	let accordionValues = $derived(layoutState.accordionValues);

	// Derived data
	const childTasksStore = tasksAPI.getChildrenOf(project.id);

	$effect(() => {
		project.id;
		childTasksStore.updateQuery({ id: project.id });
	});

	$effect(() => {
		if ($childTasksStore.status === 'error') {
			Err.UNHANDLED($childTasksStore.error, 'Failed to get project children');
		}
	});

	function handleInput(event: Event) {
		const el = event.target as HTMLInputElement | HTMLTextAreaElement;
		if (!el?.name) return;
		const patch: Partial<IAppNode<ProjectData>> = { [el.name]: el.value };
		Object.assign(project, patch);
		tasksAPI.updateProject({ id: project.id, ...patch });
	}

	// Reorder children
	async function reorderChildren(movingId: string, startIndex: number, finishIndex: number) {
		if (finishIndex === startIndex) return;
		const children = $childTasksStore;
		if (children.status !== 'resolved') return;

		const currentIds = (project.children ?? []).slice();
		const from = currentIds.indexOf(movingId);
		if (from < 0) return;

		const list = children.value;
		const target = list[Math.min(finishIndex, list.length - 1)];
		let to = target ? currentIds.indexOf(target.id) : currentIds.length;
		if (to < 0) to = currentIds.length;
		if (finishIndex > startIndex && to >= 0) to = to + 1;

		currentIds.splice(from, 1);
		const adjustedTo = from < to ? to - 1 : to;
		currentIds.splice(adjustedTo, 0, movingId);

		project.children = currentIds;
		const [_, e] = await tasksAPI.updateProject({
			id: project.id,
			children: currentIds
		});
		if (e) e.UNHANDLED('Failed to reorder children');
	}

	function handleAddChildTask() {
		drawerParams.set({ relation: project, mode: 'parent' });
		drawerOpen.set(true);
	}

	async function handleLinkTask() {
		const { selectTask } = await import('$lib/components/ui/inline-modals');
		const selectedTask = await selectTask({ title: 'Select Task to Link' });
		if (!selectedTask.id || project.id === selectedTask.id) return;

		// Check if task is already a child
		const existingChildren = project.children ?? [];
		if (existingChildren.includes(selectedTask.id)) {
			return;
		}

		// Update project: add selectedTask as child
		const [_, err1] = await tasksAPI.updateProject({
			id: project.id,
			addChildren: [selectedTask.id]
		});
		if (err1) {
			Err.UNHANDLED(err1, 'Failed to link task');
		}
	}

	async function handleDisconnectTask(child: string, parent: string) {
		const [_, err] = await tasksAPI.updateProject({
			id: parent,
			removeChildren: [child]
		});
		if (err) err?.UNHANDLED('Failed to disconnect task');
	}

	// Status handling
	let statusValue = $derived(project.data.status === ProjectStatus.active ? 'active' : 'archived');

	function handleStatusChange(value: string | undefined) {
		if (!value) return;
		const newStatus = value === 'active' ? ProjectStatus.active : ProjectStatus.archived;
		if (project.data.status === newStatus) return;
		project.data.status = newStatus;
		tasksAPI.updateProject({ id: project.id, status: newStatus });
	}

	// UI Prefs handling
	function toggleUiPref(key: keyof NonNullable<ProjectData['uiPrefs']>) {
		const currentPrefs = project.data.uiPrefs ?? {};
		const newPrefs = {
			...currentPrefs,
			[key]: !currentPrefs[key]
		};
		project.data.uiPrefs = newPrefs;
		tasksAPI.updateProject({ id: project.id, uiPrefs: newPrefs });
	}
</script>

<ScrollWithHeader class="relative flex h-full w-full flex-col bg-white">
	{#snippet header()}
		<div class="flex h-10 items-start gap-2 p-2">
			<Icon icon="lucide:folder" class="mt-1 size-5 text-primary" />
			<input
				class="text-md mx-1 w-full border-0 border-b-1 bg-transparent font-semibold text-gray-900 placeholder-gray-400 focus:ring-0 focus:outline-none"
				id="input-project-title"
				name="title"
				bind:value={project.data.title}
				placeholder="Project title"
				oninput={handleInput}
			/>
		</div>
	{/snippet}

	{#snippet content()}
		<div class="flex h-full min-h-0 flex-col gap-2 p-3">
			<!-- Status -->
			<!-- <div class="flex items-center justify-between">
				<label class="text-sm font-medium">Status</label>
				<Select.Root type="single" value={statusValue} onValueChange={handleStatusChange}>
					<Select.Trigger class=" mb-2">
						<span class="capitalize">{statusValue}</span>
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="active" label="Active" />
						<Select.Item value="archived" label="Archived" />
					</Select.Content>
				</Select.Root>
			</div> -->
			<MarkdownEditor
				value={project.data.content ?? ''}
				onChange={(md) => tasksAPI.updateProject({ id: project.id, content: md })}
			/>

			<Accordion.Root
				type="multiple"
				value={accordionValues}
				onValueChange={(e) => {
					layoutState.accordionValues = e as any;
				}}
				class="mt-auto"
			>
				<Accordion.Item value="children">
					<Accordion.Trigger
						class="priority-trigger flex items-center justify-between py-2 text-sm text-gray-700 [&>svg]:!-rotate-180 [&[data-state=open]>svg]:!-rotate-0"
					>
						Tasks
					</Accordion.Trigger>
					<Accordion.Content>
						{#if $childTasksStore.status === 'resolved'}
							{@const taskChildren = $childTasksStore.value.filter(
								(t) => t.data.type === 'task'
							) as Task[]}
							<TaskList
								showCompleted={layoutState.showCompletedTasks}
								tasks={taskChildren ?? []}
								parentId={project.id}
								id={`child-${project.id}`}
								onSelect={(id) => {
									onSelectNode?.(id);
								}}
								onDisconnect={handleDisconnectTask}
								onReorder={(taskId, startIndex, finishIndex) =>
									reorderChildren(taskId, startIndex, finishIndex)}
								onAddTask={handleAddChildTask}
								onLink={handleLinkTask}
							/>
						{/if}
					</Accordion.Content>
				</Accordion.Item>

				<Accordion.Item value="settings">
					<Accordion.Trigger
						class="priority-trigger flex items-center justify-between py-2 text-sm text-gray-700 [&>svg]:!-rotate-180 [&[data-state=open]>svg]:!-rotate-0"
					>
						Settings
					</Accordion.Trigger>
					<Accordion.Content>
						<div class="space-y-4 py-2">
							<!-- UI Preferences -->
							<p class="text-sm font-medium">Display Options</p>
							<div class="space-y-2">
								<label class="flex items-center justify-between text-sm">
									<span>Show Streak</span>
									<Switch
										checked={project.data.uiPrefs?.showStreak ?? false}
										onCheckedChange={() => toggleUiPref('showStreak')}
									/>
								</label>
								<label class="flex items-center justify-between text-sm">
									<span>Show Velocity</span>
									<Switch
										checked={project.data.uiPrefs?.showVelocity ?? false}
										onCheckedChange={() => toggleUiPref('showVelocity')}
									/>
								</label>
<!-- 								<label class="flex items-center justify-between text-sm">
									<span>Show Momentum Score</span>
									<Switch
										checked={project.data.uiPrefs?.showMomentumScore ?? true}
										onCheckedChange={() => toggleUiPref('showMomentumScore')}
									/>
								</label>
								<label class="flex items-center justify-between text-sm">
									<span>Show Next Action</span>
									<Switch
										checked={project.data.uiPrefs?.showNextAction ?? true}
										onCheckedChange={() => toggleUiPref('showNextAction')}
									/>
								</label>
								<label class="flex items-center justify-between text-sm">
									<span>Show Micro Wins</span>
									<Switch
										checked={project.data.uiPrefs?.showMicroWins ?? false}
										onCheckedChange={() => toggleUiPref('showMicroWins')}
									/>
								</label> -->
							</div>
						</div>
					</Accordion.Content>
				</Accordion.Item>
			</Accordion.Root>
		</div>
	{/snippet}
</ScrollWithHeader>
