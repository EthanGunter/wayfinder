<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import {
		type KeybindSetting,
		chordPrimaryToDisplay,
		chordFromKeyboardEventPrimary
	} from '../keybind';

	interface Props {
		store: KeybindSetting;
	}

	const { store }: Props = $props();
	let listening = $state(false);

	function handleClick() {
		listening = true;
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (!listening) return;

		e.preventDefault();
		e.stopPropagation();

		// Escape cancels listening mode
		if (e.key === 'Escape') {
			listening = false;
			return;
		}

		const chord = chordFromKeyboardEventPrimary(e);
		if (chord) {
			store.set(chord);
			listening = false;
		}
	}

	function handleBlur() {
		listening = false;
	}
</script>

<div style="grid-area: actions" class="justify-self-center self-center min-w-0">
	<Button
		variant="outline"
		class="min-w-24 {listening ? 'border-2 border-blue-500 bg-blue-50' : ''}"
		onclick={handleClick}
		onkeydown={handleKeyDown}
		onblur={handleBlur}
	>
		{listening ? 'Press a key...' : chordPrimaryToDisplay($store)}
	</Button>
</div>
