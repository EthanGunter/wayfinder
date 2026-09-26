<script lang="ts">
	import * as ResponsiveDialog from '$lib/components/ui/responsive-dialog';
	import Button from '$lib/components/ui/button/button.svelte';
	import Icon from '@iconify/svelte';
	import { authState } from '$lib/API/Auth';
	import { v4 } from 'uuid';
	import { Err } from '$domain/errors';
	import { TaskStatus, type CreateTaskParams, type Task } from '$domain/models/task';
	import tasksAPI from '$lib/API/Tasks';
	import { pendingNodeParams } from './logic/ui-state';
	import type { AppNode } from '$domain/models/node';
	import { svelteFlowInstance } from './logic/shared-state';
	import { centerAndHighlightNode } from './logic/navigation';
	import type { Snippet } from 'svelte';

	type Props = {
		open: boolean;
		relation?: AppNode;
		relationMode?: 'child' | 'parent';
		/** Optional content shown above the form (used by the onboarding walkthrough). */
		hint?: Snippet;
	};

	let { open = $bindable(), relation, relationMode, hint }: Props = $props();

	// Form state
	let formData = $state({
		title: '',
		content: '',
		completed: false
	});

	// Reset form when drawer closes
	$effect(() => {
		if (!open) {
			formData = {
				title: '',
				content: '',
				completed: false
			};
		}
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!formData.title.trim() || $authState.status !== 'signed-in') return;

		const createDetail: CreateTaskParams = {
			id: v4(),
			userAuthId: $authState.user.id,
			title: formData.title.trim()
		};

		if (formData.content.trim()) {
			createDetail.content = formData.content.trim();
		}

		if (relation) {
			switch (relationMode) {
				case 'parent':
					createDetail.parents = [relation.id];
					break;
				case 'child':
					createDetail.children = [relation.id];
					break;
			}
		}

		const [result, error] = await tasksAPI.createTask({ createDetail });
		if (error) error.UNHANDLED('[TaskCreationDrawer.handleSubmit] Error creating task');
		if (result) {
			const { newId } = result;
			$pendingNodeParams = { ...$pendingNodeParams, id: newId };
			open = false;
			setTimeout(() => {
				centerAndHighlightNode(newId);
			}, 200);
		}
	}

	const isValid = $derived(formData.title.trim().length > 0);
</script>

<ResponsiveDialog.Root bind:open>
	<ResponsiveDialog.Content showCloseButton id="task-creation-dialog">
		<ResponsiveDialog.Header sticky>
			<ResponsiveDialog.Title>
				{relation?.data.type === 'project' ? 'New Task' : 'New Subtask'}
			</ResponsiveDialog.Title>
		</ResponsiveDialog.Header>

		{#if hint}
			{@render hint()}
		{/if}

		<div class="flex-1 overflow-y-auto">
			<form onsubmit={handleSubmit} class="flex flex-col space-y-4">
				<div class="space-y-2">
					<label for="task-title" class="text-sm font-medium">Title *</label>
					<input
						id="task-title"
						name="title"
						class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs ring-offset-background transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
						placeholder={relation?.data.type === 'project' ? 'Task title' : 'Subtask title'}
						bind:value={formData.title}
						required
						autofocus
					/>
				</div>

				<div class="space-y-2">
					<label for="task-description" class="text-sm font-medium">Description</label>
					<textarea
						id="task-description"
						placeholder="Add notes or description..."
						bind:value={formData.content}
						class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs ring-offset-background transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
						rows="3"
					></textarea>
				</div>

				<ResponsiveDialog.Footer>
					<Button
						id="btn-task-cancel"
						type="button"
						variant="outline"
						onclick={() => {
							open = false;
						}}
					>
						Cancel
					</Button>
					<Button id="btn-task-create" type="submit" disabled={!isValid}>
						<Icon icon="lucide:plus" class="mr-2" />
						{relation?.data.type !== 'project' ? 'Create Task' : 'Create Subtask'}
					</Button>
				</ResponsiveDialog.Footer>
			</form>
		</div>
	</ResponsiveDialog.Content>
</ResponsiveDialog.Root>
