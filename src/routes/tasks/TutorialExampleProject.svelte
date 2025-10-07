<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { tutorials } from '$lib/tutorials/store';
	import TModal from '$lib/tutorials/primitives/TModal.svelte';

	import EventHandler from '$lib/tutorials/primitives/EventHandler.svelte';
	import { authState } from '$lib/API/Auth';
	import { tasksAPI } from '$lib/API/Tasks';
	import { queryOrWait } from '$lib/tutorials/dom';
	import demoData from '$lib/tutorials/DemoData.json';
	import { TaskStatus } from '$lib/API/Tasks/Task';

	let active = $state(false);
	let step = $state(0);

	const id = 'tasks.example-project';

	onMount(() => {
		if (!tutorials.isDone('home.welcome')) {
			goto('/home');
			return;
		}
		if (tutorials.isDone(id)) return;
		else tutorials.reset(id);
		step = tutorials.getStep(id);

		initializeExample();

		active = true;
	});

	function proceed() {
		tutorials.advance(id);
		step = tutorials.getStep(id);
	}

	function skipAll() {
		// Placeholder: analytics track
		// track('tutorial_skip', { id })
		tutorials.complete(id);
		active = false;
	}

	function markDone() {
		tutorials.complete(id);
		active = false;
	}

	async function initializeExample() {
		if ($authState.status !== 'signed-in') return;
		await tasksAPI.deleteTask({ id: 'DEMO-1' });

		void (await tasksAPI.createTask({
			createDetail: {
				id: 'DEMO-1',
				user_id: $authState.user.id,
				title: 'Go to the ball 💃🕺'
			}
		}));

		goto(`tasks?id=DEMO-1`);
	}

	async function createDressClothesTask(e: Event) {
		e.preventDefault();
		e.stopImmediatePropagation();
		if ($authState.status !== 'signed-in') return;

		const [task, error] = await tasksAPI.createTask({
			createDetail: {
				id: 'DEMO-2',
				user_id: $authState.user.id,
				title: 'Get dress clothes 🥿👗👔👞',
				parents: ['DEMO-1']
			}
		});

		if (task) proceed();
	}

	async function openGenieDrawer(e: Event) {
		proceed();

		// Let the default click open the drawer, then prefill fields
		const titleInput = await queryOrWait<HTMLInputElement>('#task-title');
		if (titleInput) {
			titleInput.value = 'Ask a genie for money 🧞‍♂️💰';
			titleInput.dispatchEvent(new Event('input', { bubbles: true }));
		}

		const descTextarea = await queryOrWait<HTMLTextAreaElement>('#task-description');
		if (descTextarea) {
			descTextarea.value = "This will take no time at all. It's fool-proof!";
			descTextarea.dispatchEvent(new Event('input', { bubbles: true }));
		}
	}

	function navigateToPlanner() {
		markDone();
		goto('/home');
	}

	async function createDemoTasks() {
		if ($authState.status !== 'signed-in') return;

		type DemoItem = {
			id: string;
			title: string;
			content?: string;
			children: string[];
			parents: string[];
			status: number;
		};

		const items = demoData as DemoItem[];

		// Prepare create DTOs for all except the two already created
		const createDetails = items.map((i) => {
			const dto: any = {
				id: i.id,
				title: i.title,
				status: i.status === 1 ? TaskStatus.complete : TaskStatus.incomplete
			};
			const parents = i.parents ?? [];
			const children = i.children ?? [];
			if (parents.length) dto.parents = parents;
			if (children.length) dto.children = children;
			if (i.content && i.content.trim().length > 0) dto.content = i.content.trim();
			return dto;
		});

		if (createDetails.length > 0) {
			await tasksAPI.createTasks({ createDetails });
		}
	}
</script>

{#if active}
	{#if step === 0}
		<TModal primaryLabel="I'll play along" onPrimary={proceed} selector="#input-task-title">
			{#snippet title()}
				Let's say you want to
			{/snippet}
			"Go to the ball 💃🕺"
		</TModal>
	{:else if step === 1}
		<EventHandler selector="#btn-add-task" type="click" onEvent={createDressClothesTask} />
		<TModal selector="#btn-add-task">
			{#snippet title()}
				You can't go to the ball without some fancy clothes!
			{/snippet}
			Add new tasks with "+ New Subtask". We'll create this one for you.
		</TModal>
	{:else if step === 2}
		<TModal
			primaryLabel="because..."
			onPrimary={proceed}
			disableTargetInteraction
			selector=".task-editor"
		>
			{#snippet title()}
				In order to get clothes, you need money, right?
			{/snippet}
			Most task apps would force you to put your <em>money</em> subtask next to your
			<em>clothes</em> subtask, but that doesn't make sense.
		</TModal>
	{:else if step === 3}
		<TModal
			primaryLabel="Neat!"
			onPrimary={proceed}
			disableTargetInteraction
			selector=".task-editor"
		>
			{#snippet title()}
				Money is the <em>prerequisite</em>
			{/snippet}
			Wayfinder let's you model that relationship with subtasks nested as deep as you need. Infinitely!
		</TModal>
	{:else if step === 4}
		<EventHandler
			selector=".task-list-item"
			type="click"
			onEvent={() => {
				proceed();
			}}
		/>
		<TModal selector=".task-list-item" placement="top">
			{#snippet title()}
				Let's go a level deeper.
			{/snippet}
			Click on the "Get dress clothes" task.
		</TModal>
	{:else if step === 5}
		<EventHandler selector="#btn-add-task" type="click" onEvent={openGenieDrawer} />
		<TModal selector="#btn-add-task" placement="top">
			Clicking "+ New Subtask" will open the "new task" drawer
		</TModal>
	{:else if step === 6}
		<EventHandler
			selector="#btn-task-drawer-create"
			type="click"
			onEvent={(e) => {
				e.preventDefault();
				proceed();
			}}
		/>
		<EventHandler selector="#btn-task-drawer-cancel" type="click" onEvent={proceed} />
		<TModal selector="#drawer-task-creation" blockPage={false} onOutsideClick={proceed}>
			{#snippet title()}
				"Can I do this in 15 minutes?"
			{/snippet}
			If not, you probably need to break it down into further subtasks.
		</TModal>
	{:else if step === 7}
		<TModal
			primaryLabel="ok!"
			onPrimary={async () => {
				await createDemoTasks();
				proceed();
			}}
		>
			{#snippet title()}To save you a bit of time...{/snippet}
			We'll go ahead and fill things out with a few more tasks so you can see how Wayfinder handles the
			volume
		</TModal>
	{:else if step === 8}
		<EventHandler selector="#sec-task-list" type="dnd-drop" onEvent={proceed} />
		<TModal selector="#sec-task-list" placement="top">
			{#snippet title()}Prioritize your subtasks{/snippet}
			Drag and drop items within the list to reorder. Higher items get higher priority and will surface
			sooner in the planner.
		</TModal>
	{:else if step === 9}
		<EventHandler selector="#btn-nav-planner" type="click" onEvent={markDone} />
		<TModal selector="#btn-nav-planner" placement="top" blockPage={false} onOutsideClick={markDone}>
			Once you've cast the vision, Wayfinder manages the planning. Go to the planner page anytime
			and I'll show you how.
		</TModal>
	{/if}
{/if}
