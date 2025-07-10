<!-- 
 @component
 #snippet listItem(item, index)
 -->
<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import {
		droppable,
		DragOverEvent,
		DragEnterEvent,
		DragLeaveEvent,
		DropEvent,
		eventNames
	} from '$lib/actions/dnd';

	interface Props {
		id?: string;
		scrollable?: boolean;
		accepts?: string[];
		items: T[];
		listItem: Snippet<[T, number]>;
		onListOrderChanged?: (items: T[]) => void;
		// onItemAdded?: (item: T) => void;
		// onItemRemoved?: (item: T) => void;
	}

	const {
		id = '',
		scrollable = false,
		accepts = ['*'],
		items: initialItems = [],
		listItem,
		onListOrderChanged = undefined
	}: Props = $props();

	let items = $state([...initialItems]);
	let originalItems: T[] = [];
	let isDraggingFromThisList = false;
	let temporaryItem: T | null = null;

	// Update items when props change
	$effect(() => {
		items = [...initialItems];
	});

	function handleDragEnter(event: DragEnterEvent) {
		const draggedItem = event.detail.data;

		// Save original state before any modifications
		originalItems = [...items];

		// Check if the dragged item is from this list
		isDraggingFromThisList = originalItems.includes(draggedItem);

		// If dragging from another list, temporarily add the item
		if (!items.includes(draggedItem)) {
			temporaryItem = draggedItem;
			// Add to the end initially
			items = [...items, draggedItem];
		}
	}

	function handleDragOver(event: DragOverEvent) {
		event.stopPropagation();
		const draggedItem = event.detail.data;

		// Skip if the item isn't in our list (shouldn't happen after handleDragEnter)
		if (!items.includes(draggedItem)) {
			return;
		}

		const listElement = event.currentTarget as HTMLElement;
		const draggedIndex = items.indexOf(draggedItem);

		// If the list only has the dragged item, no need to reorder
		if (items.length <= 1) {
			return;
		}

		const mouseY = event.detail.clientY;
		const listRect = listElement.getBoundingClientRect();

		// Calculate mouse position as a percentage of the list height
		let percent = (mouseY - listRect.top) / listRect.height;
		percent = Math.max(0, Math.min(percent, 0.9999)); // Clamp to [0, just under 1]

		// Calculate the target index
		let targetIndex = Math.floor(percent * (items.length + 1));

		// Adjust for removal if moving down
		if (draggedIndex < targetIndex) {
			targetIndex--;
		}

		// Don't move if it would end up in the same position
		if (targetIndex === draggedIndex) {
			return;
		}

		const newItems = [...items];
		newItems.splice(draggedIndex, 1);
		newItems.splice(targetIndex, 0, draggedItem);
		items = newItems;
	}

	function handleDrop(event: DropEvent) {
		event.stopPropagation();
		if (event.detail.dropAllowed) {
			// The drop was successful on this list
			onListOrderChanged?.(items);
		} else {
			// Drop failed - revert to original order
			items = originalItems;
		}

		// Reset state
		originalItems = [];
		isDraggingFromThisList = false;
		temporaryItem = null;
	}

	/** Called when an item from this list gets dropped somewhere other than this */
	function handleDropElsewhere(event: DropEvent) {
		if (event.detail.dropAllowed) {
			// The drop was successful on this list
			onListOrderChanged?.(items);
		} else {
			// Drop failed - revert to original order
			items = originalItems;
		}

		// Reset state
		originalItems = [];
		isDraggingFromThisList = false;
		temporaryItem = null;
	}

	function handleDragLeave(event: DragLeaveEvent) {
		const draggedItem = event.detail.data;

		if (originalItems.includes(draggedItem)) {
			event.detail.ghost.addEventListener(eventNames.DROP, handleDropElsewhere as EventListener, {
				once: true
			});
			// items = items.filter((x) => x !== draggedItem);
		}

		// If we temporarily added an item from another list, remove it
		if (temporaryItem === draggedItem && !isDraggingFromThisList) {
			items = originalItems;
			temporaryItem = null;
		}
	}
</script>

{#if accepts && accepts.length > 0}
	<ol
		class="item-list"
		{id}
		data-scrollable={scrollable}
		use:droppable={{
			accepts,
			onDrop: handleDrop,
			onDragEnter: handleDragEnter,
			onDragOver: handleDragOver,
			onDragLeave: handleDragLeave
		}}
	>
		{#each items as item, index (item)}
			{@render listItem(item, index)}
		{/each}
	</ol>
{:else}
	<ol class="item-list" {id} data-scrollable={scrollable}>
		{#each items as item, index (item)}
			{@render listItem(item, index)}
		{/each}
	</ol>
{/if}

<style lang="scss">
	.item-list {
		// Fill the containing element
		height: min-content;

		display: flex;
		flex-direction: column;
		padding: 0.5rem;
		gap: 0.2rem;
		list-style: none;
		margin: 0;
		position: relative;

		li {
			margin: 0;
			padding: 0;
			transition: transform 0.2s ease;
		}
	}

	.item-list[data-scrollable] {
		overflow-y: scroll;
	}

	:global(.dnd-droppable) {
		min-height: 2rem;
		transition:
			background-color 0.2s,
			border-color 0.2s;
		border: 2px dashed transparent;
	}
	:global(.dnd-droppable.valid-drop) {
		background-color: var(--background-modifier-hover, rgba(0, 122, 204, 0.1));
		border-color: var(--color-accent, #007acc);
	}

	:global(.dnd-droppable.invalid-drop) {
		background-color: var(--background-modifier-error, rgba(255, 0, 0, 0.1));
		border-color: var(--color-error, #ff0000);
	}
</style>
