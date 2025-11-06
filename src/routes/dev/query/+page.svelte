<script lang="ts">
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { parseQuery } from '$lib/query/parser';
	import type { ASTNode, FieldRegistry } from '$lib/query/types';
	import { onMount } from 'svelte';
	import { taskQueryFieldRegistry } from '$lib/API/Tasks/taskQueryHandlers';

	let input = '';
	let ast: ASTNode | null = null;

	let parseError: string | null = null;
	let handlerError: string | null = null;

	let source = '';

	// Categorized test queries with coverage
	type Section = { title: string; items: string[] };

	const TEST_SECTIONS: Section[] = [
		{
			title: 'Strings: contains, fuzzy, regex, empty, arrays, negation',
			items: [
				'title:bug',
				'title=bug',
				'title:Bug',
				'content:"New Feature"',
				'content = "Some exact phrase"',
				'title = "  leading and trailing  "',
				'title:~bug',
				'title:~"bg"',
				'content:~fix',
				'title:/^bug/i',
				'content:/feature[s]?/i',
				'title:/\\d{3,}/',
				'title:?',
				'content:?',
				'title:[bug,fix,"new feature"]',
				'title:~[bug,fix,"new feature"]',
				'title:!bug',
				'content:!~fix',
				'title:!/bug/i',
				'title:!?',
				'content:!?'
			]
		},
		{
			title: 'Status enum (valid/invalid)',
			items: ['status:complete', 'status=incomplete', 'status = COMPLETE', 'status:done']
		},
		{
			title: 'Invalid numeric ops on strings (should error)',
			items: ['title:>10', 'content:>=2']
		},
		{
			title: 'Dates: absolute, ISO, relative, compares, ranges, null',
			items: [
				'dueDate:2025-01-31',
				'dueDate:2025-01-31T10:00:00Z',
				'dueDate<=10/31/1998',
				'dueDate:tomorrow',
				'todaysTask:yesterday',
				'dueDate:1week',
				'dueDate:3days',
				'dueDate:2months',
				'dueDate:1year',
				'dueDate<2025-01-01',
				'dueDate>2024-12-31',
				'todaysTask>=2025-02-01',
				'todaysTask<=2025-02-28',
				'dueDate:2025-01-01..2025-01-31',
				'todaysTask:2024-12-01..2025-01-15',
				'dueDate:?',
				'todaysTask:?',
				'dueDate:!?',
				'todaysTask:!?'
			]
		},
		{
			title: 'Tolerance (expected failures on dates for now)',
			items: [
				'dueDate:2025-01-01±3',
				'dueDate:2025-01-01+/-3',
				'dueDate:2025-01-01-/+3',
				'dueDate:2025-01-01±3days'
			]
		},
		{
			title: 'Arrays / homogeneity checks / unsupported combinations',
			items: [
				'title:[1, "two", 3]',
				'title:[]',
				'dueDate:[2025-01-01,2025-01-02]'
			]
		},
		{
			title: 'Logical operators and grouping',
			items: [
				'title:bug content:fix',
				'title:bug AND content:fix',
				'title:bug && content:fix',
				'title:bug & content:fix',
				'title:bug OR title:fix',
				'title:bug || title:fix',
				'title:bug | title:fix',
				'(title:bug && content:fix) | status:complete',
				'title:bug && (content:fix | status:complete)',
				'(title:bug & content:fix) | (status:complete || dueDate:tomorrow)',
				'((title:bug && content:fix) && (status:complete | status:incomplete)) | (dueDate:today)',
				'title:bug content:fix )',
				'(title:bug content:fix',
				'()',
				'title:bug AND',
				'OR title:bug'
			]
		},
		{
			title: 'Regex edge cases',
			items: [
				'title:/(/',
				'title:/foo/uuz',
				'title:/foo/',
				'title:/^path\\/to\\/file$/',
				'title:[/^bug/i, /^fix/i]'
			]
		},
		{
			title: 'Fuzzy/contains edge cases',
			items: ['title:~""', 'title:""', 'title:"   "', 'content:~"   "']
		},
		{
			title: 'Negation edge cases',
			items: ['title:![bug,fix]', 'title:!~bug', 'title:!/bug/i', 'title:!>=10']
		},
		{
			title: 'Unknown / unsupported fields',
			items: [
				'foobar:baz',
				'priority:>=2',
				'parents.any:status=complete',
				'children.all:status=incomplete',
				'epic:"x"'
			]
		},
		{
			title: 'Date parser edge cases',
			items: [
				'dueDate:20250101',
				'dueDate:2025-13-01',
				'dueDate:2025-02-30',
				'dueDate:not-a-date',
				'dueDate:1day',
				'dueDate:2days',
				'dueDate:1week',
				'dueDate:2weeks',
				'dueDate:1month',
				'dueDate:2months',
				'dueDate:1year',
				'dueDate:2years'
			]
		},
		{
			title: 'Complex mixes',
			items: [
				'(title:/^bug/i && content:~"crsh") | (status:complete && dueDate:2025-01-01..2025-01-31)',
				'title:bug | title:fix | title:"new feature"',
				'title:/feature/i content:~"rqmt"',
				'(dueDate:? AND todaysTask:!?) | (todaysTask>=2025-02-01 && status:complete)',
				'status:done OR dueDate:2025-02-01±3days OR title:[1, "two"]'
			]
		}
	];

	// Preferred parsing + handler validation
	function tryParseAndValidate(q: string) {
		parseError = null;
		handlerError = null;
		ast = null;
		source = q;

		try {
			const parsed = parseQuery(q);
			ast = parsed;
		} catch (e) {
			parseError = e instanceof Error ? e.message : String(e);
			return;
		}

		// Dry-run handler checks
		try {
			if (!ast) return;
			validateWithHandlers(ast, taskQueryFieldRegistry);
		} catch (e) {
			// Show full stack for dev clarity if present
			handlerError =
				e instanceof Error ? e.stack ?? e.message : String(e);
		}
	}

	function validateWithHandlers(node: ASTNode, registry: FieldRegistry<any>) {
		switch (node.type) {
			case 'kvp': {
				const handler = registry[node.key];
				if (!handler) {
					throw new Error(
						`Unknown field "${node.key}" at [${node.start}..${node.end}]`
					);
				}
				try {
					// Call matches with a super-minimal dummy entity to surface type errors.
					handler.matches({}, node.op as any, node.value as any);
				} catch (err) {
					const span = `[${node.start}..${node.end}]`;
					const msg =
						err instanceof Error ? err.message : String(err);
					throw new Error(
						`Handler failure key="${node.key}" op="${node.op}" at ${span}: ${msg}`
					);
				}
				return;
			}
			case 'and':
				validateWithHandlers(node.left, registry);
				validateWithHandlers(node.right, registry);
				return;
			case 'or':
				validateWithHandlers(node.left, registry);
				validateWithHandlers(node.right, registry);
				return;
			case 'group':
				validateWithHandlers(node.child, registry);
				return;
		}
	}

	onMount(() => {
		// Seed with a helpful example
		input = '(team:alpha && sprint:12) | epic:!?';
		tryParseAndValidate(input);
	});

	function slice(start?: number, end?: number): string {
		if (start == null || end == null) return '';
		return source.slice(start, end);
	}

	// Split a root into top-level OR parts. If not OR, return single.
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

	// If a node is AND (or group containing AND), return children flattened.
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

	// Exact header from source for all nodes now that every node has start/end
	function headerFor(node: ASTNode): string {
		// All nodes now have start/end; quote headers for KVPs per your spec
		const text = slice((node as any).start, (node as any).end);
		if (node.type === 'kvp') return `"${text}"`;
		return text;
	}

	function details(n: ASTNode): Record<string, unknown> {
		// Show minimal node type plus spans; KVPs add key/op/value
		switch (n.type) {
			case 'kvp':
				return {
					type: n.type,
					key: n.key,
					op: n.op,
					negated: n.negated,
					value: n.value,
					start: n.start,
					end: n.end
				};
			default: {
				const any = n as any;
				return { type: n.type, start: any.start, end: any.end };
			}
		}
	}

	function onSubmit(e: Event) {
		e.preventDefault();
		tryParseAndValidate(input);
	}
