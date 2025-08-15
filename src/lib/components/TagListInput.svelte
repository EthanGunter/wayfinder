<script lang="ts">
	import BubbleText from './BubbleText.svelte';

	interface Props {
		items: string[];
		placeholder?: string;
		allowDuplicates?: boolean;
		errors?: Map<string, { msg: string }>;
		onAdd?: (newItem: string) => void;
		onRemove?: (deadItem: string) => void;
		onListChange?: (listItems: string[]) => void;
		onInputChange?: (value: string) => void;
		id?: string;
		class?: string;
	}

	const { 
		items = [], 
		placeholder = "tags", 
		allowDuplicates = false, 
		errors, 
		onAdd, 
		onRemove, 
		onListChange, 
		onInputChange,
		id,
		class: className = ""
	}: Props = $props();

	let input = $state("");
	let clonedItems = $state([...items]);

	// Update cloned items when props change
	$effect(() => {
		clonedItems = [...items];
		input = "";
	});

	function handleInputChange(evt: Event) {
		const target = evt.target as HTMLInputElement;
		const value = target.value;
		const lastChar = value[value.length - 1];

		switch (lastChar) {
			case ",":
			case " ":
				if (input.trim()) {
					addToList(input.trim());
				}
				break;
			default:
				input = value.replace(/\s/g, ''); // Remove spaces
				onInputChange?.(input);
		}
	}

	function handleKeyDown(evt: KeyboardEvent) {
		switch (evt.key) {
			case 'Enter':
			case ' ':
			case ',': {
				evt.preventDefault();
				if (input.trim()) {
					addToList(input.trim());
				}
				break;
			}
			case 'Backspace': {
				// If input is empty and we have items, edit the last item
				if (!input && clonedItems.length > 0) {
					evt.preventDefault();
					const lastItem = clonedItems[clonedItems.length - 1];
					input = lastItem;
					removeFromList(lastItem);
				}
				break;
			}
		}
	}

	function handleBlur() {
		if (input.trim()) {
			addToList(input.trim());
		}
	}

	function addToList(newItem: string) {
		if (allowDuplicates || !clonedItems.includes(newItem)) {
			clonedItems = [...clonedItems, newItem];
			input = "";
			onAdd?.(newItem);
			onListChange?.(clonedItems);
		}
	}

	function removeFromList(deadItem: string) {
		const index = clonedItems.findIndex(x => x === deadItem);
		if (index !== -1) {
			clonedItems = clonedItems.filter((_, i) => i !== index);
			onRemove?.(deadItem);
			onListChange?.(clonedItems);
		}
	}

	function handleSubmit(evt: SubmitEvent) {
		evt.preventDefault();
		if (input.trim()) {
			addToList(input.trim());
		}
	}
</script>

<form class="flex flex-row flex-wrap gap-2 items-center text-gray-500 border border-gray-300 rounded-lg bg-gray-100 {className}" onsubmit={handleSubmit}>
	{#each clonedItems as item (item)}
		<label for={id}>
			<BubbleText
				id={item}
				onDelete={removeFromList}
				error={errors?.get(item)}
			>
				{item}
			</BubbleText>
		</label>
	{/each}
	<input
		{id}
		type="text"
		bind:value={input}
		inputmode="text"
		onkeydown={handleKeyDown}
		oninput={handleInputChange}
		onblur={handleBlur}
		placeholder={clonedItems.length === 0 ? placeholder : ''}
		aria-label={placeholder}
		class="flex-grow min-h-6 border-none outline-none bg-transparent text-sm p-1"
	/>
</form>