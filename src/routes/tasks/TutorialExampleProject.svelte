<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidate, invalidateAll } from '$app/navigation';
	import { tutorials } from '@/tutorials/store';
	import TModal from '@/tutorials/primitives/TModal.svelte';

	import EventHandler from '@/tutorials/primitives/EventHandler.svelte';
	import { taskAPIPromise, authAPIPromise } from '@/stores/services';
	import { type ILocalTasks } from '@/API/Tasks';
	import { type ILocalAuth } from '@/API/Auth/types';
	import type { User } from '@/API/Auth/User';
	import { queryOrWait } from '@/tutorials/dom';

	let active = $state(false);
	let step = $state(0);
	let tasks = $state<ILocalTasks>();
	let auth = $state<ILocalAuth>();
	let user = $state<User>();

	const id = 'tasks.example-project';

	onMount(async () => {
		if (!tutorials.isDone('home.welcome')) {
			goto('/home');
			return;
		}
		if (tutorials.isDone(id)) return;
		else tutorials.reset(id);
		step = tutorials.getStep(id);

		// Initialize APIs
		tasks = await taskAPIPromise;
		auth = await authAPIPromise;
		const activeUser = await auth.getActiveUser();
		if (!activeUser) {
			goto('/login');
			return;
		}
		user = activeUser;

		active = true;

		initializeExample();
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
		if (!tasks || !user) return;
		await tasks.deleteTask({ taskOrId: 'gototheball', recursive: true });

		const result = await tasks.createTask({
			createDetail: {
				id: 'gototheball',
				user_id: user.id,
				title: 'Go to the ball 💃🕺'
			}
		});

		goto(`tasks?id=gototheball`);
	}

	async function createDressClothesTask(e: Event) {
		e.preventDefault();
		e.stopImmediatePropagation();
		if (!tasks || !user) return;

		const result = await tasks.createTask({
			createDetail: {
				id: 'getdressclothes',
				user_id: user.id,
				title: 'Get dress clothes 🥿👗👔👞',
				parents: ['gototheball']
			}
		});

		result.match(
			(newTask) => {
				proceed();
				invalidateAll();
			},
			(err) => {
				err.logError();
			}
		);
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
		<EventHandler selector="#btn-task-drawer-create" type="click" onEvent={proceed} />
		<EventHandler selector="#btn-task-drawer-cancel" type="click" onEvent={proceed} />
		<TModal selector="#drawer-task-creation" blockPage={false} onOutsideClick={proceed}>
			{#snippet title()}
				"Can I do this in 15 minutes?"
			{/snippet}
			If not, you probably need to break it down into further subtasks.
		</TModal>
	{:else if step === 7}
		<EventHandler selector="#btn-nav-planner" type="click" onEvent={markDone} />
		<TModal selector="#btn-nav-planner" placement="top" blockPage={false} onOutsideClick={markDone}>
			Once you've cast the vision, we'll handle the rest. Go to the planner page anytime and I'll
			show you how.
		</TModal>
	{/if}
{/if}
