<script lang="ts">
	import { tutorials, ONBOARDING_WELCOME, TModal, TGate, EventHandler } from '$lib/tutorials';
	import { shouldStartWelcome, skipWelcome, WelcomeStep } from './tutorial-welcome';

	type Props = {
		/** Number of projects once the query has resolved; null while loading / errored. */
		projectCount: number | null;
		/** Whether the create-project dialog is open. */
		createDialogOpen: boolean;
		/** Open the create-project dialog prefilled for the example project. */
		onOpenCreateDialog: () => void;
	};

	const { projectCount, createDialogOpen, onOpenCreateDialog }: Props = $props();

	// Empty-state button, or the grid's "+" when replaying with existing projects.
	// Only one of them is ever rendered.
	const CREATE_BUTTON = '#btn-create-first-project, #btn-create-project';
	const CREATE_DIALOG_ACTIONS = '#create-project-actions';

	// Decided once per mount, so the tutorial doesn't vanish when the example project
	// shows up in the list (it's completed explicitly instead).
	let started = $state(false);

	const record = $derived($tutorials[ONBOARDING_WELCOME]);
	const step = $derived(record?.step ?? 0);
	const active = $derived(started && !record?.completed);

	$effect(() => {
		if (started || projectCount === null) return;
		if (!shouldStartWelcome($tutorials, projectCount)) return;
		// The create dialog doesn't survive a reload; resume at the prompt that opens it
		if (tutorials.getStep(ONBOARDING_WELCOME) > WelcomeStep.CreatePrompt) {
			tutorials.setStep(ONBOARDING_WELCOME, WelcomeStep.CreatePrompt);
		}
		started = true;
	});

	// Dialog closed without creating (Cancel / Esc): go back to the prompt
	$effect(() => {
		if (active && step === WelcomeStep.CreateDialog && !createDialogOpen) {
			tutorials.setStep(ONBOARDING_WELCOME, WelcomeStep.CreatePrompt);
		}
	});

	function proceed() {
		tutorials.advance(ONBOARDING_WELCOME);
	}

	function openCreateDialog() {
		onOpenCreateDialog();
		tutorials.setStep(ONBOARDING_WELCOME, WelcomeStep.CreateDialog);
	}

	function interceptCreateClick(e: Event) {
		// Replace the button's own handler so the dialog opens prefilled
		e.preventDefault();
		e.stopImmediatePropagation();
		openCreateDialog();
	}

	// If A1 can't point at the button (centered fallback), offer the action on the modal itself
	let promptFallback = $state(false);
</script>

{#if active}
	{#if step === WelcomeStep.Intro}
		<TModal primaryLabel="Thanks for having me!" onPrimary={proceed}>
			{#snippet title()}
				Welcome to Wayfinder alpha!
			{/snippet}
		</TModal>
	{:else if step === WelcomeStep.CreatePrompt}
		<EventHandler selector={CREATE_BUTTON} type="click" onEvent={interceptCreateClick} />
		<TModal
			primaryLabel={promptFallback ? 'Create it' : undefined}
			onPrimary={openCreateDialog}
			onFallback={() => (promptFallback = true)}
			secondaryLabel="skip walkthrough"
			onSecondary={() => skipWelcome()}
			selector={CREATE_BUTTON}
			placement="top"
		>
			Let's create a sample project so I can show you what makes Wayfinder unique!
		</TModal>
	{:else if step === WelcomeStep.CreateDialog && createDialogOpen}
		<!-- Keep the prefilled dialog on track: only Cancel / Create Project are reachable -->
		<TGate selector={CREATE_DIALOG_ACTIONS} />
	{/if}
{/if}
