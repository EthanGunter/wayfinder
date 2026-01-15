<script lang="ts">
	import Button from "$lib/components/ui/button/button.svelte";
	import LlmChat from "$lib/components/LlmChat.svelte";
	import { sharedConvexClient } from "$lib/API/ConvexClient";
	import { api as convexApi } from "$convex/_generated/api";
	import { settings } from "$lib/config/user-settings";
	import { resolveLlm } from "$lib/config/user-settings/llm-options";

	type ChatMessage = {
		id: string;
		role: "user" | "assistant";
		content: string;
	};

	let messages = $state<ChatMessage[]>([]);
	let goalStatement = $state("");
	let createdSprintId = $state<string | null>(null);
	let isSaving = $state(false);
	let errorMessage = $state<string | null>(null);
	let messageCounter = 0;
	let canConfirm = $state(false);
	let isWaitingForAi = $state(false);

	const llmModel = settings.sprints.core.llmModel;
	const connectionsStore = settings.llm.customConnections.connections;
	const enabledOptionsStore = settings.llm.llm.enabledConnections.getEnabledOptions();

	$effect(() => {
		canConfirm = goalStatement.trim().length > 0 && !isSaving && !isWaitingForAi;
	});

	async function handleSend(content: string) {
		const userMsg: ChatMessage = {
			id: `msg-${++messageCounter}`,
			role: "user",
			content,
		};
		messages = [...messages, userMsg];

		isWaitingForAi = true;
		errorMessage = null;

		try {
			const transcript = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
			const resolved = resolveLlm($llmModel, $connectionsStore);

			// TODO:Refactor this is bad. We should be calling a TS middle-layer api similar to the task and auth systems.
			const result = await sharedConvexClient.action(convexApi.llm.call, {
				message: transcript,
				...resolved,
			});

			const assistantMsg: ChatMessage = {
				id: `msg-${++messageCounter}`,
				role: "assistant",
				content: result.text,
			};
			messages = [...messages, assistantMsg];

			// Parse for goal statement (extract last <goal>...</goal> tag)
			const pattern = /<goal>([\s\S]*?)<\/goal>/g;
			let match: RegExpExecArray | null = null;
			let last: string | null = null;
			while ((match = pattern.exec(result.text)) !== null) {
				last = match[1] ?? null;
			}
			if (last !== null) {
				const trimmed = last.trim();
				if (trimmed.length > 0) {
					goalStatement = trimmed;
				}
			}
		} catch (error) {
			console.error(error);
			errorMessage = "AI failed to respond. Check your LLM settings/keys.";
		} finally {
			isWaitingForAi = false;
		}
	}

	async function confirmGoal() {
		const goal = goalStatement.trim();
		if (!goal || isSaving) return;

		isSaving = true;
		errorMessage = null;
		createdSprintId = null;

		try {
			const now = Date.now();
			const sprint = await sharedConvexClient.mutation(convexApi.skillSprints.createSprint, {
				title: goal,
				goal,
				startsAt: now,
				endsAt: now + 7 * 24 * 60 * 60 * 1000,
			});
			createdSprintId = sprint._id;
		} catch (error) {
			console.error(error);
			errorMessage = "Failed to create sprint.";
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="mx-auto w-full max-w-5xl p-4">
	<div class="space-y-2">
		<h1 class="text-xl font-semibold">Skill Sprint</h1>
		<p class="text-sm text-muted-foreground">
			Dev-only experiment. Chat on the left, confirm your goal on the right.
		</p>
	</div>

	<div class="mt-6 grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
		<section class="space-y-3">
			<LlmChat
				{messages}
				onSend={handleSend}
				disabled={isWaitingForAi}
				selectedModel={$llmModel}
				onModelChange={(v) => ($llmModel = v)}
				modelOptions={$enabledOptionsStore}
				placeholder="Share what you want to get good at. Use <goal>...</goal> when ready."
			/>
		</section>

		<aside class="space-y-4">
			<div class="rounded-md border bg-background p-4">
				<div class="text-sm font-medium">Goal statement</div>
				<div class="mt-2 text-sm text-muted-foreground">
					{#if goalStatement.trim().length === 0}
						<span>Waiting for a <code class="text-xs">&lt;goal&gt;...&lt;/goal&gt;</code> tag.</span>
					{:else}
						<div class="whitespace-pre-wrap text-foreground">{goalStatement}</div>
					{/if}
				</div>
			</div>

			<Button class="w-full" disabled={!canConfirm} onclick={confirmGoal}>
				{isSaving ? "Creating sprint..." : "Confirm goal"}
			</Button>

			{#if createdSprintId}
				<div class="text-sm text-emerald-500">Sprint created: {createdSprintId}</div>
			{/if}

			{#if errorMessage}
				<div class="text-sm text-destructive">{errorMessage}</div>
			{/if}
		</aside>
	</div>
</div>

