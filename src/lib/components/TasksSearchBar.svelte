<script lang="ts">
	interface Props {
		onItemSelected?: (item: any) => void;
		onQueryUpdate?: (search: string) => Promise<any[]>;
		resultDisplay?: (item: any) => HTMLElement;
		defaultOptions?: any[];
		placeholder?: string;
		inverted?: boolean;
	}

	const {
		onItemSelected,
		onQueryUpdate,
		resultDisplay: itemToString,
		defaultOptions = [],
		placeholder = 'Search...',
		inverted = false
	}: Props = $props();

	let query = $state('');
	let searchResults = $state<any[]>([]);
	let showResults = $state(true);
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

	function selectItem(item: string) {
		onItemSelected?.(item);
		query = '';
		searchResults = [];
		showResults = false;
	}

	function handleFocus() {
		if (query.length === 0 && defaultOptions.length > 0) {
			let test = defaultOptions;
			console.log(test);

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

	// Determine which results to show
	let displayResults = $derived(query.length > 0 ? searchResults : defaultOptions);
	$effect(() => {
		console.log(showResults, displayResults);
	});
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

	{#if showResults && displayResults.length > 0}
		<ul class="search-results" class:inverted>
			{#each displayResults as result}
				<li class="search-result">
					<button onclick={() => selectItem(result)} tabindex="0">
						<span class="result-text">
							{itemToString ? itemToString(result) : result.toString()}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if isLoading}
		<div class="search-loading">Searching...</div>
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
		// Layout
		flex: 1 1 auto;
		position: relative;

		input {
			width: 100%;
			z-index: 101; // .pullout z-index +1
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
	}

	.search-results.inverted {
		top: auto;
		bottom: 100%;
	}

	.search-result {
		// Layout
		display: grid;
		grid-template-columns: 1fr 1rem;
		grid-template-rows: 1fr;
		padding: 0.5rem;

		//Style
		background-color: var(--c-bg_-1);
		border-radius: 0.5rem;
		box-shadow: 3px 3px 10px 0 var(--c-shadow);
		justify-content: center;
		align-items: center;
		cursor: pointer;

		span {
			text-align: center;
			width: 100%;

			white-space: nowrap;
			text-overflow: ellipsis;
			overflow: hidden;
		}
		// :nth-child(1) {
		// 	grid-column: 1/2;
		// }
		// :nth-child(2) {
		// 	grid-column: 2/3;
		// }
		button {
			grid-column: 1/3;
		}
	}

	.result-text {
		text-align: center;
		width: 100%;
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
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
