import { Err, InvalidStateError } from '@/Errors';
import { writable, derived, type Readable, type Subscriber, type Unsubscriber, type Writable } from 'svelte/store';
import { dbPromise, APP_TABLE_NAME } from '@/API/localDB';
import type { SvelteComponent } from 'svelte';
import type { UserFeature } from '@/API/Auth/User';

export type SettingScope = 'user' | 'device';

interface BaseSettingArgs<T> {
  label: string;
  defaultValue: T;
  desc?: string;
  hint?: string | (new (...args: any) => SvelteComponent);
  scope?: SettingScope;
  onChange?: (oldVal: T, newVal: T) => void;
}

export abstract class BaseSetting<T> implements Writable<T> {
  readonly label: string;
  readonly desc?: string;
  readonly hint?: string | (new (...args: any) => SvelteComponent);
  readonly onChange?: (oldVal: T, newVal: T) => void;
  readonly scope: SettingScope;
  protected readonly store: Writable<T>;
  private _id: string;

  constructor(args: BaseSettingArgs<T>) {
    this.label = args.label;
    this.desc = args.desc;
    this.hint = args.hint;
    this.scope = args.scope ?? 'user';
    this.store = writable(args.defaultValue);
    this._id = "NOT_CALCULATED";
    this.onChange = this.onChange;

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
      if (this.scope === 'device') {
        void this.persistToDevice(this._id, value as unknown as any);
      } else {
        void this.persistToUser(this._id, value);
      }
    } else {
      Err.throw(new InvalidStateError("Attempted to write setting value before it was assigned an id"));
    }
  };

  update = (updater: (value: T) => T): void => {
    this.store.update((prev) => {
      const next = updater(prev);
      if (this._id) {
        if (this.scope === 'device') {
          void this.persistToDevice(this._id, next as unknown as any);
        } else {
          void this.persistToUser(this._id, next as unknown);
        }
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
      const { authAPI } = await import('@/API/Auth');
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

  private async persistToDevice(key: string, value: any): Promise<void> {
    try {
      const db = await dbPromise;
      // Store JSON string to allow arbitrary types; parse on load
      const serialized = JSON.stringify(value);
      await db.put(APP_TABLE_NAME, serialized, `settings:${key}`);
    } catch (e) {
      console.warn('Failed to persist device setting', e);
    }
  }
}

export class BoolSetting extends BaseSetting<boolean> {
  constructor(args: BaseSettingArgs<boolean>) {
    super(args);
  }
}

export class StringSetting extends BaseSetting<string> {
  readonly placeholder?: string;
  readonly manualSave: boolean;
  errorMessage?: string
  constructor(args: Omit<BaseSettingArgs<string>, "defaultValue"> & { manualSave?: boolean; placeholder?: string; defaultValue?: string }) {
    super({ ...args, defaultValue: args.defaultValue ?? "" });
    this.placeholder = args.placeholder ?? args.label;
    this.manualSave = args.manualSave ?? false;
  }
}

export class NumberSetting extends BaseSetting<number> {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  constructor(args: BaseSettingArgs<number> & { min?: number; max?: number; step?: number; }) {
    super({ ...args });
    this.min = args.min;
    this.max = args.max;
    this.step = args.step;
  }
}

export class RangeSetting extends BaseSetting<[number, number]> {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  constructor(args: BaseSettingArgs<[number, number]> & { min?: number; max?: number; step?: number; }) {
    super({ ...args });
    this.min = args.min;
    this.max = args.max;
    this.step = args.step;
  }
}

export class EnumSetting<T extends string | number> extends BaseSetting<T> {
  readonly options: { value: T; label: string }[];

  constructor(args: BaseSettingArgs<T> & { options?: readonly T[] | Record<string, string | number>; }) {
    const { options, ...rest } = args;

    super({ ...rest, defaultValue: args.defaultValue });
    if (Array.isArray(options)) {
      this.options = (options as readonly T[]).map((v) => ({ value: v as T, label: String(v) }));
    } else if (options && typeof options === 'object') {
      const vals = Object.values(options);
      const hasNumber = vals.some((v) => typeof v === 'number');
      if (hasNumber) {
        // numeric enum: keys are names, values are numbers; Object.values includes reverse map strings too
        const pairs = Object.entries(options).filter(([, v]) => typeof v === 'number') as [string, number][];
        this.options = pairs.map(([k, v]) => ({ value: v as T, label: k }));
      } else {
        // string enum: keys are names, values are strings
        const pairs = Object.entries(options).filter(([, v]) => typeof v === 'string') as [string, string][];
        this.options = pairs.map(([k, v]) => ({ value: v as T, label: k }));
      }
    } else {
      this.options = [] as const;
    }
  }
}

export class DictSetting extends BaseSetting<Record<string, string>> {
  readonly keyLabel?: string;
  constructor(args: BaseSettingArgs<Record<string, string>> & { keyLabel?: string; }) {
    super({ ...args, defaultValue: args.defaultValue ?? {} });
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

export type AnySetting = BoolSetting | StringSetting | NumberSetting | RangeSetting | EnumSetting<any> | DictSetting;

// New shape using $label and direct nesting: tab -> sections -> settings
export type SettingsSection = { $label: string; $userFeature?: UserFeature } & { [key: string]: AnySetting | string };
export type SettingsTab = { $label: string; $userFeature?: UserFeature } & { [key: string]: SettingsSection | string };
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