</script>

<form class="max-w-4xl mx-auto p-4 flex flex-col gap-3" on:submit={onSubmit}>
	<div class="flex gap-2">
		<input
			type="text"
			placeholder="Type a query..."
			class="flex-1 px-3 py-2 border border-neutral-300 rounded-md text-sm"
			bind:value={input}
			on:input={() => tryParseAndValidate(input)}
		/>
		<button
			type="submit"
			class="px-3 py-2 border border-neutral-400 rounded-md bg-neutral-50 text-sm"
		>
			Parse
		</button>
	</div>

	<!-- Test Query Library (collapsible, categorized) -->
	<Collapsible.Root class="border border-neutral-200 rounded-md">
		<Collapsible.Trigger class="px-3 py-2 bg-neutral-100 text-sm font-medium">
			Test Query Library
		</Collapsible.Trigger>
		<Collapsible.Content class="px-3 py-2 bg-white">
			<div class="flex flex-col gap-3">
				{#each TEST_SECTIONS as sec}
					<div class="flex flex-col gap-2">
						<div class="text-sm font-semibold">{sec.title}</div>
						<div class="flex flex-wrap gap-2">
							{#each sec.items as q}
								<button
									type="button"
									class="px-2 py-1 border border-neutral-300 rounded-md bg-neutral-50 text-xs font-mono"
									on:click={() => {
										input = q;
										tryParseAndValidate(input);
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

	<!-- Restated query -->
	{#if input}
		<div class="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-md font-mono whitespace-pre overflow-x-auto">
			{input}
		</div>
	{/if}

	{#if parseError}
		<div class="px-3 py-2 border border-red-300 bg-red-50 text-red-800 rounded-md whitespace-pre-wrap">
			Parse error:
			{parseError}
		</div>
	{/if}

	{#if handlerError}
		<div class="px-3 py-2 border border-amber-300 bg-amber-50 text-amber-900 rounded-md whitespace-pre-wrap">
			Handler error:
			{handlerError}
		</div>
	{/if}

	{#if ast}
		{@const top = splitOr(ast)}

		<!-- Top-level OR parts: side-by-side collapsibles, horizontal scroll -->
		<div class="flex gap-2 overflow-x-auto py-1">
			{#each top as n}
				<Collapsible.Root class="min-w-max border border-neutral-200 rounded-md">
					<Collapsible.Trigger class="px-2 py-1 bg-neutral-100 font-mono text-sm">
						{headerFor(n)}
					</Collapsible.Trigger>
					<Collapsible.Content class="px-2 py-1 bg-white">
						<pre class="text-xs whitespace-pre-wrap break-words">{JSON.stringify(details(n), null, 2)}</pre>
					</Collapsible.Content>
				</Collapsible.Root>
			{/each}
		</div>

		<!-- For each top-level item: if AND (or group containing AND), show children with inline AND -->
		{#each top as n}
			{#if n.type === 'and' || (n.type === 'group' && n.child.type === 'and')}
				{@const children = n.type === 'and' ? splitAnd(n) : splitAnd(n.child)}
				<div class="flex items-center gap-2 overflow-x-auto">
					{#each children as c, idx}
						<Collapsible.Root class="min-w-max border border-neutral-200 rounded-md">
							<Collapsible.Trigger class="px-2 py-1 bg-neutral-100 font-mono text-sm">
								{headerFor(c)}
							</Collapsible.Trigger>
							<Collapsible.Content class="px-2 py-1 bg-white">
								<pre class="text-xs whitespace-pre-wrap break-words">{JSON.stringify(details(c), null, 2)}</pre>
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