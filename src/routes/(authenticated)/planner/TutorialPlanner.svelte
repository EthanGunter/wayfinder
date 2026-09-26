<script lang="ts">
	/**
	 * Onboarding Part C (steps C0–C6): the planner payoff.
	 *
	 * Runs after Part B ('onboarding.example-project') is complete, while the demo project
	 * still exists and its "Ask a genie for money" task is rendered in the planner.
	 */
	import { onDestroy, untrack } from 'svelte';
	import Icon from '@iconify/svelte';
	import type { FetchableStore } from '$lib/API/fetchableStore';
	import type { Fetchable } from '$domain/fetchable';
	import type { Task } from '$domain/models/task';
	import { isTaskCompleted } from '$domain/models/task';
	import type { IAppNode } from '$domain/models/node';
	import type { ProjectData } from '$domain/models/project';
	import {
		tutorials,
		onboardingData,
		setOnboardingData,
		queryOrWait,
		ONBOARDING_EXAMPLE_PROJECT,
		ONBOARDING_PLANNER,
		TModal,
		TGate,
		EventHandler,
		StoreWatcher
	} from '$lib/tutorials';

	const ID = ONBOARDING_PLANNER;
	/** C5+ don't need the genie on screen, only the demo project (for C6's delete). */
	const FIRST_STEP_WITHOUT_GENIE = 5;
	const GENIE_TIMEOUT_MS = 8000;

	let {
		projects,
		todaysList,
		isMobile,
		revealProject,
		deleteProject
	}: {
		projects: FetchableStore<IAppNode<ProjectData>[]>;
		todaysList: FetchableStore<Task[]>;
		isMobile: boolean;
		/** Make a project's suggestions visible (open its Collapsible / the mobile section). */
		revealProject: (projectId: string) => void;
		/** Delete a project (and its subtree) without the planner surfacing errors for it. */
		deleteProject: (projectId: string) => Promise<unknown>;
	} = $props();

	const onboarding = onboardingData();

	let active = $state(false);
	let step = $state(0);
	let attempted = false;
	let deleting = false;
	let destroyed = false;

	const demoProjectId = $derived($onboarding.demoProjectId);
	const genieId = $derived($onboarding.genieId);

	const eligible = $derived.by(() => {
		void $tutorials; // re-evaluate whenever tutorial progress changes
		return tutorials.isDone(ONBOARDING_EXAMPLE_PROJECT) && !tutorials.isDone(ID);
	});

	const demoProjectExists = $derived(
		$projects.status === 'resolved' && $projects.value.some((p) => p.id === demoProjectId)
	);

	const genie = $derived(`[data-task-id="${genieId}"]`);

	// Start once per mount, as soon as every precondition is known to hold
	$effect(() => {
		if (attempted || active) return;
		if (!eligible || !demoProjectId || !genieId || !demoProjectExists) return;
		attempted = true;
		const projectId = demoProjectId;
		const selector = genie;
		untrack(() => void tryStart(projectId, selector));
	});

	async function tryStart(projectId: string, genieSelector: string) {
		if (tutorials.getStep(ID) < FIRST_STEP_WITHOUT_GENIE) {
			// Desktop keeps per-project suggestions collapsed; the genie must actually be on screen
			revealProject(projectId);
			const el = await queryOrWait(
				`#suggestions-panel ${genieSelector}, #todays-tasks-panel ${genieSelector}`,
				{ timeoutMs: GENIE_TIMEOUT_MS }
			);
			if (!el || destroyed) return;
		}
		if (destroyed || !eligible || !demoProjectExists) return;
		step = tutorials.getStep(ID);
		active = true;
	}

	// The demo project went away underneath us (another tab, etc.): stop quietly
	$effect(() => {
		if (active && $projects.status === 'resolved' && !demoProjectExists && !deleting) {
			active = false;
		}
	});

	// Until the genie is in Today's list, keep the demo project's suggestions open
	$effect(() => {
		if (active && step <= 2 && demoProjectId) {
			const projectId = demoProjectId;
			untrack(() => revealProject(projectId));
		}
	});

	onDestroy(() => {
		destroyed = true;
	});

	/** Advance only from the step the caller belongs to (guards double-fires). */
	function advanceFrom(from: number) {
		if (!active || step !== from) return;
		tutorials.advance(ID);
		step = tutorials.getStep(ID);
	}

	function genieInToday(list: Fetchable<Task[]>): Task | undefined {
		if (list.status !== 'resolved') return undefined;
		return list.value.find((t) => t.id === genieId);
	}

	function finish() {
		tutorials.complete(ID);
		active = false;
	}

	async function deleteDemoProject() {
		const projectId = demoProjectId;
		deleting = true;
		finish();
		if (!projectId) return;
		await deleteProject(projectId);
		// The ids now point at deleted nodes
		setOnboardingData({ demoProjectId: undefined, dressId: undefined, genieId: undefined });
	}
