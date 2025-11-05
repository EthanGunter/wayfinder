<script lang="ts" generics="T">
	import { Err } from '$domain/errors';
	import type { Snippet } from 'svelte';

	interface Props {
		onItemSelected?: (item: T) => void;
		handleQuery: (search: string) => Promise<T[]>;
		sorter?: (a: T, b: T) => number;
		defaultOptions?: T[];
		placeholder?: string;
		inverted?: boolean;
		children?: Snippet<[T]>;
		htmlName?: string;
		className?: string;
		autocomplete?: boolean;
	}

	const {
		onItemSelected,
		handleQuery: onQueryUpdate,
		sorter,
		defaultOptions = [],
		placeholder = 'Search...',
		inverted = false,
		children,
		htmlName = 'searchbar',
		className,
		autocomplete = true
	}: Props = $props();

	let query = $state('');
	let searchResults = $state<T[]>([]);
	let showResults = $state(false);
	let isLoading = $state(false);

	async function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		query = target.value;

		if (onQueryUpdate) {
			isLoading = true;
			try {
				searchResults = await onQueryUpdate(query);
				showResults = query.trim().length > 0 || defaultOptions.length > 0;
			} catch (error) {
				searchResults = [];
				Err.UNHANDLED(error, 'Search error:');
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
			// Select first result
			const firstResult = searchResults[0];
			if (firstResult) {
				selectItem(firstResult);
			}
		} else if (e.key === 'Escape') {
			showResults = false;
		}
	}

	function selectItem(item: T) {
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

	let displayResults = $derived.by<T[]>(() => {
		const base = query.length > 0 ? searchResults : defaultOptions;
		return sorter ? base.slice(0).sort(sorter) : base;
	});
</script>

<div class="relative h-full flex-1 rounded border-1 border-black/10 {className}">
	{#if !inverted}
		<input
			name={htmlName}
			type="text"
			bind:value={query}
			oninput={handleInput}
			onkeydown={handleKeydown}
			onfocus={handleFocus}
			onblur={handleBlur}
			{placeholder}
			aria-label={placeholder}
			class="z-[101] h-full w-full p-2"
			autocomplete={autocomplete ? 'on' : 'off'}
		/>
	{/if}

	{#if isLoading}
		<div
			class="absolute top-full right-0 left-0 z-[1000] m-0 flex max-h-[50vh] list-none flex-col gap-1 overflow-y-auto rounded-b-md bg-gray-50 p-2"
		>
			Searching...
		</div>
	{:else if showResults && displayResults.length > 0}
		{@const sortedDisplayResults = sorter ? displayResults.sort(sorter) : displayResults}
		<ul
			class="absolute top-full right-0 left-0 z-[1000] m-0 flex max-h-[50vh] list-none flex-col gap-1 overflow-y-auto rounded-b-md bg-gray-50 p-2"
			class:bottom-full={inverted}
		>
			{#each sortedDisplayResults as result}
				<li>
					{#if onItemSelected}
						<button
							onclick={() => selectItem(result)}
							tabindex={0}
							class="h-full w-full cursor-pointer border-none bg-transparent text-left transition-colors hover:bg-white focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
						>
							{#if children}
								{@render children(result)}
							{:else}
								<span class="text-gray-900">{result?.toString() ?? ''}</span>
							{/if}
						</button>
					{:else if children}
						{@render children(result)}
					{:else}
						<span class="text-gray-900">{result?.toString() ?? ''}</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if inverted}
		<input
			name={htmlName}
			type="text"
			bind:value={query}
			oninput={handleInput}
			onkeydown={handleKeydown}
			onfocus={handleFocus}
			onblur={handleBlur}
			{placeholder}
			aria-label={placeholder}
			class="z-[101] h-full w-full"
			autocomplete={autocomplete ? 'on' : 'off'}
		/>
	{/if}
</div>
