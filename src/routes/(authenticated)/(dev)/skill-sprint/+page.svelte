<script lang="ts">
	import skillSprintsAPI from '$lib/API/SkillSprints';
	import Icon from '@iconify/svelte';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';

	const sprints = skillSprintsAPI.listUserSprints();

	// Separate active and archived sprints
	const activeSprints = $derived.by(() => {
		if ($sprints.status !== 'resolved') return [];
		return $sprints.value.filter((s) => !s.archivedAt);
	});

	const archivedSprints = $derived.by(() => {
		if ($sprints.status !== 'resolved') return [];
		return $sprints.value.filter((s) => s.archivedAt);
	});

	async function createNewSprint() {
		try {
			const now = Date.now();
			const sprint = await skillSprintsAPI.createSprint({
				title: 'New Skill Sprint',
				goal: '',
				startsAt: now,
				endsAt: now + 7 * 24 * 60 * 60 * 1000
			});
			goto(`/skill-sprint/${sprint._id}`);
		} catch (error) {
			console.error('Failed to create sprint:', error);
		}
	}

	function formatDate(timestamp: number): string {
		return new Date(timestamp).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function getStatus(sprint: (typeof activeSprints)[0]): string {
		const now = Date.now();
		if (now < sprint.startsAt) return 'upcoming';
		if (now > sprint.endsAt) return 'ended';
		return 'active';
	}
</script>

<div class="mx-auto w-full max-w-5xl p-4">
	<div class="space-y-2">
		<h1 class="text-xl font-semibold">Skill Sprints</h1>
		<p class="text-sm text-muted-foreground">
			Dev-only experiment. Start a focused learning sprint to build a new skill.
		</p>
	</div>

	<div class="mt-6 flex flex-col gap-6">
		{#if $sprints.status === 'resolved'}
			<!-- Empty State -->
			{#if $sprints.value.length === 0}
				<div
					class="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-muted-foreground"
				>
					<Icon icon="lucide:target" class="h-10 w-10" />
					<p class="text-sm">No skill sprints yet.</p>
					<Button onclick={createNewSprint}>Create your first sprint</Button>
				</div>
			{:else}
				<!-- Active Sprints -->
				{#if activeSprints.length === 0}
					<div
						class="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-muted-foreground"
					>
						<Icon icon="lucide:target" class="h-10 w-10" />
						<p class="text-sm">No active sprints</p>
						<Button onclick={createNewSprint}>Create a sprint</Button>
					</div>
				{:else}
					<div class="space-y-2">
						<span class="text-sm font-medium">Active Sprints ({activeSprints.length})</span>
						<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
							{#each activeSprints as sprint (sprint._id)}
								<button
									type="button"
									class="group flex flex-col gap-2 rounded-lg border bg-card p-4 text-left hover:bg-accent"
									onclick={() => goto(`/skill-sprint/${sprint._id}`)}
								>
									<div class="flex items-start justify-between gap-2">
										<h3 class="font-medium group-hover:text-accent-foreground">
											{sprint.title}
										</h3>
										<span
											class="rounded-full px-2 py-0.5 text-xs {getStatus(sprint) === 'active'
												? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
												: 'bg-muted text-muted-foreground'}"
										>
											{getStatus(sprint)}
										</span>
									</div>
									<p class="line-clamp-2 text-sm text-muted-foreground">
										{sprint.goal || 'No goal set yet'}
									</p>
									<div class="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
										<Icon icon="lucide:calendar" class="h-3 w-3" />
										<span>{formatDate(sprint.startsAt)} - {formatDate(sprint.endsAt)}</span>
									</div>
								</button>
							{/each}
							<!-- Create New Button -->
							<button
								type="button"
								class="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed hover:border-solid hover:bg-accent"
								onclick={createNewSprint}
								title="Create new sprint"
							>
								<Icon icon="lucide:plus" class="h-8 w-8 text-muted-foreground" />
							</button>
						</div>
					</div>
				{/if}

				<!-- Archived Sprints -->
				{#if archivedSprints.length > 0}
					<div class="space-y-2">
						<span class="text-sm font-medium">Archived Sprints ({archivedSprints.length})</span>
						<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
							{#each archivedSprints as sprint (sprint._id)}
								<button
									type="button"
									class="group flex flex-col gap-2 rounded-lg border bg-card p-4 text-left opacity-60 hover:opacity-100 hover:bg-accent"
									onclick={() => goto(`/skill-sprint/${sprint._id}`)}
								>
									<div class="flex items-start justify-between gap-2">
										<h3 class="font-medium group-hover:text-accent-foreground">
											{sprint.title}
										</h3>
										<Icon icon="lucide:archive" class="h-4 w-4 text-muted-foreground" />
									</div>
									<p class="line-clamp-2 text-sm text-muted-foreground">
										{sprint.goal || 'No goal set yet'}
									</p>
									<div class="mt-auto flex items-center gap-2 text-xs text-muted-foreground">
										<Icon icon="lucide:calendar" class="h-3 w-3" />
										<span>{formatDate(sprint.startsAt)} - {formatDate(sprint.endsAt)}</span>
									</div>
								</button>
							{/each}
						</div>
					</div>
				{/if}
			{/if}
		{:else if $sprints.status === 'loading'}
			<div class="flex flex-1 items-center justify-center py-12 text-muted-foreground">
				<Icon icon="lucide:loader-circle" class="h-6 w-6 animate-spin" />
			</div>
		{:else if $sprints.status === 'error'}
			<div class="flex flex-1 items-center justify-center gap-2 py-12 text-destructive">
				<Icon icon="lucide:alert-circle" class="h-5 w-5" />
				<span>Failed to load sprints.</span>
			</div>
		{/if}
	</div>
</div>
