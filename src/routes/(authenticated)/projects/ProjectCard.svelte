<script lang="ts">
	import type { AppNode, IAppNode } from '$domain/models/node';
	import type { ProjectData } from '$domain/models/project';
	import * as Card from '$lib/components/ui/card';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Button } from '$lib/components/ui/button';
	import Icon from '@iconify/svelte';
	import SvelteMarkdown from '@humanspeak/svelte-markdown';
	import { goto } from '$app/navigation';
	import tasksAPI from '$lib/API/Tasks';
	import { confirm } from '$lib/components/ui/inline-modals';

	interface Props {
		project: IAppNode<ProjectData> & {
			metrics?: {
				progress?: { completed: number; total: number; percentage: number };
				momentumScore?: number; // 0-100
				streak?: { days: number; lastActive?: string };
				velocity?: number; // tasks per week
				nextAction?: { id: string; title: string };
				microWins?: number; // tasks completed in last 7 days
				smartTimestamp?: string; // "2h ago - completed 2 tasks"
			};
		};
	}

	let { project }: Props = $props();
	const metrics = project.metrics ?? {};

	const uiPrefs = project.data.uiPrefs ?? {};
	const progress = metrics.progress ?? { completed: 0, total: 0, percentage: 0 };
	const progressPercentage = progress.total > 0 ? progress.percentage : 0;

	function openProject() {
		goto(`/projects/${project.id}`);
	}

	function onKeyActivate(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			openProject();
		}
	}

	async function handleDelete() {
		const confirmed = await confirm({
			title: `Confirm Delete`,
			body: confirmDeleteBody,
			confirmText: 'Delete',
			destructive: true
		});
		if (confirmed) {
			await tasksAPI.deleteTask({ id: project.id });
		}
	}
</script>

{#snippet confirmDeleteBody()}
	<h2 class="text-lg font-normal">
		<p>
			Are you sure you want to <em class="text-destructive">delete</em>
			<code>
				{project.data.title || 'Untitled project'}
			</code>
			and all associated tasks?
			<br />
			<br />
			<em class="text-md text-destructive">This cannot be undone</em>
		</p>
	</h2>
{/snippet}

<Card.Root
	onclick={openProject}
	onkeydown={onKeyActivate}
	class="h-full cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md"
	tabindex={0}
	role="button"
>
	<Card.Header class="relative space-y-2">
		<Card.Title class="flex w-full justify-between text-base">
			{(project.data.title ?? '').trim() || 'Untitled project'}
			<div role="none" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						<Button variant="ghost" size="icon" class="h-8 w-8">
							<Icon icon="lucide:more-vertical" class="h-4 w-4" />
							<span class="sr-only">Project menu</span>
						</Button>
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Item variant="destructive" onclick={handleDelete}>
							<Icon icon="lucide:trash-2" />
							Delete
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		</Card.Title>
		{#if project.data.content}
			<Card.Description class="line-clamp-2 text-xs text-muted-foreground">
				<SvelteMarkdown source={project.data.content} />
			</Card.Description>
		{/if}
	</Card.Header>

	<Card.Content class="space-y-3">
		<!-- Progress Bar -->
		<div class="space-y-1">
			<div class="flex items-center justify-between text-xs">
				<span class="text-muted-foreground">Progress</span>
				<span class="font-medium">{Math.round(progressPercentage)}%</span>
			</div>
			<div class="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
				<div
					class="h-full rounded-full bg-primary transition-all"
					style="width: {progressPercentage}%"
				></div>
			</div>
		</div>

		<!-- Engagement Features (conditional) -->
		<div class="flex flex-wrap items-center gap-2 text-xs">
			{#if uiPrefs.showStreak && metrics.streak}
				<div class="flex items-center gap-1 text-muted-foreground">
					<Icon icon="lucide:flame" class="h-3.5 w-3.5" />
					<span>
						{#if metrics.streak.lastActive}
							{metrics.streak.days > 0
								? `🔥 ${metrics.streak.days} days active`
								: metrics.streak.lastActive}
						{:else}
							🔥 {metrics.streak.days} days active
						{/if}
					</span>
				</div>
			{/if}

			{#if uiPrefs.showVelocity && metrics.velocity !== undefined}
				<div class="flex items-center gap-1 text-muted-foreground">
					<Icon icon="lucide:trending-up" class="h-3.5 w-3.5" />
					<span>→ {metrics.velocity.toFixed(1)} tasks/week</span>
				</div>
			{/if}

			{#if uiPrefs.showMomentumScore !== false && metrics.momentumScore !== undefined}
				<div class="flex items-center gap-1.5">
					<Icon icon="lucide:battery" class="h-3.5 w-3.5" />
					<div class="relative h-2 w-12 overflow-hidden rounded-full bg-muted">
						<div
							class="h-full rounded-full bg-primary transition-all"
							style="width: {metrics.momentumScore}%"
						></div>
					</div>
					<span class="text-xs text-muted-foreground">{metrics.momentumScore}%</span>
				</div>
			{/if}

			{#if uiPrefs.showMicroWins && metrics.microWins !== undefined && metrics.microWins > 0}
				<div class="flex items-center gap-1 text-muted-foreground">
					<Icon icon="lucide:sparkles" class="h-3.5 w-3.5" />
					<span>{metrics.microWins} {metrics.microWins === 1 ? 'win' : 'wins'} this week</span>
				</div>
			{/if}
		</div>

		{#if uiPrefs.showNextAction && metrics.nextAction}
			<div class="rounded-md border border-muted bg-muted/30 p-2 text-xs">
				<span class="text-muted-foreground">Next: </span>
				<span class="truncate">{metrics.nextAction.title}</span>
			</div>
		{/if}
	</Card.Content>

	<Card.Footer class="pt-2">
		{#if metrics.smartTimestamp}
			<p class="text-xs text-muted-foreground">{metrics.smartTimestamp}</p>
		{:else}
			<p class="text-xs text-muted-foreground">
				Last edited {new Date(project.lastEdit).toLocaleDateString()}
			</p>
		{/if}
	</Card.Footer>
</Card.Root>
