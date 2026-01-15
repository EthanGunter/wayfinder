import type { Action } from 'svelte/action';
import {
	type KeybindSetting,
	type KeyChordPrimary,
	chordFromKeyboardEventPrimary,
	chordPrimaryToCanonical
} from '$lib/config/user-settings/keybind';

function isEditableTarget(el: EventTarget | null): boolean {
	if (!(el instanceof HTMLElement)) return false;
	const tag = el.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

function chordsMatch(a: KeyChordPrimary, b: KeyChordPrimary): boolean {
	return chordPrimaryToCanonical(a) === chordPrimaryToCanonical(b);
}

interface KeybindParams {
	setting: KeybindSetting;
	action: () => void;
	target?: EventTarget;
}

export const keybind: Action<HTMLElement, KeybindParams> = (node, params) => {
	let currentChord: KeyChordPrimary;
	let unsubscribe: (() => void) | undefined;
	let currentParams = params;
	let currentTarget: EventTarget | undefined;

	function handleKeyDown(event: Event) {
		if (!(event instanceof KeyboardEvent)) return;
		const e = event;

		if (isEditableTarget(e.target)) return;

		const pressedChord = chordFromKeyboardEventPrimary(e);
		if (!pressedChord) return;

		if (chordsMatch(pressedChord, currentChord)) {
			e.preventDefault();
			currentParams.action();
		}
	}

	function updateTarget(newTarget: EventTarget) {
		if (currentTarget === newTarget) return;

		if (currentTarget) {
			currentTarget.removeEventListener('keydown', handleKeyDown);
		}

		newTarget.addEventListener('keydown', handleKeyDown);
		currentTarget = newTarget;
	}

	function setup(p: KeybindParams) {
		currentParams = p;

		unsubscribe?.();
		unsubscribe = p.setting.subscribe((v) => (currentChord = v));

		updateTarget(p.target ?? node);
	}

	setup(params);

	return {
		update(newParams: KeybindParams) {
			setup(newParams);
		},
		destroy() {
			unsubscribe?.();
			if (currentTarget) {
				currentTarget.removeEventListener('keydown', handleKeyDown);
			}
		}
	};
};
