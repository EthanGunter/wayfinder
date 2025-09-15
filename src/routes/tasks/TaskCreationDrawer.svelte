<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet';
	import Button from '$lib/components/ui/button/button.svelte';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import Icon from '@iconify/svelte';
	import { type Task, TaskStatus } from '$lib/API/Tasks/Task';
	import { type CreateTaskParams, type ILocalTasks } from '$lib/API/Tasks';
	import type { User } from '$lib/API/Auth/User';

	interface Props {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		onTaskCreated: (task: Task) => void;
		tasks: ILocalTasks;
		user: User;
		relation?: { task: Task; mode: 'child' | 'parent' } | null;
	}

	let { open = $bindable(), onOpenChange, onTaskCreated, tasks, user, relation }: Props = $props();

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
		if (!formData.title.trim()) return;

		const createDetail: CreateTaskParams = {
			user_id: user.id,
			title: formData.title.trim()
		};

		if (formData.content.trim()) {
			createDetail.content = formData.content.trim();
		}

		if (formData.completed) {
			createDetail.status = TaskStatus.complete;
		}

		if (relation) {
			switch (relation.mode) {
				case 'parent':
					createDetail.parents = [relation.task.id];
					break;
				case 'child':
					createDetail.children = [relation.task.id];
					break;
			}
		}

		const result = await tasks.createTask({ createDetail });

		result.match(
			(newTask) => {
				onTaskCreated(newTask);
				onOpenChange(false);
			},
			(err) => {
				err.logError();
			}
		);
	}

	function handleCancel() {
		onOpenChange(false);
	}

	const isValid = $derived(formData.title.trim().length > 0);
</script>

<Sheet.Root bind:open {onOpenChange}>
	<Sheet.Content
		side="bottom"
		id="drawer-task-creation"
		class="mx-auto max-h-[85vh] max-w-2xl rounded-t-xl p-0"
	>
		<div class=" w-full">
			<!-- Header -->
			<div class="px-6 pt-4">
				<p class="text-xs tracking-wide text-gray-500 uppercase">
					{relation ? 'New Subtask' : 'New Project'}
				</p>
			</div>

			<form onsubmit={handleSubmit} class="flex h-full flex-col">
				<!-- Title row matching TaskEditor style -->
				<div class="mb-3 flex items-start gap-4 border-b-1 border-gray-200 px-6 pt-2 pb-3">
					<div class="flex-1">
						<input
							id="task-title"
							name="title"
							class="w-full border-0 bg-transparent text-2xl font-semibold text-gray-900 placeholder-gray-400 focus:ring-0 focus:outline-none"
							placeholder={relation ? 'Subtask title' : 'Project title'}
							bind:value={formData.title}
							required
							autofocus
						/>
					</div>
				</div>

				<!-- Description -->
				<div class="flex-1 overflow-y-auto px-6">
					<textarea
						id="task-description"
						placeholder="Add notes or description..."
						bind:value={formData.content}
						class="w-full resize-none border-0 bg-transparent text-gray-700 placeholder-gray-400 focus:ring-0 focus:outline-none"
						rows="6"
					></textarea>
				</div>

				<!-- Footer actions -->
				<Sheet.Footer>
					<div class="flex w-full gap-3 px-6 pb-6">
						<Button
							id="btn-task-drawer-cancel"
							type="button"
							variant="outline"
							class="flex-1"
							onclick={handleCancel}
						>
							Cancel
						</Button>
						<Button id="btn-task-drawer-create" type="submit" class="flex-1" disabled={!isValid}>
							<Icon icon="lucide:plus" class="mr-2 size-4" />
							{relation ? 'Create Subtask' : 'Create Project'}
						</Button>
					</div>
				</Sheet.Footer>
			</form>
		</div>
	</Sheet.Content>
</Sheet.Root>
