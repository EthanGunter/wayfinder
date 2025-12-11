<script lang="ts">
	import * as Dialog from '$lib/components/ui/responsive-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import { settings } from '$lib/user-settings';
	import { get } from 'svelte/store';
	import type { ProjectStatus } from '$domain/models/project';
	import { ProjectStatus as ProjectStatusEnum } from '$domain/models/project';

	interface Props {
		open?: boolean;
		onClose?: () => void;
		onCreate?: (project: {
			title: string;
			content?: string;
			dueDate?: Date;
			uiPrefs?: {
				showStreak?: boolean;
				showVelocity?: boolean;
				showMomentumScore?: boolean;
				showNextAction?: boolean;
				showMicroWins?: boolean;
			};
		}) => void | Promise<void>;
	}

	let { open = $bindable(false), onClose, onCreate }: Props = $props();

	let title = $state('');
	let content = $state('');
	let dueDate = $state<string>('');
	let showStreak = $state(get(settings.projects.defaults.defaultProjectShowStreak));
	let showVelocity = $state(get(settings.projects.defaults.defaultProjectShowVelocity));
	let showMomentumScore = $state(get(settings.projects.defaults.defaultProjectShowMomentumScore));
	let showNextAction = $state(get(settings.projects.defaults.defaultProjectShowNextAction));
	let showMicroWins = $state(get(settings.projects.defaults.defaultProjectShowMicroWins));

	let isSubmitting = $state(false);

	function resetForm() {
		title = '';
		content = '';
		dueDate = '';
		showStreak = get(settings.projects.defaults.defaultProjectShowStreak);
		showVelocity = get(settings.projects.defaults.defaultProjectShowVelocity);
		showMomentumScore = get(settings.projects.defaults.defaultProjectShowMomentumScore);
		showNextAction = get(settings.projects.defaults.defaultProjectShowNextAction);
		showMicroWins = get(settings.projects.defaults.defaultProjectShowMicroWins);
	}

	function close() {
		resetForm();
		open = false;
		onClose?.();
	}

	function handleClose(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			close();
		}
	}

	async function handleSubmit() {
		if (!title.trim()) return;

		isSubmitting = true;
		try {
			const projectData = {
				title: title.trim(),
				content: content.trim() || undefined,
				dueDate: dueDate ? new Date(dueDate) : undefined,
				uiPrefs: {
					showStreak: showStreak || undefined,
					showVelocity: showVelocity || undefined,
					showMomentumScore: showMomentumScore || undefined,
					showNextAction: showNextAction || undefined,
					showMicroWins: showMicroWins || undefined
				}
			};

			await onCreate?.(projectData);
			close();
		} catch (error) {
			console.error('Failed to create project:', error);
		} finally {
			isSubmitting = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			handleSubmit();
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content showCloseButton onkeydown={handleClose} class="max-w-md">
		<Dialog.Header sticky>
			<Dialog.Title>Create New Project</Dialog.Title>
			<Dialog.Description>Add a new project to organize your tasks.</Dialog.Description>
		</Dialog.Header>

		<div class="flex-1 overflow-y-auto">
			<div class="space-y-4 py-4" role="group" onkeydown={handleKeydown}>
				<div class="space-y-2">
				<label for="project-title" class="text-sm font-medium">Title *</label>
				<Input
					id="project-title"
					bind:value={title}
					placeholder="Enter project title"
					required
					autofocus
				/>
			</div>

			<div class="space-y-2">
				<label for="project-content" class="text-sm font-medium">Description</label>
				<textarea
					id="project-content"
					bind:value={content}
					placeholder="Optional markdown description"
					class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs ring-offset-background transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"
					rows="3"
				></textarea>
			</div>

			<div class="space-y-2">
				<label for="project-due-date" class="text-sm font-medium">Due Date</label>
				<Input id="project-due-date" type="date" bind:value={dueDate} />
			</div>

			<div class="space-y-3 border-t pt-4">
				<p class="text-sm font-medium">Engagement Features</p>
				<div class="space-y-2">
					<label class="flex items-center gap-2 text-sm">
						<Checkbox bind:checked={showStreak} />
						<span>Show streak tracking</span>
					</label>
					<label class="flex items-center gap-2 text-sm">
						<Checkbox bind:checked={showVelocity} />
						<span>Show completion velocity</span>
					</label>
					<label class="flex items-center gap-2 text-sm">
						<Checkbox bind:checked={showMomentumScore} />
						<span>Show momentum score</span>
					</label>
					<label class="flex items-center gap-2 text-sm">
						<Checkbox bind:checked={showNextAction} />
						<span>Show next action</span>
					</label>
					<label class="flex items-center gap-2 text-sm">
						<Checkbox bind:checked={showMicroWins} />
						<span>Show micro wins</span>
					</label>
				</div>
			</div>
			</div>

			<Dialog.Footer>
				<Button variant="outline" onclick={close} disabled={isSubmitting}>Cancel</Button>
				<Button onclick={handleSubmit} disabled={isSubmitting || !title.trim()}>
					{isSubmitting ? 'Creating...' : 'Create Project'}
				</Button>
			</Dialog.Footer>
		</div>
	</Dialog.Content>
</Dialog.Root>
