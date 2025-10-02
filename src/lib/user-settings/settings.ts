import { writable, derived, type Readable, type Subscriber, type Unsubscriber, type Writable } from 'svelte/store';
import { get as getStore } from 'svelte/store';

export type PersistHandler = (id: string, value: unknown) => void | Promise<void>;

export abstract class BaseSetting<T> implements Writable<T> {
	readonly kind: string;
	readonly label: string;
	readonly desc?: string;
	readonly hint?: string;
	protected readonly store: Writable<T>;
	private persistHandler?: PersistHandler;
	private _id: string;

	constructor(args: { kind: string; label: string; defaultValue: T; desc?: string; hint?: string; onPersist?: PersistHandler; }) {
		this.kind = args.kind;
		this.label = args.label;
		this.desc = args.desc;
		this.hint = args.hint;
		this.store = writable(args.defaultValue);
		this.persistHandler = args.onPersist;
		this._id = "NOT_CALCULATED";

		this.subscribe = this.store.subscribe;
	}

	setPath(path: string): void {
		this._id = path;
	}

	setPersist(handler: PersistHandler | undefined): void {
		this.persistHandler = handler;
	}

	get id(): string | undefined {
		return this._id;
	}

	subscribe: (this: void, run: Subscriber<T>, invalidate?: () => void) => Unsubscriber;

	set = (value: T): void => {
		this.store.set(value);
		if (this.persistHandler && this._id) {
			void this.persistHandler(this._id, value as unknown);
		}
	};

	update = (updater: (value: T) => T): void => {
		this.store.update((prev) => {
			const next = updater(prev);
			if (this.persistHandler && this._id) {
				void this.persistHandler(this._id, next as unknown);
			}
			return next;
		});
	};
}

export class BoolSetting extends BaseSetting<boolean> {
	constructor(args: { label: string; defaultValue: boolean; desc?: string; hint?: string; onPersist?: PersistHandler; }) {
		super({ ...args, kind: 'bool' });
	}
}

export class StringSetting extends BaseSetting<string> {
	constructor(args: { label: string; defaultValue: string; desc?: string; hint?: string; onPersist?: PersistHandler; }) {
		super({ ...args, kind: 'string' });
	}
}

export class NumberSetting extends BaseSetting<number> {
	readonly min?: number;
	readonly max?: number;
	readonly step?: number;
	constructor(args: { label: string; defaultValue: number; min?: number; max?: number; step?: number; desc?: string; hint?: string; onPersist?: PersistHandler; }) {
		super({ ...args, kind: 'number' });
		this.min = args.min;
		this.max = args.max;
		this.step = args.step;
	}
}

export class EnumSetting<T extends string> extends BaseSetting<T> {
	readonly options: readonly T[];
	constructor(args: { label: string; defaultValue: T; options: readonly T[]; desc?: string; hint?: string; onPersist?: PersistHandler; }) {
		super({ ...args, kind: 'enum' });
		this.options = args.options;
	}
}

export class DictSetting extends BaseSetting<Record<string, string>> {
	readonly keyLabel?: string;
	constructor(args: { label: string; defaultValue?: Record<string, string>; keyLabel?: string; description?: string; hint?: string; onPersist?: PersistHandler; }) {
		super({ kind: 'dict', label: args.label, defaultValue: args.defaultValue ?? {}, desc: args.description, hint: args.hint, onPersist: args.onPersist });
		this.keyLabel = args.keyLabel;
	}

	asMap(): Readable<Map<string, string>> { return derived(this, (obj) => new Map(Object.entries(obj))); }
}

export type AnySetting = BoolSetting | StringSetting | NumberSetting | EnumSetting<string> | DictSetting;

// New shape using $label and direct nesting: tab -> sections -> settings
export type SettingsSection = { $label: string;[key: string]: AnySetting | string };
export type SettingsTab = { $label: string;[key: string]: SettingsSection | string };
export type SettingsTree = Record<string, SettingsTab>;

function isSection(val: unknown): val is SettingsSection {
	return typeof val === 'object' && val !== null && '$label' in (val as Record<string, unknown>);
}

function isSetting(val: unknown): val is AnySetting {
	return typeof val === 'object' && val !== null && 'setPath' in (val as Record<string, unknown>);
}

export function assignPaths(tree: SettingsTree): void {
	for (const [tabId, tab] of Object.entries(tree)) {
		for (const [sectionId, section] of Object.entries(tab)) {
			if (sectionId === '$label') continue; // skip $label
			if (!isSection(section)) continue;
			for (const [itemId, setting] of Object.entries(section)) {
				if (itemId === '$label') continue; // skip $label
				if (!isSetting(setting)) continue;
				setting.setPath(`${tabId}/${sectionId}/${itemId}`);
			}
		}
	}
}


