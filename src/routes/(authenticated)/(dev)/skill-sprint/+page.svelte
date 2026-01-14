<script lang="ts">
	import { Input } from "$lib/components/ui/input";

	let goal = $state("");
</script>

<div class="mx-auto w-full max-w-2xl p-4">
	<div class="space-y-2">
		<h1 class="text-xl font-semibold">Skill Sprint</h1>
		<p class="text-sm text-muted-foreground">
			Dev-only experiment. Describe what you want to get good at.
		</p>
	</div>

	<div class="mt-4 space-y-2">
		<label class="text-sm font-medium" for="skill-sprint-goal">Goal</label>
		<textarea
			id="skill-sprint-goal"
			class="min-h-[220px] w-full rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
			bind:value={goal}
			placeholder="E.g. “Get confident designing Convex schemas + SvelteKit UX for daily practice loops…”"
		></textarea>
		<Input type="password" value="test" />

	</div>
</div>

