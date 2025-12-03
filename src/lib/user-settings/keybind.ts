import { BaseSetting, type BaseSettingArgs } from "./types";

interface KeybindSettingArgs extends BaseSettingArgs<KeyChordPrimary> { }

export class KeybindSetting extends BaseSetting<KeyChordPrimary> {
	constructor(args: KeybindSettingArgs) {
		super(args);
	}
}

export type ModKey = 'Ctrl' | 'Shift' | 'Alt' | 'Meta';

export type LetterKey =
	| 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M'
	| 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';

export type DigitKey =
	| '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

export type FunctionKey =
	| 'F1' | 'F2' | 'F3' | 'F4' | 'F5' | 'F6' | 'F7' | 'F8'
	| 'F9' | 'F10' | 'F11' | 'F12' | 'F13' | 'F14' | 'F15' | 'F16'
	| 'F17' | 'F18' | 'F19' | 'F20' | 'F21' | 'F22' | 'F23' | 'F24';

export type NavigationKey =
	| 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'
	| 'Home' | 'End' | 'PageUp' | 'PageDown';

export type EditingKey =
	| 'Backspace' | 'Delete' | 'Insert';

export type SystemKey =
	| 'Escape' | 'Enter' | 'Tab' | 'Space';

export type PunctuationKey =
	| 'Minus'        // -
	| 'Equal'        // =
	| 'BracketLeft'  // [
	| 'BracketRight' // ]
	| 'Backslash'    // \
	| 'Semicolon'    // ;
	| 'Quote'        // '
	| 'Comma'        // ,
	| 'Period'       // .
	| 'Slash'        // /
	| 'Backquote';   // `

export type NumpadKey =
	| 'Numpad0' | 'Numpad1' | 'Numpad2' | 'Numpad3' | 'Numpad4'
	| 'Numpad5' | 'Numpad6' | 'Numpad7' | 'Numpad8' | 'Numpad9'
	| 'NumpadAdd' | 'NumpadSubtract' | 'NumpadMultiply' | 'NumpadDivide'
	| 'NumpadDecimal' | 'NumpadEnter' | 'NumpadEqual' | 'NumpadComma'; // equal/ comma exist on some layouts

export type MiscKey =
	| 'PrintScreen' | 'ScrollLock' | 'Pause' // legacy but sometimes used
	| 'ContextMenu'; // right-click menu key on some keyboards

export type NonModKey =
	| LetterKey
	| DigitKey
	| FunctionKey
	| NavigationKey
	| EditingKey
	| SystemKey
	| PunctuationKey
	| NumpadKey
	| MiscKey;

export type KeyId = ModKey | NonModKey;

// Primary-based chord (primary = Ctrl on Win/Linux, Meta on macOS)
export type KeyChordPrimary = {
	primary: boolean;
	shift: boolean;
	alt: boolean;
	// You can add secondaryCtrl/meta if you want combos that include both (rare).
	key: NonModKey; // never a modifier
};

// Optional: multi-step sequences: "Primary+K then Primary+F"
export type KeySequencePrimary = KeyChordPrimary[];

export type KeyChordString = string & { __brand: 'KeyChordString' };
export type KeySequenceString = string & { __brand: 'KeySequenceString' };

// Platform helpers
export const isMac = () =>
	typeof navigator !== 'undefined' &&
	/Mac|iPhone|iPad|iPod/.test(navigator.platform);

export function chordPrimaryToDisplay(chord: KeyChordPrimary): string {
	// Canonical string for UI like "Cmd+Shift+F" on mac, "Ctrl+Shift+F" elsewhere
	const parts: string[] = [];
	if (chord.primary) parts.push(isMac() ? 'Cmd' : 'Ctrl');
	if (chord.alt) parts.push(isMac() ? 'Option' : 'Alt');
	if (chord.shift) parts.push('Shift');
	parts.push(chord.key);
	return parts.join('+');
}

export function chordPrimaryToCanonical(chord: KeyChordPrimary): KeyChordString {
	// Canonical, platform-agnostic storage string using 'Primary' modifier
	const parts: string[] = [];
	if (chord.primary) parts.push('Primary');
	if (chord.alt) parts.push('Alt');
	if (chord.shift) parts.push('Shift');
	parts.push(chord.key);
	return parts.join('+') as KeyChordString;
}

export function parseCanonicalChord(s: string): KeyChordPrimary | null {
	// Accept "Primary+Shift+F", order-insensitive
	const parts = s.split('+').map(p => p.trim());
	let primary = false;
	let shift = false;
	let alt = false;
	let key: NonModKey | null = null;

	for (const p of parts) {
		const up = p[0].toUpperCase() + p.slice(1);
		if (up === 'Primary') primary = true;
		else if (up === 'Shift') shift = true;
		else if (up === 'Alt') alt = true;
		else if (isNonModKey(up)) key = up as NonModKey;
	}
	if (!key) return null;
	return { primary, shift, alt, key };
}

function isNonModKey(k: string): k is NonModKey {
	return (
		(letterSet.has(k as LetterKey)) ||
		(digitSet.has(k as DigitKey)) ||
		(functionSet.has(k as FunctionKey)) ||
		(navigationSet.has(k as NavigationKey)) ||
		(editingSet.has(k as EditingKey)) ||
		(systemSet.has(k as SystemKey)) ||
		(punctSet.has(k as PunctuationKey)) ||
		(numpadSet.has(k as NumpadKey)) ||
		(miscSet.has(k as MiscKey))
	);
}

// Prebuilt sets for runtime guards
const letterSet = new Set<LetterKey>([
	'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
	'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
]);

