<!--
	Onboarding Part B (wf-87q.6): builds the "Go to the ball" prerequisite graph with the user.
	Steps B0-B9 (see the wf-87q epic for the script). Only runs on the demo project created in Part A.

	Progress lives in the tutorial store (wf.tutorials.v1) so a reload resumes; `reconcile()` fixes up
	the step against the actual project contents when the page loads.
-->
<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { get, type Readable } from 'svelte/store';
	import { MediaQuery } from 'svelte/reactivity';
	import { v4 } from 'uuid';
	import { toast } from 'svelte-sonner';
	import {
		tutorials,
		onboardingData,
		getOnboardingData,
		setOnboardingData,
		queryOrWait,
		isNarrowViewport,
		ONBOARDING_WELCOME,
		ONBOARDING_EXAMPLE_PROJECT,
		TModal,
		EventHandler,
		StoreWatcher,
		DropWatcher
	} from '$lib/tutorials';
	import tasksAPI from '$lib/API/Tasks';
	import { authState } from '$lib/API/Auth';
	import type { AppNode } from '$domain/models/node';
	import type { Fetchable } from '$domain/fetchable';
	import { appData, svelteFlowInstance } from './logic/shared-state';
	import {
		selectedNode,
		drawerOpen,
		drawerParams,
		pendingNodeParams,
		editorLayoutState
	} from './logic/ui-state';
	import { layoutEngine } from './logic/layout';

	type Props = {
		projectId: string;
		/** The page's project subtree store (includes the project node itself). */
		subtree: Readable<Fetchable<AppNode[]>>;
		/**
		 * Set while step B6 is showing: a hint rendered INSIDE TaskCreationDialog. The dialog is a
		 * focus-trapping modal layer, so an external popover would fight it (see wf-87q.6 notes).
		 */
		taskDialogHint?: Snippet;
	};

	let { projectId, subtree, taskDialogHint = $bindable() }: Props = $props();

	const ID = ONBOARDING_EXAMPLE_PROJECT;

	// Keep verbatim (matches src/convex/demo.ts DEMO_TITLES, which is server-only).
	const DRESS_TITLE = 'Get dress clothes 🥿👗👔👞';
	const GENIE_TITLE = 'Ask a genie for money 🧞‍♂️💰';
	const GENIE_CONTENT = "This will take no time at all. It's fool-proof!";

	const onboarding = onboardingData();

	const welcomeDone = $derived(Boolean($tutorials[ONBOARDING_WELCOME]?.completed));
	const record = $derived($tutorials[ID]);
	const step = $derived(record?.step ?? 0);
	const demoProjectId = $derived($onboarding.demoProjectId);
	const dressId = $derived($onboarding.dressId);

	const eligible = $derived(
		welcomeDone && !record?.completed && !!demoProjectId && projectId === demoProjectId
	);
	/** Key of the (project, demo) pair whose progress has been reconciled with the server data. */
	let reconciledKey = $state<string | null>(null);
	const active = $derived(eligible && reconciledKey === `${projectId}:${demoProjectId}`);

	// Touch devices / narrow screens can't be relied on for drag-and-drop (B8): offer a way on.
	const coarsePointer = new MediaQuery('(pointer: coarse)');
	let fallbackStep = $state<number | null>(null);

	let busy = $state(false);
	let seedAttempt = $state(0);
	/** pendingNodeParams.id when the B6 dialog opened; a different id on close = the user's genie. */
	let pendingIdBeforeGenie: string | undefined;

	//#region Lifecycle / resume

	$effect(() => {
		if (!eligible) return;
		const current = $subtree;
		const key = `${projectId}:${demoProjectId}`;
		untrack(() => {
			if (reconciledKey === key) return;
			if (current.status === 'error') {
				// Demo project was deleted (or isn't ours): nothing to walk through.
				if (
					current.error?.name === 'NotFoundError' ||
					current.error?.name === 'NotAuthorizedError'
				) {
					tutorials.complete(ID);
				}
				return;
			}
			if (current.status !== 'resolved') return;
			reconcile(current.value);
			reconciledKey = key;
		});
	});

	/** Bring the stored step in line with what actually exists in the project (reload / resume). */
	function reconcile(nodes: AppNode[]) {
		const byId = new Map(nodes.map((n) => [n.id, n]));
		const project = byId.get(projectId);
		if (!project || project.data.type !== 'project') {
			tutorials.complete(ID);
			return;
		}

		const data = getOnboardingData();
		let s = tutorials.getStep(ID);

		let dress = data.dressId ? byId.get(data.dressId) : undefined;
		if (!dress) {
			// Adopt an existing "Get dress clothes" (e.g. created right before a reload)
			dress = project.children
				.map((id) => byId.get(id))
				.find((n) => n?.data.type === 'task' && n.data.title === DRESS_TITLE);
		}
		if (dress) {
			if (dress.id !== data.dressId) setOnboardingData({ dressId: dress.id });
			if (s <= 1) s = 2;
		} else {
			if (data.dressId || data.genieId)
				setOnboardingData({ dressId: undefined, genieId: undefined });
			if (s >= 8) {
				// Seeded graph without its root task: the remaining steps can't point at anything.
				tutorials.complete(ID);
				return;
			}
			s = Math.min(s, 1);
		}

		if (data.genieId && !byId.has(data.genieId)) setOnboardingData({ genieId: undefined });

		if ((s === 5 || s === 6) && dress && !get(drawerOpen)) {
			// Before seeding, dress's only possible child is the genie the user made in B6.
			const userGenie = dress.children.find((id) => byId.get(id)?.data.type === 'task');
			if (userGenie) {
				setOnboardingData({ genieId: userGenie });
				s = 7;
			} else {
				// B6 is only meaningful while the new-task dialog is open; otherwise re-offer B5.
				s = 5;
			}
		}

		// B0-B4 point into the project editor (B4 advances when the user selects dress).
		if (s <= 4) selectedNode.set(null);

		if (s !== tutorials.getStep(ID)) tutorials.setStep(ID, s);
	}

	// Side effects when a step becomes current (live or resumed).
	$effect(() => {
		if (!active) return;
		const s = step;
		untrack(() => {
			fallbackStep = null;
			if (s === 5 || s === 8) {
				ensureBlockersOpen();
				void ensureDressSelected();
			}
		});
	});

	// Steps from B4 on point at "Get dress clothes"; if it's gone, go back and recreate it (B1).
	$effect(() => {
		if (active && step >= 4 && step <= 8 && !dressId) untrack(() => tutorials.setStep(ID, 1));
	});

	// B6 hint lives inside the dialog.
	$effect(() => {
		taskDialogHint = active && step === 6 ? genieHint : undefined;
	});
	$effect(() => () => {
		taskDialogHint = undefined;
	});

	//#endregion

	//#region Helpers

	function proceed() {
		tutorials.advance(ID);
	}

	function finish() {
		tutorials.complete(ID);
	}

	const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	/** Wait until the page's appData (fed by the subtree subscription) contains every id. */
	async function waitForNodes(ids: string[], timeoutMs = 4000): Promise<boolean> {
		const start = Date.now();
		while (Date.now() - start < timeoutMs) {
			if (ids.every((id) => appData.has(id))) return true;
			await sleep(100);
		}
		return false;
	}

	/** Re-run the graph layout once `ids` are on the page, then fit the view to the result. */
	async function relayout(ids: string[]) {
		await waitForNodes(ids);
		// Give the new nodes a frame to render so the layout can measure them
		await sleep(100);
		layoutEngine.start(150);
		await sleep(700);
		get(svelteFlowInstance)?.fitView({ duration: 400, maxZoom: 1 });
	}

	function ensureBlockersOpen() {
		editorLayoutState.update((s) =>
			s.accordionValues.includes('blockers')
				? s
				: { ...s, accordionValues: [...s.accordionValues, 'blockers'] }
		);
	}

	/** B5/B8 point into the "Get dress clothes" editor; select it if something else is showing. */
	async function ensureDressSelected() {
		const id = getOnboardingData().dressId;
		if (!id || get(selectedNode)?.id === id) return;
		await waitForNodes([id], 3000);
		const node = appData.get(id);
		if (node && get(selectedNode)?.id !== id) selectedNode.set(node);
	}

	/** The single child of "Get dress clothes" before seeding = the task the user made in B6. */
	function findUserGenie(dress: string): string | undefined {
		const children = appData.get(dress)?.children ?? [];
		return children.find((id) => appData.get(id)?.data.type === 'task');
	}

	function setInputValue(el: HTMLInputElement | HTMLTextAreaElement | null, value: string) {
		if (!el || el.value) return;
		el.value = value;
		// Inputs use bind:value, which listens for `input`
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}

	//#endregion

	//#region Step actions

	/** B1: intercept "create" and make "Get dress clothes" for the user. */
	async function createDress(e: Event) {
		e.preventDefault();
		e.stopImmediatePropagation();
		if (busy) return;
		const auth = get(authState);
		if (auth.status !== 'signed-in') return;

		busy = true;
		const [result, error] = await tasksAPI.createTask({
			createDetail: {
				id: v4(),
				userAuthId: auth.user.id,
				title: DRESS_TITLE,
				parents: [projectId]
			}
		});
		busy = false;

		if (error || !result) {
			console.error('[TutorialExampleProject] Failed to create dress task', error);
			toast.error("Couldn't create the task. Please try again.");
			return;
		}

		setOnboardingData({ dressId: result.newId });
		proceed();
		void relayout([result.newId]);
	}

	/** B5 -> B6: the "Blocked By" create button opened the dialog for dress; prefill the genie. */
	async function onGenieDialogOpened() {
		pendingIdBeforeGenie = get(pendingNodeParams).id;
		proceed();
		const title = await queryOrWait<HTMLInputElement>('#task-title', { timeoutMs: 3000 });
		setInputValue(title, GENIE_TITLE);
		const description = await queryOrWait<HTMLTextAreaElement>('#task-description', {
			timeoutMs: 3000
		});
		setInputValue(description, GENIE_CONTENT);
	}

	/**
	 * B6 -> B7: the dialog closed (create, cancel, X, escape or outside click). If a task was created,
	 * remember it as the genie; otherwise the seed creates one.
	 */
	function onGenieDialogClosed() {
		const newId = get(pendingNodeParams).id;
		const dress = getOnboardingData().dressId;
		const genieId =
			newId && newId !== pendingIdBeforeGenie ? newId : dress ? findUserGenie(dress) : undefined;
		if (genieId) setOnboardingData({ genieId });
		proceed();
	}

	/** B7: fill the rest of the demo graph server-side. */
	async function seed() {
		if (busy) return;
		const data = getOnboardingData();
		const dress = data.dressId;
		if (!dress) {
			tutorials.setStep(ID, 1);
			return;
		}
		// The subtree subscription may have lagged behind the B6 create; look again
		let genieId = data.genieId ?? findUserGenie(dress);

		busy = true;
		let [result, error] = await tasksAPI.seedDemoProject({ projectId, dressId: dress, genieId });
		if (error && genieId) {
			// A stale / invalid genie shouldn't block the walkthrough; let the seed create one
			console.warn('[TutorialExampleProject] Seeding with existing genie failed, retrying', error);
			genieId = undefined;
			[result, error] = await tasksAPI.seedDemoProject({ projectId, dressId: dress });
		}
		busy = false;

		if (error || !result) {
			console.error('[TutorialExampleProject] Failed to seed demo project', error);
			toast.error("Couldn't add the example tasks. Please try again.");
			seedAttempt++; // re-show the B7 modal
			return;
		}

		setOnboardingData({ genieId: result.genieId ?? genieId ?? undefined });
		proceed();
		void relayout(result.created.map((t) => t.id));
	}

	//#endregion
