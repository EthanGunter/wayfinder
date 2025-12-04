<script lang="ts">
	import tasksAPI from '$lib/API/Tasks';
	import * as Card from '$lib/components/ui/card';
	import Icon from '@iconify/svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import SvelteMarkdown from '@humanspeak/svelte-markdown';
	import { goto } from '$app/navigation';

	const projects = tasksAPI.getProjects();

	const openProject = (id: string) => goto(`/projects/${id}`);
	const onKeyActivate = (event: KeyboardEvent, id: string) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			openProject(id);
		}
	};
</script>

<AppHeader />
{#if $projects.status === 'resolved'}
	{#if $projects.value.length === 0}
		<div class="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
			<Icon icon="lucide:folder-search" class="h-10 w-10" />
			<p class="text-sm">No projects yet.</p>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 lg:grid-cols-3">
			{#each $projects.value as project (project.id)}
					<Card.Root
						onclick={() => openProject(project.id)}
						onkeydown={(event) => onKeyActivate(event, project.id)}
						class="h-full cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md"
					>
						<Card.Header class="space-y-1">
							<Card.Title class="text-base">
								{(project.data.title ?? '').trim() || 'Untitled project'}
							</Card.Title>
							<p class="truncate text-xs text-muted-foreground">{project.id}</p>
						</Card.Header>
						<Card.Content class="prose prose-sm max-w-none text-muted-foreground">
							<SvelteMarkdown source={project.data.content ?? ''} />
						</Card.Content>
					</Card.Root>
			{/each}
		</div>
	{/if}
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
