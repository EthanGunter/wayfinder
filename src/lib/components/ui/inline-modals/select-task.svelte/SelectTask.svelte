<script lang="ts" module>
	export type SelectTaskOptions = {
		title?: string | Snippet;
		cancelText?: string | Snippet;
		confirmText?: string | Snippet;
		destructive?: boolean;
	};

	export function selectTask(options: SelectTaskOptions): Promise<Task> {
		return showCustomModal<SelectTaskOptions, Task>({
			id: 'selectTask',
			options,
			snippet: selectTaskSnippet
		});
	}
</script>

<script lang="ts">
	import type { Task } from '$domain/models/task';
	import { showCustomModal, type ModalSnippetArgs } from '../state';
	import type { Snippet } from 'svelte';
	import SelectTaskComponent from './SelectTaskComponent.svelte';
</script>

{#snippet selectTaskSnippet({
	resolve,
	reject,
	options
}: ModalSnippetArgs<Task, SelectTaskOptions>)}
	<SelectTaskComponent {resolve} {reject} {options} />
{/snippet}
