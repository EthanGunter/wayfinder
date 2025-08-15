<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import { Button } from './ui/button';

	interface Props {
		onItemSelected?: (item: T | string) => void;
		handleQuery: (search: string) => Promise<T[]>;
		defaultOptions?: (T | string)[];
		placeholder?: string;
		inverted?: boolean;
		children?: Snippet<[T | string]>;
	}

	const {
		onItemSelected,
		handleQuery: onQueryUpdate,
		defaultOptions = [],
		placeholder = 'Search...',
		inverted = false,
		children
	}: Props = $props();

	let query = $state('');
	let searchResults = $state<T[]>([]);
	let showResults = $state(false);
	let isLoading = $state(false);

	async function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		query = target.value;

		if (onQueryUpdate && query.trim()) {
			isLoading = true;
			try {
				searchResults = await onQueryUpdate(query.trim());
				showResults = true;
			} catch (error) {
				console.error('Search error:', error);
				searchResults = [];
			} finally {
				isLoading = false;
			}
		} else {
			searchResults = [];
			showResults = query.length === 0 && defaultOptions.length > 0;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && query.trim()) {
			// Select first result or the query itself
			const firstResult = searchResults[0] || query.trim();
			selectItem(firstResult);
		} else if (e.key === 'Escape') {
			showResults = false;
		}
	}

	function selectItem(item: T | string) {
		onItemSelected?.(item);
		query = '';
		searchResults = [];
		showResults = false;
	}

	function handleFocus() {
		if (query.length === 0 && defaultOptions.length > 0) {
			showResults = true;
		} else if (searchResults.length > 0) {
			showResults = true;
		}
	}

	function handleBlur() {
		// Delay hiding to allow clicks on results
		setTimeout(() => {
			showResults = false;
		}, 150);
	}

	let displayResults = $derived<(T | string)[]>(query.length > 0 ? searchResults : defaultOptions);
</script>

<div class="flex-1 relative">
	{#if !inverted}
		<input
			type="text"
			bind:value={query}
			oninput={handleInput}
			onkeydown={handleKeydown}
			onfocus={handleFocus}
			onblur={handleBlur}
			{placeholder}
			aria-label={placeholder}
			class="w-full z-[101]"
		/>
	{/if}

	{#if isLoading}
		<div class="absolute top-full left-0 right-0 p-2 text-sm z-[1000] bg-gray-100 rounded-lg shadow-[3px_3px_10px_0_rgba(25,24,24,0.32)]">Searching...</div>
	{:else if showResults && displayResults.length > 0}
		<ul class="absolute top-full left-0 right-0 z-[1000] max-h-[200px] overflow-y-auto m-0 p-0 list-none gap-1 flex flex-col" class:bottom-full={inverted}>
			{#each displayResults as result}
				<li class="bg-gray-100 rounded-lg shadow-[3px_3px_10px_0_rgba(25,24,24,0.32)]">
					<Button onclick={() => selectItem(result)} tabindex={0} class="w-full p-2 border-none bg-transparent cursor-pointer text-left rounded-lg hover:bg-white focus:outline-2 focus:outline-blue-500 focus:outline-offset-2">
						{#if children}
							{@render children(result)}
						{:else}
							{result?.toString() ?? ''}
						{/if}
					</Button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if inverted}
		<input
			type="text"
			bind:value={query}
			oninput={handleInput}
			onkeydown={handleKeydown}
			onfocus={handleFocus}
			onblur={handleBlur}
			{placeholder}
			aria-label={placeholder}
			class="w-full z-[101]"
		/>
	{/if}
</div>