const digitSet = new Set<DigitKey>(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

const functionSet = new Set<FunctionKey>([
	'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8',
	'F9', 'F10', 'F11', 'F12', 'F13', 'F14', 'F15', 'F16',
	'F17', 'F18', 'F19', 'F20', 'F21', 'F22', 'F23', 'F24',
]);

const navigationSet = new Set<NavigationKey>([
	'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown',
]);

const editingSet = new Set<EditingKey>(['Backspace', 'Delete', 'Insert']);

const systemSet = new Set<SystemKey>(['Escape', 'Enter', 'Tab', 'Space']);

const punctSet = new Set<PunctuationKey>([
	'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash',
	'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'Backquote',
]);

const numpadSet = new Set<NumpadKey>([
	'Numpad0', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4',
	'Numpad5', 'Numpad6', 'Numpad7', 'Numpad8', 'Numpad9',
	'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide',
	'NumpadDecimal', 'NumpadEnter', 'NumpadEqual', 'NumpadComma',
]);

const miscSet = new Set<MiscKey>([
	'PrintScreen', 'ScrollLock', 'Pause', 'ContextMenu',
]);

// Convert a KeyboardEvent to your primary chord (ignores pure-modifier presses)
export function chordFromKeyboardEventPrimary(e: KeyboardEvent): KeyChordPrimary | null {
	const key = normalizeKeyToNonMod(e);
	if (!key) return null;
	return {
		primary: isMac() ? e.metaKey : e.ctrlKey,
		shift: e.shiftKey,
		alt: e.altKey,
		key,
	};
}

// Layout-stable normalization using e.code where possible
export function normalizeKeyToNonMod(e: KeyboardEvent): NonModKey | null {
	const { key, code } = e;

	// Filter out modifier-only presses
	if (key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') return null;

	// System
	if (key === 'Escape') return 'Escape';
	if (key === 'Enter') return 'Enter';
	if (key === 'Tab') return 'Tab';
	if (key === ' ') return 'Space';

	// Editing
	if (key === 'Backspace') return 'Backspace';
	if (key === 'Delete') return 'Delete';
	if (key === 'Insert') return 'Insert';

	// Navigation
	if (key === 'Home') return 'Home';
	if (key === 'End') return 'End';
	if (key === 'PageUp') return 'PageUp';
	if (key === 'PageDown') return 'PageDown';
	if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
		return key as NavigationKey;
	}

	// Function
	if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) return key as FunctionKey;

	// Letters (layout-stable via code)
	if (code.startsWith('Key')) {
		const k = code.slice(3).toUpperCase();
		if (letterSet.has(k as LetterKey)) return k as LetterKey;
	}

	// Digits on top row (layout-stable via code)
	if (code.startsWith('Digit')) {
		const d = code.slice(5) as DigitKey;
		if (digitSet.has(d)) return d;
	}

	// Punctuation via code
	const codeToPunct: Record<string, PunctuationKey> = {
		Minus: 'Minus',
		Equal: 'Equal',
		BracketLeft: 'BracketLeft',
		BracketRight: 'BracketRight',
		Backslash: 'Backslash',
		Semicolon: 'Semicolon',
		Quote: 'Quote',
		Comma: 'Comma',
		Period: 'Period',
		Slash: 'Slash',
		Backquote: 'Backquote',
	};
	if (codeToPunct[code as keyof typeof codeToPunct]) {
		return codeToPunct[code as keyof typeof codeToPunct];
	}

	// Numpad
	if (code.startsWith('Numpad')) {
		const tail = code.slice(6);
		switch (tail) {
			case '0': return 'Numpad0';
			case '1': return 'Numpad1';
			case '2': return 'Numpad2';
			case '3': return 'Numpad3';
			case '4': return 'Numpad4';
			case '5': return 'Numpad5';
			case '6': return 'Numpad6';
			case '7': return 'Numpad7';
			case '8': return 'Numpad8';
			case '9': return 'Numpad9';
			case 'Add': return 'NumpadAdd';
			case 'Subtract': return 'NumpadSubtract';
			case 'Multiply': return 'NumpadMultiply';
			case 'Divide': return 'NumpadDivide';
			case 'Decimal': return 'NumpadDecimal';
			case 'Enter': return 'NumpadEnter';
			case 'Equal': return 'NumpadEqual';
			case 'Comma': return 'NumpadComma';
		}
	}

	// Misc
	if (key === 'PrintScreen') return 'PrintScreen';
	if (key === 'ScrollLock') return 'ScrollLock';
	if (key === 'Pause') return 'Pause';
	if (key === 'ContextMenu') return 'ContextMenu';

	return null;
}

// Interop: convert to hotkeys-js grammar if needed
export function chordPrimaryToHotkeysString(chord: KeyChordPrimary): string {
	const parts: string[] = [];
	if (chord.primary) parts.push(isMac() ? 'command' : 'ctrl');
	if (chord.alt) parts.push(isMac() ? 'option' : 'alt');
	if (chord.shift) parts.push('shift');
	// map our key names to hotkeys names where they differ
	const keyMap: Record<string, string> = {
		'Escape': 'esc',
		'Backspace': 'backspace',
		'Delete': 'del',
		'Insert': 'ins',
		'PageUp': 'pageup',
		'PageDown': 'pagedown',
		'ArrowUp': 'up',
		'ArrowDown': 'down',
		'ArrowLeft': 'left',
		'ArrowRight': 'right',
		'Space': 'space',
		'Minus': '-',
		'Equal': '=',
		'BracketLeft': '[',
		'BracketRight': ']',
		'Backslash': '\\',
		'Semicolon': ';',
		'Quote': '\'',
		'Comma': ',',
		'Period': '.',
		'Slash': '/',
		'Backquote': '`',
	};
	let base = keyMap[chord.key] ?? chord.key;
	return [...parts, base].join('+').toLowerCase();
}