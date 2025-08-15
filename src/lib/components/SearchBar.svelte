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

<div class="search-bar">
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
		/>
	{/if}

	{#if isLoading}
		<div class="search-loading">Searching...</div>
	{:else if showResults && displayResults.length > 0}
		<ul class="search-results" class:inverted>
			{#each displayResults as result}
				<li class="search-result">
					<Button onclick={() => selectItem(result)} tabindex={0}>
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
		/>
	{/if}
</div>

<style lang="scss">
	.search-bar {
		flex: 1 1 auto;
		position: relative;

		input {
			width: 100%;
			z-index: 101;
		}
	}

	.search-results {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 1000;
		max-height: 200px;
		overflow-y: auto;
		margin: 0;
		padding: 0;
		list-style: none;
		gap: 0.25rem;
		display: flex;
		flex-direction: column;
	}

	.search-results.inverted {
		top: auto;
		bottom: 100%;
	}

	.search-result {
		background-color: var(--c-bg_-1);
		border-radius: 0.5rem;
		box-shadow: 3px 3px 10px 0 var(--c-shadow);

		button {
			width: 100%;
			padding: 0.5rem;
			border: none;
			background: none;
			cursor: pointer;
			text-align: left;
			border-radius: 0.5rem;

			&:hover {
				background-color: var(--c-bg);
			}

			&:focus {
				outline: 2px solid var(--c-primary);
				outline-offset: 2px;
			}
		}
	}

	.search-loading {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		padding: 0.5rem 0.75rem;
		font-size: 0.9rem;
		z-index: 1000;
		background-color: var(--c-bg_-1);
		border-radius: 0.5rem;
		box-shadow: 3px 3px 10px 0 var(--c-shadow);
	}
</style>
