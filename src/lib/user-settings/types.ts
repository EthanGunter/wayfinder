import { Err, InvalidStateError } from '@/Errors';
import { writable, derived, type Readable, type Subscriber, type Unsubscriber, type Writable } from 'svelte/store';
import { authAPI } from '@/API/Auth';

export abstract class BaseSetting<T> implements Writable<T> {
  readonly kind: string;
  readonly label: string;
  readonly desc?: string;
  readonly hint?: string;
  protected readonly store: Writable<T>;
  private _id: string;

  constructor(args: { kind: string; label: string; defaultValue: T; desc?: string; hint?: string; }) {
    this.kind = args.kind;
    this.label = args.label;
    this.desc = args.desc;
    this.hint = args.hint;
    this.store = writable(args.defaultValue);
    this._id = "NOT_CALCULATED";

    this.subscribe = this.store.subscribe;
  }

  setPath(path: string): void {
    this._id = path;
  }

  get id(): string | undefined {
    return this._id;
  }

  subscribe: (this: void, run: Subscriber<T>, invalidate?: () => void) => Unsubscriber;

  set = (value: T): void => {
    this.store.set(value);
    if (this._id) {
      void this.persistToUser(this._id, value);
    } else {
      Err.throw(new InvalidStateError("Attempted to write setting value before it was assigned an id"));
    }
  };

  update = (updater: (value: T) => T): void => {
    this.store.update((prev) => {
      const next = updater(prev);
      if (this._id) {
        void this.persistToUser(this._id, next as unknown);
      } else {
        Err.throw(new InvalidStateError("Attempted to write setting value before it was assigned an id"));
      }
      return next;
    });
  };

  // Internal use only: set value without triggering persistence (for initialization)
  setSilently(value: T): void {
    this.store.set(value);
  }

  private async persistToUser(key: string, value: any): Promise<void> {
    try {
      const userResult = await authAPI.getUser();
      if (userResult.isErr()) {
        console.warn('Cannot persist setting: no user available');
        return;
      }

      const user = userResult.value;
      const settings = user.setting_overrides ?? {} as any;
      settings[key] = value;

      // Update user with new settings (this handles both local IDB and remote sync)
      await authAPI.updateUser({ update: { id: user.id, setting_overrides: settings } });
    } catch (e) {
      console.warn('Failed to persist setting', e);
    }
  }
}

export class BoolSetting extends BaseSetting<boolean> {
  constructor(args: { label: string; defaultValue: boolean; desc?: string; hint?: string; }) {
    super({ ...args, kind: 'bool' });
  }
}

export class StringSetting extends BaseSetting<string> {
  constructor(args: { label: string; defaultValue: string; desc?: string; hint?: string; }) {
    super({ ...args, kind: 'string' });
  }
}

export class NumberSetting extends BaseSetting<number> {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  constructor(args: { label: string; defaultValue: number; min?: number; max?: number; step?: number; desc?: string; hint?: string; }) {
    super({ ...args, kind: 'number' });
    this.min = args.min;
    this.max = args.max;
    this.step = args.step;
  }
}

export class EnumSetting<T extends string> extends BaseSetting<T> {
  readonly options: readonly T[];
  constructor(args: { label: string; defaultValue: T; options: readonly T[]; desc?: string; hint?: string; }) {
    super({ ...args, kind: 'enum' });
    this.options = args.options;
  }
}

export class DictSetting extends BaseSetting<Record<string, string>> {
  readonly keyLabel?: string;
  constructor(args: { label: string; defaultValue?: Record<string, string>; keyLabel?: string; description?: string; hint?: string; }) {
    super({ kind: 'dict', label: args.label, defaultValue: args.defaultValue ?? {}, desc: args.description, hint: args.hint });
    this.keyLabel = args.keyLabel;
  }

  // Map-like helpers while keeping store value as plain object
  has(key: string): Readable<boolean> {
    return derived(this, (obj) => Object.prototype.hasOwnProperty.call(obj, key));
  }

  get(key: string): Readable<string | undefined> {
    return derived(this, (obj) => obj[key]);
  }

  /* 	keys(): Readable<string[]> {
      return derived(this, (obj) => Object.keys(obj));
    }
	
    values(): Readable<string[]> {
      return derived(this, (obj) => Object.values(obj));
    }
	
    entries(): Readable<[string, string][]> {
      return derived(this, (obj) => Object.entries(obj));
    }
	
    size(): Readable<number> {
      return derived(this, (obj) => Object.keys(obj).length);
    } */

  asMap(): Readable<Map<string, string>> { return derived(this, obj => new Map(Object.entries(obj))) }
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