</script>

{#snippet genieHint()}
	<div
		id="tutorial-task-dialog-hint"
		role="note"
		class="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm"
	>
		<p class="font-semibold text-gray-900">"Can I do this in 15 minutes?"</p>
		<p class="text-gray-700">If not, you probably need to break it down into further subtasks.</p>
	</div>
{/snippet}

{#if active}
	{#if step === 0}
		<TModal
			selector="#input-project-title"
			placement="left"
			primaryLabel="I'll play along"
			onPrimary={proceed}
		>
			{#snippet title()}Let's say you want to{/snippet}
			"Go to the ball 💃🕺"
		</TModal>
	{:else if step === 1}
		{@const createSelector = `[data-list-id="child-${projectId}"] [data-action="create"]`}
		<EventHandler selector={createSelector} onEvent={createDress} />
		<TModal selector={createSelector} placement="left">
			{#snippet title()}You can't go to the ball without some fancy clothes!{/snippet}
			Add new tasks with "create". We'll create this one for you.
		</TModal>
	{:else if step === 2}
		<TModal
			selector="#editor-pane"
			placement="left"
			disableTargetInteraction
			primaryLabel="because..."
			onPrimary={proceed}
		>
			{#snippet title()}In order to get clothes, you need money, right?{/snippet}
			Most task apps would force you to put your <em>money</em> subtask next to your
			<em>clothes</em> subtask, but that doesn't make sense.
		</TModal>
	{:else if step === 3}
		<TModal
			selector="#editor-pane"
			placement="left"
			disableTargetInteraction
			primaryLabel="Neat!"
			onPrimary={proceed}
		>
			{#snippet title()}Money is the <em>prerequisite</em>{/snippet}
			Wayfinder lets you model that relationship with subtasks nested as deep as you need. Infinitely!
		</TModal>
	{:else if step === 4 && dressId}
		<!-- Selecting the task any way (list item or graph node) advances -->
		<StoreWatcher store={selectedNode} when={(n) => n?.id === dressId} onMatch={proceed} />
		<TModal
			selector={`[data-list-id="child-${projectId}"] [data-task-id="${dressId}"]`}
			placement="left"
		>
			{#snippet title()}Let's go a level deeper.{/snippet}
			Click on the "Get dress clothes" task.
		</TModal>
	{:else if step === 5 && dressId}
		<StoreWatcher
			store={drawerOpen}
			when={(open) => open && get(drawerParams)?.relation.id === dressId}
			onMatch={onGenieDialogOpened}
		/>
		<TModal selector={`[data-list-id="child-${dressId}"] [data-action="create"]`} placement="left">
			Clicking "create" will open the new task dialog
		</TModal>
	{:else if step === 6}
		<!-- Hint is rendered inside TaskCreationDialog (taskDialogHint). The create goes through. -->
		<StoreWatcher store={drawerOpen} when={(open) => !open} onMatch={onGenieDialogClosed} />
	{:else if step === 7}
		{#if busy}
			<TModal blockPage={false}>Adding tasks…</TModal>
		{:else}
			{#key seedAttempt}
				<TModal primaryLabel="ok!" onPrimary={seed}>
					{#snippet title()}To save you a bit of time...{/snippet}
					We'll go ahead and fill things out with a few more tasks so you can see how Wayfinder handles
					the volume
				</TModal>
			{/key}
		{/if}
	{:else if step === 8 && dressId}
		{@const canSkipDrag = coarsePointer.current || isNarrowViewport() || fallbackStep === 8}
		<DropWatcher listId={`child-${dressId}`} requireMove once onDrop={proceed} />
		<TModal
			selector={`[data-list-id="child-${dressId}"]`}
			placement="left"
			secondaryLabel={canSkipDrag ? 'Skip' : undefined}
			onSecondary={proceed}
			onFallback={() => (fallbackStep = 8)}
		>
			{#snippet title()}Prioritize your subtasks{/snippet}
			Drag and drop items within the Blocked By list to reorder. Higher items get higher priority and
			will surface sooner in the planner.
		</TModal>
	{:else if step >= 9}
		<EventHandler selector="#nav-planner" onEvent={finish} />
		<TModal
			selector="#nav-planner"
			placement="bottom"
			blockPage={false}
			onOutsideClick={finish}
			primaryLabel={fallbackStep === 9 ? 'Got it' : undefined}
			onPrimary={finish}
			onFallback={() => (fallbackStep = 9)}
		>
			Once you've cast the vision, Wayfinder manages the planning. Go to the planner page anytime
			and I'll show you how.
		</TModal>
	{/if}
{/if}
