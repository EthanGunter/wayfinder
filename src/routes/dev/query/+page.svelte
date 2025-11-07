<script lang="ts">
	import type { Task } from '$domain/models/task';
	import { authState } from '$lib/API/Auth';
	import tasksAPI from '$lib/API/Tasks';
	import { taskQueryFieldRegistry } from '$lib/API/Tasks/taskQueryHandlers';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { parseQuery } from '$lib/query/parser';
	import { QueryEvaluator } from '$lib/query/evaluator';
	import type { ASTNode } from '$lib/query/types';
	import { onMount } from 'svelte';

	let allTasks = $state<Task[]>([]);
	let matchingTasks = $state<Task[]>([]);
	let evaluator = new QueryEvaluator<Task>(taskQueryFieldRegistry);

	onMount(() => {
		authState.subscribe((state) => {
			if (state.status === 'signed-in') {
				tasksAPI.getAllUserTasks({ userId: state.user.id }).subscribe((tasks) => {
					if (tasks.status === 'resolved') {
						allTasks = tasks.data;
					}
				});
			}
		});
	});

	let testQueryLibraryOpen = $state(false);
	let input = $state('');
	let ast: ASTNode | null = $state(null);
	let parseError: string | null = $state(null);
	let evalError: string | null = $state(null);
	let source = '';

	type Section = { title: string; items: string[] };
	const TEST_SECTIONS: Section[] = [
		{
			title: 'Parser basics: grouping, AND/OR precedence, implicit AND, errors',
			items: [
				'(title == bug) AND (status == 0)',
				'title == bug OR status == 0',
				'(title == bug OR status == 1) AND (title == test)',
				'title==bug status==0',
				'title==bug && status==0',
				'title==bug || status==0',
				'(status==0 AND (title==bug OR title==test))',
			]
		},
		{
			title: 'Strings: contains, fuzzy, negation, arrays',
			items: [
				'title == bug',
				'title == "Bug report"',
				'title != bug',
				'title ~= bg',
				'title == ""',
				'title != ""',
				'title == ["bug","fix"]',
				'title != ["bug","fix"]',
				'title == ["bug|fix", "test"]',
				'content == test',
				'content != ""',
			]
		},
		{
			title: 'Status enum queries',
			items: [
				'status == 0',
				'status == 1',
				'status != 0',
				'status != 1',
			]
		},
		{
			title: 'Dates: equality, inequality, ranges, relative keywords',
			items: [
				'created == 2025-01-01',
				'created != 2025-01-01',
				'created >= 2025-01-01',
				'created <= 2025-12-31',
				'created > 2025-06-01',
				'created < 2025-06-01',
				'created == 2025-01-01..2025-01-31',
				'created != 2025-01-01..2025-01-31',
				'lastEdit == today',
				'lastEdit >= yesterday',
				'lastEdit <= tomorrow',
			]
		},
		{
			title: 'Collections: OR/AND inside items',
			items: [
				'parents == []',
				'children == []',
				'parents != []',
				'children != []',
			]
		},
		{
			title: 'Tokenizer: quoted strings, spaces, operators inside quotes',
			items: [
				'title   ==   " spaced value "',
				'title=="value with spaces"',
				'title == "a && b || c"',
				'status==0 title==bug',
			]
		},
		{
			title: 'Combined queries',
			items: [
				'title == bug AND status == 0',
				'title == bug OR title == fix',
				'(title == bug OR title == fix) AND status == 0',
				'title ~= bg AND created >= 2025-01-01',
				'status == 0 AND (title == bug OR content == test)',
			]
		}
	];

	function tryParseAndEvaluate(q: string) {
		parseError = null;
		evalError = null;
		ast = null;
		source = q;
		matchingTasks = [];

		try {
			const parsed = parseQuery(q);
			ast = parsed;
		} catch (e: any) {
			parseError = e.messageForUser || e.message || String(e);
			return;
		}

		try {
			if (!ast) return;
			
			if (allTasks.length > 0) {
				matchingTasks = evaluator.evaluate(allTasks, ast);
			}
		} catch (e: any) {
			evalError = e.messageForUser || e.message || String(e);
		}
	}

	function slice(start?: number, end?: number): string {
		if (start == null || end == null) return '';
		return source.slice(start, end);
	}

	function splitOr(root: ASTNode): ASTNode[] {
		if (!root || root.type !== 'or') return root ? [root] : [];
		const out: ASTNode[] = [];
		(function walk(n: ASTNode) {
			if (n.type === 'or') {
				walk(n.left);
				walk(n.right);
			} else {
				out.push(n);
			}
		})(root);
		return out;
	}

	function splitAnd(n: ASTNode): ASTNode[] {
		const target = n.type === 'group' ? n.child : n;
		if (target.type !== 'and') return [];
		const out: ASTNode[] = [];
		(function walk(x: ASTNode) {
			if (x.type === 'and') {
				walk(x.left);
				walk(x.right);
			} else if (x.type === 'group' && x.child.type === 'and') {
				walk(x.child);
			} else {
				out.push(x);
			}
		})(target);
		return out;
	}

	function headerFor(node: ASTNode): string {
		const text = slice(node.start, node.end);
		if (node.type === 'kvp') return `"${text}"`;
		return text;
	}

	function details(n: ASTNode): Record<string, unknown> {
		switch (n.type) {
			case 'kvp':
				return {
					type: n.type,
					key: n.key,
					op: n.op,
					value: n.value,
					start: n.start,
					end: n.end
				};
			default: {
				const any = n;
				return { type: n.type, start: any.start, end: any.end };
			}
		}
	}

	function onSubmit(e: Event) {
		e.preventDefault();
		tryParseAndEvaluate(input);
	}