</script>

{#if active && genieId}
	{#if step === 0}
		<!-- C0 -->
		<TModal
			primaryLabel="How?"
			onPrimary={() => advanceFrom(0)}
			selector="#todays-tasks-panel"
			placement={isMobile ? 'bottom' : 'left'}
		>
			{#snippet title()}
				The planner is the most important page in Wayfinder
			{/snippet}
			This is how we help you stay focused on what matters.
		</TModal>
	{:else if step === 1}
		<!-- C1 -->
		<TModal
			primaryLabel="Ok"
			onPrimary={() => advanceFrom(1)}
			selector="#suggestions-panel"
			placement={isMobile ? 'top' : 'right'}
			disableTargetInteraction
		>
			{#snippet title()}
				Notice anything missing?
			{/snippet}
			You'll notice "Get dress clothes 🥿👗👔👞" isn't suggested - you still need money first. Add
			"Ask a genie for money 🧞‍♂️💰" to Today's list with +.
		</TModal>
	{:else if step === 2}
		<!-- C2: only the genie's + is clickable; advance once the genie is actually in today's list -->
		<TGate selector={`#suggestions-panel ${genie} [data-action="add-to-today"]`} />
		<StoreWatcher store={todaysList} when={(v) => !!genieInToday(v)} onMatch={() => advanceFrom(2)} />
	{:else if step === 3}
		<!-- C3 -->
		<TModal
			primaryLabel="Nice!"
			onPrimary={() => advanceFrom(3)}
			selector="#suggestions-panel"
			placement={isMobile ? 'top' : 'right'}
			disableTargetInteraction
		>
			{#snippet title()}
				You don't need to see <em>every</em> task you've come up with
			{/snippet}
			Wayfinder only bothers you with actionable next-steps
		</TModal>
	{:else if step === 4}
		<!-- C4: advance on the checkbox click, or whenever the genie becomes complete -->
		<EventHandler
			selector={`#todays-tasks-panel ${genie} [data-action="complete"]`}
			type="click"
			once
			onEvent={() => advanceFrom(4)}
		/>
		<StoreWatcher
			store={todaysList}
			when={(v) => {
				const task = genieInToday(v);
				return !!task && isTaskCompleted(task);
			}}
			onMatch={() => advanceFrom(4)}
		/>
		<TModal selector={`#todays-tasks-panel ${genie} [data-action="complete"]`} placement="bottom">
			{#snippet title()}
				Mark a task complete
			{/snippet}
			Once you start completing prerequisites, their parents will start to show up. Click the checkbox
			to mark this task complete.
		</TModal>
	{:else if step === 5}
		<!-- C5 -->
		<TModal primaryLabel="Seems simple!" onPrimary={() => advanceFrom(5)}>
			{#snippet title()}
				Each day, today's tasks reset
			{/snippet}
			Scientists recommend picking 3-5 a day
		</TModal>
	{:else}
		<!-- C6: #btn-feedback is hidden below sm, where TModal falls back to a centered panel -->
		<TModal
			primaryLabel="Keep it"
			onPrimary={finish}
			secondaryLabel="Delete example project"
			onSecondary={deleteDemoProject}
			selector="#btn-feedback"
			placement="bottom"
		>
			{#snippet title()}
				That's the gist of Wayfinder!
			{/snippet}
			Please remember it's still in alpha, so don't hesitate to use that <Icon
				class="inline"
				icon="material-symbols:feedback-outline"
			/> button.
		</TModal>
	{/if}
{/if}
