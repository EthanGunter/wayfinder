<script lang="ts">
	import { TaskStatus, type Task } from '$domain/models/task';
	import tasksAPI from '$lib/API/Tasks';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import Icon from '@iconify/svelte';

	interface Props {
		task: Task;
		onLocate?: (task: Task) => void;
	}

	let { task = $bindable(), onLocate }: Props = $props();
	let completed = $derived(task.status === TaskStatus.complete);
</script>

<div class="flex items-center gap-2">
	<Checkbox
		checked={completed}
		onCheckedChange={(checked) => {
			tasksAPI.updateTask({
				id: task.id,
				data: {
					status: checked ? TaskStatus.complete : TaskStatus.incomplete
				}
			});
		}}
	/>

	{task.title}

	<Separator orientation="vertical" />

	{#if onLocate}
		<div class="ml-auto flex items-center gap-1">
			{#if onLocate}
				<button
					class="cursor-pointer rounded-full p-1 hover:bg-blue-500/10 hover:text-blue-500"
					onclick={(e) => {
						e.stopPropagation();
						onLocate(task);
					}}
				>
					<Icon icon="lucide:locate-fixed" />
				</button>
			{/if}
		</div>
	{/if}
</div>
