<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Editor, defaultValueCtx, rootCtx, commandsCtx, editorViewCtx } from '@milkdown/core';
	import { history, historyKeymap } from '@milkdown/kit/plugin/history';
	import { indent, indentConfig } from '@milkdown/kit/plugin/indent';
	import { nord } from '@milkdown/theme-nord';
	import { commonmark, inputRules as commonmarkInputRules } from '@milkdown/preset-commonmark';
	import { gfm } from '@milkdown/preset-gfm';
	import { listener, listenerCtx } from '@milkdown/plugin-listener';
	import {
		commands,
		insertHrCommand,
		insertImageCommand,
		updateImageCommand,
		toggleLinkCommand,
		updateLinkCommand,
		toggleEmphasisCommand,
		toggleStrongCommand,
		toggleInlineCodeCommand,
		wrapInHeadingCommand,
		downgradeHeadingCommand,
		wrapInBlockTypeCommand,
		wrapInBlockquoteCommand,
		wrapInBulletListCommand,
		wrapInOrderedListCommand,
		createCodeBlockCommand
	} from '@milkdown/preset-commonmark';

	// ProseMirror helpers for lists/key handling
	import { liftListItem, sinkListItem } from '@milkdown/prose/schema-list';
	import Icon from '@iconify/svelte';
	import { $prose as prose } from '@milkdown/utils';
	import {
		inputRules as proseInputRules,
		textblockTypeInputRule,
		wrappingInputRule
	} from '@milkdown/prose/inputrules';

	// Svelte 5 props
	type Props = {
		value: string;
		onChange?: (md: string) => void;
	};
	let { value, onChange }: Props = $props(); // this is fine in Svelte 5

	let container: HTMLDivElement | null = null;
	let editor: Editor | null = null;

	onMount(async () => {
		editor = await Editor.make()
			.config((ctx) => {
				ctx.set(rootCtx, container!);
				ctx.set(defaultValueCtx, value);
			})
			.config(nord)

			.use(commonmark)
			.use(gfm)

			.use(history)
			.config((ctx) => {
				ctx.set(historyKeymap.key, {
					Undo: { shortcuts: 'Mod-z' },
					Redo: { shortcuts: ['Mod-y', 'Shift-Mod-z'] }
				});
			})
			.use(listener)
			.use(commands)
			.create();

		// markdown change stream
		editor.action((ctx) => {
			const l = ctx.get(listenerCtx);
			l.markdownUpdated((_, md) => {
				if (md !== value) {
					value = md;
					onChange?.(md);
				}
			});
		});

		// Key behavior: exit list on Enter when item is empty; Tab/Shift-Tab indent control
		editor.action((ctx) => {
			const view = ctx.get(editorViewCtx);
			view.setProps({
				handleKeyDown(view, event) {
					const { state, dispatch } = view;
					const { $from: pos } = state.selection;
					const listItemType = state.schema.nodes.list_item;

					// Exit list on Enter in empty list item
					if (event.key === 'Enter') {
						const inListItem =
							pos.parent.type.name === 'paragraph' && pos.node(-1)?.type?.name === 'list_item';
						const empty = pos.parent.type.name === 'paragraph' && pos.parent.content.size === 0;

						if (inListItem && empty && listItemType) {
							if (liftListItem(listItemType)(state, dispatch)) {
								event.preventDefault();
								return true;
							}
						}
					}

					// Indent/outdent with Tab
					if (event.key === 'Tab' && listItemType) {
						if (!event.shiftKey) {
							if (sinkListItem(listItemType)(state, dispatch)) {
								event.preventDefault();
								return true;
							}
						} else {
							if (liftListItem(listItemType)(state, dispatch)) {
								event.preventDefault();
								return true;
							}
						}
					}

					return false;
				}
			});
		});

		editor.action((ctx) => {
			const view = ctx.get(editorViewCtx);
			const { schema } = view.state;

			const rules = [];

			// Keep: "# " -> heading level 1..6
			for (let level = 1; level <= 6; level++) {
				const hash = '#'.repeat(level);
				rules.push(
					textblockTypeInputRule(
						new RegExp(`^${hash}\\s$`), // start-of-line "#{level} " then space
						schema.nodes.heading,
						{ level }
					)
				);
			}

			// Keep: "- " -> bullet list
			if (schema.nodes.bullet_list && schema.nodes.list_item) {
				rules.push(wrappingInputRule(/^-\s$/, schema.nodes.bullet_list));
			}

			// Optional: keep ordered list "1. "
			if (schema.nodes.ordered_list && schema.nodes.list_item) {
				rules.push(
					wrappingInputRule(/^(\d+)\.\s$/, schema.nodes.ordered_list, (match) => ({
						order: Number(match[1])
					}))
				);
			}

			// Build curated input-rules plugin
			const curatedIR = proseInputRules({ rules });

			// Replace existing inputRules plugin(s)
			const withoutDefaultIR = view.state.plugins.filter(
				(p: any) => p.spec?.key?.key !== 'inputRules'
			);

			view.setProps({
				plugins: [...withoutDefaultIR, curatedIR]
			});
		});
	});

	onDestroy(() => {
		editor?.destroy();
		editor = null;
	});
</script>

<div class="overflow-hidden rounded-md border-1 border-gray-200">
	<!-- Consider using this for contextual toolbar: https://milkdown.dev/docs/api/plugin-tooltip -->
	<!-- 	<div class="toolbar">
		<button onclick={toggleBold}><Icon icon="lucide:bold" /></button>
		<button onclick={toggleItalic}><Icon icon="lucide:italic" /></button>
		<button onclick={() => heading(1)}><Icon icon="lucide:heading-1" /></button>
		<button onclick={() => heading(2)}><Icon icon="lucide:heading-2" /></button>
		<button onclick={() => heading(3)}><Icon icon="lucide:heading-3" /></button>
		<button onclick={toggleBulletList}><Icon icon="lucide:list" /></button>
		<button onclick={toggleOrderedList}><Icon icon="lucide:list-ordered" /></button>
		<button onclick={toggleBlockquote}><Icon icon="lucide:quote" /></button>
		<button onclick={toggleInlineCode}><Icon icon="lucide:code" /></button>
		<button onclick={toggleCodeFence}><Icon icon="hugeicons:code" /></button>
		<button onclick={toggleLink}><Icon icon="lucide:link" /></button>
	</div> -->

	<div bind:this={container} class="markdown p-2" ></div>
</div>

<style>
	.toolbar {
		display: flex;
		gap: 8px;
		padding: 6px;
		border-bottom: 1px solid #e2e2e2;
		background: #fafafa;
	}
	button {
		cursor: pointer;
	}
	:global(.milkdown ul, ol) {
		list-style: disc;
		padding-left: 1rem;
	}
</style>
