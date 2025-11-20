<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { TaskStatus, type Task } from '$domain/models/task';
	import { TaskSearchService } from '$lib/API/Tasks/TaskSearchService';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import SearchTaskListItem from './SearchTaskListItem.svelte';
	import tasksAPI from '$lib/API/Tasks';

	type Props = {
		onTaskSelected?: (task: Task) => void;
		class?: string;
	};

	let { class: className, onTaskSelected }: Props = $props();
	let num = $state(0);

	const searchService = new TaskSearchService();
	let unsubscribeTasks: (() => void) | null = null;
	let currentQuery = $state('');
	let refreshTrigger = $state(0);

	onMount(() => {
		unsubscribeTasks = tasksAPI.getAllUserTasks().subscribe((taskSub) => {
			if (taskSub.status === 'resolved') {
				searchService.reindexTasks(taskSub.value);
				// Trigger refresh if there's an active query
				if (currentQuery.trim()) {
					refreshTrigger++;
				}
			}
		});
	});

	onDestroy(() => {
		unsubscribeTasks?.();
	});

	async function handleSearch(query: string): Promise<Task[]> {
		currentQuery = query;
		return searchService.searchTasks(query, 100).sort((a, b) => {
			if (a.data.status === TaskStatus.complete) return 1;
			else if (b.data.status === TaskStatus.complete) return -1;
			else return a.data.title.localeCompare(b.data.title);
		});
	}
</script>

<SearchBar
	class={className}
	onItemSelected={onTaskSelected}
	handleQuery={handleSearch}
	{refreshTrigger}
>
	{#snippet searchItems(task: Task, onSelect)}
		<SearchTaskListItem {task} {onSelect} />
	{/snippet}
</SearchBar>
