<script lang="ts">
	import { authState } from '$lib/API/Auth';
	import tasksAPI from '$lib/API/Tasks';
	import { Parser } from './parser';
	import { tokenize } from './tokenizer';
	import { QueryEvaluator } from './evaluator';
	import type { Task } from '$domain/models/task';

	let query = $state('status:incomplete');
	let astResult: string = $state('');
	let matchedTasks = $state<Task[]>([]);
	let error: string = $state('');
	let errorStart: number = $state(-1);
	let errorEnd: number = $state(-1);
	const allTasksStore = tasksAPI.getAllUserTasks({});

	function evaluateQuery() {
		try {
			if (query.length === 0) return;
			const tokens = tokenize(query);
			const parser = new Parser(tokens);
			const ast = parser.parse();

			astResult = JSON.stringify(ast, null, 2);
			error = '';
			errorStart = -1;
			errorEnd = -1;

			// Evaluate query against tasks if we have tasks
			if ($allTasksStore.status === 'resolved') {
				const evaluator = new QueryEvaluator();
				matchedTasks = evaluator.evaluate($allTasksStore.data, ast);
			} else {
				matchedTasks = [];
			}
		} catch (e: any) {
			astResult = '';
			matchedTasks = [];
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
		evaluateQuery();
	}

	// Evaluate on query change
	$effect(() => {
		if (query !== undefined) evaluateQuery();
	});

	// Re-evaluate when tasks change
	$effect(() => {
		if ($allTasksStore.status === 'resolved' && query.trim()) {
			evaluateQuery();
		}
	});
</script>

<div class="container">
	<h1>Query Parser Tester</h1>
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

	{#if astResult}
		<div class="result-box">
			<strong>AST:</strong>
			<pre>{astResult}</pre>
		</div>
	{/if}

	{#if $allTasksStore.status === 'resolved'}
		<div class="result-box">
			<strong>Tasks ({$allTasksStore.data.length} total):</strong>
			<div class="tasks-info">
				{#if query.trim() && matchedTasks.length > 0}
					<p class="matched-count">{matchedTasks.length} task(s) matched</p>
					<ul class="task-list">
						{#each matchedTasks as task}
							<li>
								<strong>{task.title}</strong>
								{#if task.dueDate}
									<span class="task-meta"> • Due: {task.dueDate.toLocaleDateString()}</span>
								{/if}
								<div class="task-meta flex flex-col">
									<span>
										• Status: {task.status === 1 ? 'complete' : 'incomplete'}
									</span>
									<span>
										• Due Date: {task.dueDate?.toDateString()}
									</span>
								</div>
							</li>
						{/each}
					</ul>
				{:else if query.trim()}
					<p class="no-results">No tasks matched the query</p>
				{:else}
					<p class="task-count">Enter a query to see matching tasks</p>
				{/if}
			</div>
		</div>
	{:else if $allTasksStore.status === 'error'}
		<div class="error-box">
			<strong>Error loading tasks:</strong>
			{$allTasksStore.error?.message || 'Unknown error'}
		</div>
	{:else}
		<div class="result-box">
			<strong>Loading tasks...</strong>
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

	.tasks-info {
		margin-top: 0.5rem;
	}

	.matched-count {
		margin: 0.5rem 0;
		font-weight: 600;
		color: #28a745;
	}

	.no-results {
		margin: 0.5rem 0;
		color: #666;
		font-style: italic;
	}

	.task-count {
		margin: 0.5rem 0;
		color: #666;
	}

	.task-list {
		margin: 0.5rem 0;
		padding-left: 1.5rem;
		list-style: disc;
	}

	.task-list li {
		margin: 0.5rem 0;
		padding: 0.25rem 0;
	}

	.task-meta {
		color: #666;
		font-size: 0.9rem;
	}
</style>
