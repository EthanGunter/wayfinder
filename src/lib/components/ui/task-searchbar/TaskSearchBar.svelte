<script lang="ts">
	import { TaskStatus, type Task } from '$domain/models/task';
	import { TaskSearchService } from '$lib/API/Tasks/TaskSearchService';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import SearchTaskListItem from './SearchTaskListItem.svelte';
	import tasksAPI from '$lib/API/Tasks';

	type Props = {
		onTaskSelected?: (task: Task) => void;
		onLocateTask?: (task: Task) => void;
		class?: string;
		subtreeId?: string;
	};

	let { class: className, onTaskSelected, onLocateTask, subtreeId }: Props = $props();
	let searchBar: SearchBar<Task> | undefined = $state();

	export function select() {
		searchBar?.select();
	}

	export function blur() {
		searchBar?.blur();
	}

	const searchService = new TaskSearchService();
	let currentQuery = $state('');
	let refreshTrigger = $state(0);

	$effect(() => {
		const taskStore = subtreeId 
			? tasksAPI.getProjectSubtree(subtreeId)
			: tasksAPI.getAllUserTasks();
			
		const unsubscribe = taskStore.subscribe((taskSub) => {
			if (taskSub.status === 'resolved') {
				searchService.reindexTasks(taskSub.value);
				// Trigger refresh if there's an active query
				if (currentQuery.trim()) {
					refreshTrigger++;
				}
			}
		});

		return () => unsubscribe();
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
	bind:this={searchBar}
	class={className}
	onItemSelected={onTaskSelected}
	handleQuery={handleSearch}
	{refreshTrigger}
>
	{#snippet searchItems(task: Task, onSelect)}
		<SearchTaskListItem {task} {onSelect} {onLocateTask} />
	{/snippet}
</SearchBar>
