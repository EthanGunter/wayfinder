<script lang="ts" generics="T">
	import { Err } from '$domain/errors';
	import type { Snippet } from 'svelte';

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

<div class="relative flex-1 rounded border-1 border-gray-300">
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
			class="z-[101] h-9 w-full p-2"
		/>
	{/if}

	{#if isLoading}
		<div
			class="absolute top-full right-0 left-0 z-[1000] rounded-lg bg-gray-100 p-2 text-sm shadow-[3px_3px_10px_0_rgba(25,24,24,0.32)]"
		>
			Searching...
		</div>
	{:else if showResults && displayResults.length > 0}
		<ul
			class="absolute top-full right-0 left-0 z-[1000] m-0 flex max-h-[200px] list-none flex-col gap-1 overflow-y-auto p-0"
			class:bottom-full={inverted}
		>
			{#each displayResults as result}
				<li class="rounded-lg bg-gray-100 shadow-[3px_3px_10px_0_rgba(25,24,24,0.32)]">
					<button
						onclick={() => selectItem(result)}
						tabindex={0}
						class="w-full cursor-pointer rounded-lg border-none bg-transparent p-2 text-left transition-colors hover:bg-white focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
					>
						{#if children}
							{@render children(result)}
						{:else}
							<span class="text-gray-900">{result?.toString() ?? ''}</span>
						{/if}
					</button>
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
			class="z-[101] h-9 w-full"
		/>
	{/if}
</div>