</script>

<form class="mx-auto flex max-w-4xl flex-col gap-3 p-4" onsubmit={onSubmit}>
	<div class="flex gap-2">
		<input
			type="text"
			placeholder="Type a query..."
			class="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
			bind:value={input}
			oninput={() => tryParseAndEvaluate(input)}
		/>
		<button
			type="submit"
			class="rounded-md border border-neutral-400 bg-neutral-50 px-3 py-2 text-sm"
		>
			Parse
		</button>
	</div>

	<Collapsible.Root class="rounded-md border border-neutral-200" bind:open={testQueryLibraryOpen}>
		<Collapsible.Trigger class="bg-neutral-100 px-3 py-2 text-sm font-medium">
			Test Query Library
		</Collapsible.Trigger>
		<Collapsible.Content class="bg-white px-3 py-2">
			<div class="flex flex-col gap-3">
				{#each TEST_SECTIONS as sec}
					<div class="flex flex-col gap-2">
						<div class="text-sm font-semibold">{sec.title}</div>
						<div class="flex flex-wrap gap-2">
							{#each sec.items as q}
								<button
									type="button"
									class="rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1 font-mono text-xs"
									onclick={() => {
										testQueryLibraryOpen = false;
										input = q;
										tryParseAndEvaluate(input);
									}}
								>
									{q}
								</button>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</Collapsible.Content>
	</Collapsible.Root>

	{#if input}
		<div class="overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 font-mono whitespace-pre">
			{input}
		</div>
	{/if}

	{#if parseError}
		<div class="rounded-md border border-red-300 bg-red-50 px-3 py-2 whitespace-pre-wrap text-red-800">
			Parse error: {parseError}
		</div>
	{/if}

	{#if evalError}
		<div class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 whitespace-pre-wrap text-amber-900">
			Evaluation error: {evalError}
		</div>
	{/if}

	{#if allTasks.length > 0}
		<div class="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
			<div class="font-semibold mb-1">Available Tasks: {allTasks.length}</div>
			<div class="text-xs space-y-1">
				{#each allTasks.slice(0, 3) as task}
					<div class="truncate">
						{task.title} - {task.status === 0 ? 'incomplete' : 'complete'} - created: {new Date(task.created).toLocaleDateString()}
					</div>
				{/each}
				{#if allTasks.length > 3}
					<div class="text-neutral-500">...and {allTasks.length - 3} more</div>
				{/if}
			</div>
		</div>
	{/if}

	{#if ast && matchingTasks.length > 0}
		<div class="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm">
			<div class="font-semibold mb-2">Matching Tasks: {matchingTasks.length}</div>
			<div class="space-y-2 max-h-60 overflow-y-auto">
				{#each matchingTasks as task}
					<div class="border border-green-300 rounded px-2 py-1 bg-white text-xs">
						<div class="font-medium">{task.title}</div>
						<div class="text-neutral-600">
							Status: {task.status === 0 ? 'incomplete' : 'complete'} | 
							Created: {new Date(task.created).toLocaleDateString()}
							{#if task.content}
								| Content: {task.content.slice(0, 50)}{task.content.length > 50 ? '...' : ''}
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{:else if ast && matchingTasks.length === 0 && allTasks.length > 0}
		<div class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
			No tasks match this query
		</div>
	{/if}

	{#if ast}
		{@const top = splitOr(ast)}

		<div class="flex gap-2 overflow-x-auto py-1">
			{#each top as n}
				<Collapsible.Root class="min-w-max rounded-md border border-neutral-200">
					<Collapsible.Trigger class="bg-neutral-100 px-2 py-1 font-mono text-sm">
						{headerFor(n)}
					</Collapsible.Trigger>
					<Collapsible.Content class="bg-white px-2 py-1">
						<pre class="text-xs break-words whitespace-pre-wrap">{JSON.stringify(details(n), null, 2)}</pre>
					</Collapsible.Content>
				</Collapsible.Root>
			{/each}
		</div>

		{#each top as n}
			{#if n.type === 'and' || (n.type === 'group' && n.child.type === 'and')}
				{@const children = n.type === 'and' ? splitAnd(n) : splitAnd(n.child)}
				<div class="flex items-center gap-2 overflow-x-auto">
					{#each children as c, idx}
						<Collapsible.Root class="min-w-max rounded-md border border-neutral-200">
							<Collapsible.Trigger class="bg-neutral-100 px-2 py-1 font-mono text-sm">
								{headerFor(c)}
							</Collapsible.Trigger>
							<Collapsible.Content class="bg-white px-2 py-1">
								<pre class="text-xs break-words whitespace-pre-wrap">{JSON.stringify(details(c), null, 2)}</pre>
							</Collapsible.Content>
						</Collapsible.Root>

						{#if idx < children.length - 1}
							<span class="font-mono text-sm text-neutral-600">AND</span>
						{/if}
					{/each}
				</div>
			{/if}
		{/each}
	{/if}
</form>