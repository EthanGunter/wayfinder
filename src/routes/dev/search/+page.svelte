<script lang="ts">
	import { Parser } from './parser';
	import { tokenize } from './tokenizer';

	let query = $state('status:complete AND (priority:>2 OR dueDate:"last week")');
	let result: string = $state('');
	let error: string = $state('');
	let errorStart: number = $state(-1);
	let errorEnd: number = $state(-1);

	const examples = [
		'status:complete',
		'priority:>2 AND status:incomplete',
		'(priority:>3 OR dueDate:<2025-01-01) AND -status:complete',
		'title:"sprint planning" status:incomplete',
		'isTodaysTask:true AND priority:>=3',
		'(status:complete OR status:incomplete) AND priority:5'
	];

	function parseQuery() {
		try {
			const tokens = tokenize(query);
			const parser = new Parser(tokens);
			const ast = parser.parse();

			result = JSON.stringify(ast, null, 2);
			error = '';
			errorStart = -1;
			errorEnd = -1;
		} catch (e: any) {
			result = '';
			if (e.start !== undefined && e.end !== undefined) {
				error = e.message;
				errorStart = e.start;
				errorEnd = e.end;
			} else {
				error = e.message || 'Unknown error';
				errorStart = -1;
				errorEnd = -1;
			}
		}
	}

	function loadExample(ex: string) {
		query = ex;
		parseQuery();
	}

	// Parse on mount
	$effect(() => {
		if (query !== undefined) parseQuery();
	});
</script>

<div class="container">
	<h1>Query Parser Tester</h1>

	<div class="examples">
		<strong>Examples:</strong>
		{#each examples as ex}
			<button onclick={() => loadExample(ex)}>{ex}</button>
		{/each}
	</div>

	<div class="input-section">
		<label for="query">Query:</label>
		<div class="input-wrapper">
			<input
				id="query"
				type="text"
				bind:value={query}
				placeholder="Enter your query..."
				class:has-error={error}
			/>
			{#if errorStart >= 0 && errorEnd >= 0}
				<div class="error-highlight">
					<span class="before">{query.slice(0, errorStart)}</span><span class="error-text"
						>{query.slice(errorStart, errorEnd)}</span
					><span class="after">{query.slice(errorEnd)}</span>
				</div>
			{/if}
		</div>
	</div>

	{#if error}
		<div class="error-box">
			<strong>Error:</strong>
			{error}
			{#if errorStart >= 0}
				<br /><small>Position {errorStart}-{errorEnd}</small>
			{/if}
		</div>
	{/if}

	{#if result}
		<div class="result-box">
			<strong>AST:</strong>
			<pre>{result}</pre>
		</div>
	{/if}
</div>

<style>
	.container {
		max-width: 900px;
		margin: 2rem auto;
		padding: 2rem;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
	}

	h1 {
		margin-bottom: 1.5rem;
		color: #333;
	}

	.examples {
		margin-bottom: 1.5rem;
		padding: 1rem;
		background: #f5f5f5;
		border-radius: 6px;
	}

	.examples strong {
		display: block;
		margin-bottom: 0.5rem;
		color: #666;
		font-size: 0.9rem;
	}

	.examples button {
		margin: 0.25rem;
		padding: 0.4rem 0.8rem;
		background: white;
		border: 1px solid #ddd;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.85rem;
		transition: all 0.2s;
	}

	.examples button:hover {
		background: #e9ecef;
		border-color: #999;
	}

	.input-section {
		margin-bottom: 1.5rem;
	}

	label {
		display: block;
		margin-bottom: 0.5rem;
		font-weight: 600;
		color: #555;
	}

	.input-wrapper {
		position: relative;
	}

	input {
		width: 100%;
		padding: 0.75rem;
		font-size: 1rem;
		font-family: 'Courier New', monospace;
		border: 2px solid #ddd;
		border-radius: 6px;
		transition: border-color 0.2s;
	}

	input:focus {
		outline: none;
		border-color: #4a90e2;
	}

	input.has-error {
		border-color: #e74c3c;
	}

	.error-highlight {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		padding: 0.75rem;
		font-size: 1rem;
		font-family: 'Courier New', monospace;
		pointer-events: none;
		color: transparent;
		white-space: pre;
		overflow: hidden;
	}

	.error-highlight .error-text {
		background: rgba(231, 76, 60, 0.3);
		color: transparent;
		border-bottom: 2px solid #e74c3c;
	}

	.error-box {
		padding: 1rem;
		background: #fee;
		border-left: 4px solid #e74c3c;
		border-radius: 4px;
		margin-bottom: 1rem;
		color: #c0392b;
	}

	.result-box {
		padding: 1rem;
		background: #f8f9fa;
		border-left: 4px solid #28a745;
		border-radius: 4px;
	}

	.result-box strong {
		display: block;
		margin-bottom: 0.5rem;
		color: #28a745;
	}

	pre {
		margin: 0;
		padding: 1rem;
		background: white;
		border: 1px solid #ddd;
		border-radius: 4px;
		overflow-x: auto;
		font-family: 'Courier New', monospace;
		font-size: 0.9rem;
		line-height: 1.4;
	}
</style>
