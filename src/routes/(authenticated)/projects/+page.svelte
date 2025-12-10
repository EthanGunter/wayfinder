<script lang="ts">
	import tasksAPI from '$lib/API/Tasks';
	import Icon from '@iconify/svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import ProjectCard from './ProjectCard.svelte';
	import CreateProjectModal from './CreateProjectModal.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { ProjectStatus, isProjectActive } from '$domain/models/project';
	import { settings } from '$lib/user-settings';
	import { get } from 'svelte/store';
	import type { AppNode, IAppNode } from '$domain/models/node';
	import type { ProjectData } from '$domain/models/project';

	const projects = tasksAPI.getProjects();

	type SortMethod = 'momentum' | 'velocity' | 'activity' | 'title' | 'dueDate' | 'created';

	let sortMethod = $state<SortMethod>(
		(get(settings.projects.sorting.defaultProjectSort) as SortMethod) || 'momentum'
	);
	let createModalOpen = $state(false);
	let archivedSectionOpen = $state(false);

	// Separate active and archived projects
	const activeProjects = $derived.by(() => {
		if ($projects.status !== 'resolved') return [];
		return $projects.value.filter((p) => isProjectActive(p.data));
	});

	const archivedProjects = $derived.by(() => {
		if ($projects.status !== 'resolved') return [];
		return $projects.value.filter((p) => !isProjectActive(p.data));
	});

	// Sort projects based on selected method
	function sortProjects(projectsList: IAppNode<ProjectData>[]): IAppNode<ProjectData>[] {
		const sorted = [...projectsList];
		switch (sortMethod) {
			case 'title':
				sorted.sort((a, b) => a.data.title.localeCompare(b.data.title));
				break;
			case 'dueDate':
				sorted.sort((a, b) => {
					if (!a.data.dueDate && !b.data.dueDate) return 0;
					if (!a.data.dueDate) return 1;
					if (!b.data.dueDate) return -1;
					return new Date(a.data.dueDate).getTime() - new Date(b.data.dueDate).getTime();
				});
				break;
			case 'created':
				sorted.sort((a, b) => a.created.getTime() - b.created.getTime());
				break;
			case 'momentum':
				sorted.sort((a, b) => {
					const aMetrics = (a as any).metrics;
					const bMetrics = (b as any).metrics;
					const aScore = aMetrics?.momentumScore ?? 0;
					const bScore = bMetrics?.momentumScore ?? 0;
					return bScore - aScore; // Higher momentum first
				});
				break;
			case 'velocity':
				sorted.sort((a, b) => {
					const aMetrics = (a as any).metrics;
					const bMetrics = (b as any).metrics;
					const aVel = aMetrics?.velocity ?? 0;
					const bVel = bMetrics?.velocity ?? 0;
					return bVel - aVel; // Higher velocity first
				});
				break;
			case 'activity':
				sorted.sort((a, b) => {
					// Sort by lastEdit as proxy for activity (most recent first)
					return b.lastEdit.getTime() - a.lastEdit.getTime();
				});
				break;
		}
		return sorted;
	}

	const sortedActiveProjects = $derived.by(() => {
		sortMethod;
		return sortProjects(activeProjects);
	});
	const sortedArchivedProjects = $derived.by(() => {
		sortMethod;
		return sortProjects(archivedProjects);
	});

	async function handleCreateProject(projectData: {
		title: string;
		content?: string;
		dueDate?: Date;
		uiPrefs?: {
			showStreak?: boolean;
			showVelocity?: boolean;
			showMomentumScore?: boolean;
			showNextAction?: boolean;
			showMicroWins?: boolean;
		};
	}) {
		const [result, error] = await tasksAPI.createProject(projectData);
		if (error) {
			console.error('Failed to create project:', error);
			return;
		}
		// Project will be automatically added to the list via the reactive query
		createModalOpen = false;
	}
</script>

<AppHeader />
<div class="relative flex min-h-0 flex-1 flex-col">
	{#if $projects.status === 'resolved'}
		<div class="flex flex-1 flex-col gap-4 p-4">
			<!-- Sorting Controls -->
			<div class="flex items-center justify-between">
				<h1 class="text-2xl font-semibold">Projects</h1>
				{#if $projects.value.length > 0}
					<Select.Root type="single" bind:value={sortMethod}>
						<Select.Trigger class="w-[180px]">
							<span>{sortMethod.charAt(0).toUpperCase() + sortMethod.slice(1)}</span>
						</Select.Trigger>
						<Select.Content>
							<!-- <Select.Item value="momentum" label="Momentum" />
							<Select.Item value="velocity" label="Velocity" />
							<Select.Item value="activity" label="Activity" /> -->
							<Select.Item value="title" label="Title" />
							<!-- <Select.Item value="dueDate" label="Due Date" /> -->
							<Select.Item value="created" label="Created" />
						</Select.Content>
					</Select.Root>
				{/if}
			</div>

			<!-- Empty State (no projects at all) -->
			{#if $projects.value.length === 0}
				<div
					class="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-muted-foreground"
				>
					<Icon icon="lucide:folder-search" class="h-10 w-10" />
					<p class="text-sm">No projects yet.</p>
					<Button onclick={() => (createModalOpen = true)}>Create your first project</Button>
				</div>
			{:else}
				<!-- Active Projects Section -->
				{#if sortedActiveProjects.length === 0}
					<div
						class="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-muted-foreground"
					>
						<Icon icon="lucide:folder-search" class="h-10 w-10" />
						<p class="text-sm">No active projects</p>
						<Button onclick={() => (createModalOpen = true)}>Create a project</Button>
					</div>
				{:else}
					<span>Active Projects ({activeProjects.length})</span>
					<div class="grid grid-cols-1 gap-4 py-4 md:grid-cols-2 lg:grid-cols-3">
						{#each sortedActiveProjects as project (project.id)}
							<ProjectCard {project} />
						{/each}
						<div class="flex min-h-[200px] items-center justify-center">
							<Button
								class="h-12 w-12 rotate-45 rounded-lg shadow-lg"
								onclick={() => (createModalOpen = true)}
								title="Create new project"
							>
								<Icon icon="lucide:x" />
							</Button>
						</div>
					</div>
				{/if}

				<!-- Archived Projects Section -->
				{#if archivedProjects.length > 0}
					<Collapsible.Root bind:open={archivedSectionOpen}>
						<Collapsible.Trigger
							class="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm font-medium hover:bg-accent"
						>
							<span>Archived Projects ({archivedProjects.length})</span>
							<Icon
								icon="lucide:chevron-down"
								class="h-4 w-4 transition-transform {archivedSectionOpen ? '' : '-rotate-90'}"
							/>
						</Collapsible.Trigger>
						<Collapsible.Content>
							<div class="grid grid-cols-1 gap-4 py-4 md:grid-cols-2 lg:grid-cols-3">
								{#each sortedArchivedProjects as project (project.id)}
									<ProjectCard {project} />
								{/each}
							</div>
						</Collapsible.Content>
					</Collapsible.Root>
				{/if}
			{/if}
		</div>
	{:else if $projects.status === 'loading'}
		<div class="flex flex-1 items-center justify-center py-12 text-muted-foreground">
			<Icon icon="lucide:loader-circle" class="h-6 w-6 animate-spin" />
		</div>
	{:else if $projects.status === 'error'}
		<div class="flex flex-1 items-center justify-center gap-2 py-12 text-destructive">
			<Icon icon="lucide:alert-circle" class="h-5 w-5" />
			<span>Failed to load projects.</span>
		</div>
	{/if}
</div>

<CreateProjectModal bind:open={createModalOpen} onCreate={handleCreateProject} />
