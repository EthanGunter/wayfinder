<script lang="ts" generics="T">
	import { Err } from '$domain/errors';
	import type { Snippet } from 'svelte';

	interface Props {
		query?: string;
		onItemSelected?: (item: T) => void;
		handleQuery: (search: string) => Promise<T[]>;
		sorter?: (a: T, b: T) => number;
		defaultOptions?: T[];
		placeholder?: string;
		inverted?: boolean;
		searchItems?: Snippet<[T, (() => void)?]>;
		htmlName?: string;
		class?: string;
		autocomplete?: boolean;
		refreshTrigger?: number;
	}

	let {
		query = $bindable(''),
		onItemSelected,
		handleQuery: onQueryUpdate,
		sorter,
		defaultOptions = [],
		placeholder = 'Search...',
		inverted = false,
		searchItems,
		htmlName = 'searchbar',
		class: className,
		refreshTrigger,
	}: Props = $props();

	let searchResults = $state<T[]>([]);
	let showResults = $state(false);
	let isLoading = $state(false);
	let resultsElement: HTMLUListElement | null = $state(null);
	let blurTimeoutId: ReturnType<typeof setTimeout> | null = null;

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
		// Cancel any pending blur timeout
		if (blurTimeoutId) {
			clearTimeout(blurTimeoutId);
			blurTimeoutId = null;
		}
		if (query.length === 0 && defaultOptions.length > 0) {
			showResults = true;
		} else if (searchResults.length > 0) {
			showResults = true;
		}
	}

	function handleBlur(e: FocusEvent) {
		// Delay hiding to allow clicks on results
		// Check if focus is moving to an element within the results dropdown
		const relatedTarget = e.relatedTarget as HTMLElement | null;
		if (relatedTarget && resultsElement?.contains(relatedTarget)) {
			// Cancel any pending timeout since focus is staying within results
			if (blurTimeoutId) {
				clearTimeout(blurTimeoutId);
				blurTimeoutId = null;
			}
			return; // Don't close if focus is moving within results
		}
		
		blurTimeoutId = setTimeout(() => {
			// Double-check that focus hasn't moved back to input or results
			const activeElement = document.activeElement;
			if (
				activeElement &&
				activeElement !== e.target &&
				resultsElement?.contains(activeElement)
			) {
				return;
			}
			showResults = false;
			blurTimeoutId = null;
		}, 150);
	}

	function handleResultsMouseDown(e: MouseEvent) {
		// Prevent blur when clicking inside results
		e.preventDefault();
	}

	function getKey(item: T): string | T {
		// Try to use id property if it exists (for objects like Task)
		if (item && typeof item === 'object' && 'id' in item) {
			return String((item as { id: unknown }).id);
		}
		// Fallback to the item itself
		return item ?? String(item);
	}

	let displayResults = $derived.by<T[]>(() => {
		const base = query.length > 0 ? searchResults : defaultOptions;
		return sorter ? base.slice(0).sort(sorter) : base;
	});

	// Refresh search when refreshTrigger changes
	$effect(() => {
		if (refreshTrigger !== undefined && query.trim() && onQueryUpdate) {
			onQueryUpdate(query).then((results) => {
				searchResults = results;
			});
		}
	});
</script>

<div class="relative flex-1 rounded border-1 border-black/10 {className}">
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
			autocomplete={'off'}
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
			bind:this={resultsElement}
			onmousedown={handleResultsMouseDown}
			role="listbox"
			class="absolute top-full right-0 left-0 z-[1000] m-0 flex max-h-[50vh] list-none flex-col gap-1 overflow-y-auto rounded-b-md bg-gray-50 p-2"
			class:bottom-full={inverted}
		>
			{#each sortedDisplayResults as result (getKey(result))}
				<li>
					{#if searchItems}
						{@render searchItems(result, onItemSelected ? () => selectItem(result) : undefined)}
					{:else if onItemSelected}
						<button
							onclick={() => selectItem(result)}
							tabindex={0}
							class="h-full w-full cursor-pointer border-none bg-transparent text-left transition-colors hover:bg-white focus:outline-2 focus:outline-offset-2 focus:outline-blue-500"
						>
							<span class="text-gray-900">{result?.toString() ?? ''}</span>
						</button>
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
			autocomplete={'off'}
		/>
	{/if}
</div>
