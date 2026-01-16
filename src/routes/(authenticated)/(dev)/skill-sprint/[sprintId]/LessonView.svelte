<script lang="ts">
	import type { SprintDailyChallenge } from '$lib/API/SkillSprints';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import skillSprintsAPI from '$lib/API/SkillSprints';
	import { cn } from '$lib/utils';

	interface Props {
		lesson: SprintDailyChallenge;
	}

	let { lesson }: Props = $props();

	// Calculate progress
	let completedCount = $derived(
		lesson.items.filter((item) => item.completedAt !== undefined).length
	);
	let totalCount = $derived(lesson.items.length);
	let progressPercent = $derived(totalCount > 0 ? (completedCount / totalCount) * 100 : 0);

	async function toggleItem(itemId: string, currentlyCompleted: boolean) {
		try {
			await skillSprintsAPI.toggleLessonItemCompletion({
				lessonId: lesson._id,
				itemId,
				completed: !currentlyCompleted
			});
		} catch (error) {
			console.error('Failed to toggle item completion:', error);
		}
	}
</script>

<div class="lesson-view mx-auto w-full max-w-3xl space-y-6 p-4">
	<!-- Progress Header -->
	<div class="space-y-2">
		<div class="flex items-center justify-between text-sm text-muted-foreground">
			<span class="font-medium">Progress</span>
			<span>{completedCount} of {totalCount} complete</span>
		</div>
		<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
			<div
				class="h-full bg-primary transition-all duration-300"
				style:width="{progressPercent}%"
			></div>
		</div>
	</div>

	<!-- Lesson Items -->
	<ul class="space-y-3">
		{#each lesson.items as item (item.id)}
			{@const isCompleted = item.completedAt !== undefined}
			<li
				class={cn(
					'flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-opacity',
					isCompleted && 'opacity-60'
				)}
			>
				<Checkbox
					checked={isCompleted}
					onCheckedChange={() => toggleItem(item.id, isCompleted)}
					aria-label={isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
					class="mt-0.5"
				/>
				<div class="flex-1 space-y-2">
					<p class={cn('text-base font-medium', isCompleted && 'line-through')}>
						{item.title}
					</p>
					{#if item.detailsMd}
						<p class="text-sm text-muted-foreground">{item.detailsMd}</p>
					{/if}
				</div>
			</li>
		{/each}
	</ul>
</div>

<style>
	.lesson-view {
		animation: fadeIn 0.3s ease-in;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
