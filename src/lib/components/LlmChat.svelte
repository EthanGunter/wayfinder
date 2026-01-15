<script lang="ts">
	import Button from "$lib/components/ui/button/button.svelte";
	import * as Select from "$lib/components/ui/select";
	import type { EnumOption } from "$lib/config/user-settings/types";

	type ChatMessage = {
		id: string;
		role: "user" | "assistant";
		content: string;
	};

	type Props = {
		messages: ChatMessage[];
		onSend?: (content: string) => void;
		placeholder?: string;
		disabled?: boolean;
		// Model selection
		selectedModel: string;
		onModelChange?: (model: string) => void;
		modelOptions: EnumOption<string>[];
	};

	let {
		messages,
		onSend,
		placeholder = "Type a message...",
		disabled = false,
		selectedModel,
		onModelChange,
		modelOptions,
	}: Props = $props();

	let draft = $state("");

	function send() {
		const content = draft.trim();
		if (!content || disabled || !onSend) return;
		onSend(content);
		draft = "";
	}

	const displayModel = $derived(
		modelOptions.find((o) => o.value === selectedModel)?.label ?? selectedModel
	);
	const selectItems = $derived(modelOptions.map((o) => ({ value: o.value, label: o.label })));
</script>

<div class="flex h-full flex-col gap-3">
	<div class="flex items-center justify-between gap-4 px-1">
		<div class="text-sm font-medium">Conversation</div>
		<div class="flex items-center gap-2">
			<span class="text-[10px] font-semibold uppercase text-muted-foreground">Model</span>
			<Select.Root
				type="single"
				value={selectedModel}
				onValueChange={(v) => onModelChange?.(v)}
				items={selectItems}
			>
				<Select.Trigger class="h-8 min-w-[140px] text-xs">
					{displayModel}
				</Select.Trigger>
				<Select.Content>
					{#each modelOptions as opt}
						<Select.Item value={opt.value} label={opt.label} />
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
	</div>

	<div class="min-h-[300px] flex-1 overflow-auto rounded-md border bg-background p-3">
		{#if messages.length === 0}
			<div class="flex h-full items-center justify-center text-sm text-muted-foreground italic">
				Start a conversation to define your goal...
			</div>
		{:else}
			<div class="space-y-4">
				{#each messages as message (message.id)}
					<div
						class={`flex flex-col gap-1 rounded-lg border p-3 text-sm shadow-sm ${
							message.role === "assistant"
								? "bg-muted/30 border-muted"
								: "bg-primary/5 border-primary/10 ml-8"
						} ${message.role === "assistant" ? "mr-8" : ""}`}
					>
						<div class="flex items-center justify-between opacity-50">
							<span class="text-[10px] font-bold uppercase tracking-wider">
								{message.role}
							</span>
						</div>
						<div class="whitespace-pre-wrap leading-relaxed">{message.content}</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<div class="flex items-end gap-2">
		<textarea
			class="min-h-[80px] w-full resize-none rounded-md border bg-background p-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring"
			bind:value={draft}
			placeholder={placeholder}
			disabled={disabled}
			onkeydown={(e) => {
				if (e.key === "Enter" && !e.shiftKey) {
					e.preventDefault();
					send();
				}
			}}
		></textarea>
		<Button
			class="h-10 px-4"
			disabled={disabled || draft.trim().length === 0}
			onclick={send}
		>
			Send
		</Button>
	</div>
</div>
