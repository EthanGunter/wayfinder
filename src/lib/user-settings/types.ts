import { Err, InvalidStateError } from '$domain/errors';
import { writable, derived, get, type Readable, type Subscriber, type Unsubscriber, type Writable } from 'svelte/store';
import { dbPromise, APP_TABLE_NAME } from '$lib/API/localDB';
import type { SvelteComponent } from 'svelte';
import type { UserFeature } from '$domain/models/user';
import { authAPI, authState } from '$lib/API/Auth';

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
  protected readonly store: Writable<T>;
  private _id: string;

  constructor(args: BaseSettingArgs<T>) {
    this.label = args.label;
    this.desc = args.desc;
    this.hint = args.hint;
    this.store = writable(args.defaultValue);
    this._id = "NOT_CALCULATED";
    this.onChange = args.onChange;

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
      // Get current auth state from store
      const state = get(authState);
      if (state.status !== 'signed-in')
        Err.throw(new InvalidStateError('Cannot persist setting: user not signed in'));

      const user = state.user;

      // Get existing settings or initialize empty object
      const settingOverrides = structuredClone(user.settingOverrides ?? {});

      // Parse path and set nested value (e.g., "dev/$enabled" -> { dev: { $enabled: true } })
      const pathParts = key.split('/');
      let current = settingOverrides;

      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        if (!current[part] || typeof current[part] !== 'object') {
          current[part] = {};
        }
        current = current[part];
      }

      // Set the final value
      const lastPart = pathParts[pathParts.length - 1];
      current[lastPart] = value;

      // Update user with new settings (this handles both local IDB and remote sync)
      const [, updateError] = await authAPI.updateUser({
        update: {
          id: user.id,
          settingOverrides
        }
      });

      if (updateError) {
        console.error('Failed to persist setting to server:', updateError);
      }
    } catch (e) {
      console.warn('Failed to persist setting', e);
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

  private constructor(
    args: BaseSettingArgs<T> & { options: { value: T; label: string }[] }
  ) {
    const { options, ...rest } = args;
    super({ ...rest, defaultValue: args.defaultValue });
    this.options = options;
  }

  // Factory for array of values
  static fromValues<const V extends string | number>(
    args: Omit<BaseSettingArgs<V>, 'defaultValue'> & {
      defaultValue: NoInfer<V>;
      options: readonly V[];
    }
  ): EnumSetting<V> {
    return new EnumSetting({
      ...args,
      options: args.options.map((v) => ({ value: v, label: String(v) })),
    });
  }

  // Factory for TS enum
  static fromEnum<E extends Record<string, string | number>>(
    args: Omit<BaseSettingArgs<E[keyof E]>, 'defaultValue'> & {
      defaultValue: E[keyof E];
      options: E;
    }
  ): EnumSetting<E[keyof E]> {
    const { options, ...rest } = args;
    const vals = Object.values(options);
    const hasNumber = vals.some((v) => typeof v === 'number');

    const mapped = hasNumber
      ? (Object.entries(options).filter(([, v]) => typeof v === 'number') as [string, number][])
        .map(([k, v]) => ({ value: v as E[keyof E], label: k }))
      : (Object.entries(options).filter(([, v]) => typeof v === 'string') as [string, string][])
        .map(([k, v]) => ({ value: v as E[keyof E], label: k }));

    return new EnumSetting({ ...rest, options: mapped });
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
export type SettingsSection = {
  $label: string;
  $userFeature?: UserFeature;
  $enabled?: BoolSetting;
} & {
  [key: string]: AnySetting | BoolSetting | string | UserFeature;
};

export type SettingsTab = {
  $label: string;
  $userFeature?: UserFeature;
  $enabled?: BoolSetting;
} & {
  [key: string]: SettingsSection | BoolSetting | string | UserFeature;
};

export type SettingsTree = Record<string, SettingsTab>;

function isSection(val: unknown): val is SettingsSection {
  return typeof val === 'object' && val !== null && '$label' in (val as Record<string, unknown>);
}

function isSetting(val: unknown): val is AnySetting {
  return typeof val === 'object' && val !== null && 'setPath' in (val as Record<string, unknown>);
}

export function assignPaths(tree: SettingsTree): void {
  for (const [tabId, tab] of Object.entries(tree)) {
    // Handle tab-level $enabled
    if (tab.$enabled) {
      tab.$enabled.setPath(`${tabId}/$enabled`);
    }

    for (const [sectionId, section] of Object.entries(tab)) {
      if (sectionId === '$label' || sectionId === '$userFeature' || sectionId === '$enabled') continue;
      if (!isSection(section)) continue;

      // Handle section-level $enabled
      if (section.$enabled) {
        section.$enabled.setPath(`${tabId}/${sectionId}/$enabled`);
      }

      for (const [itemId, setting] of Object.entries(section)) {
        if (itemId === '$label' || itemId === '$userFeature' || itemId === '$enabled') continue;
        if (!isSetting(setting)) continue;
        setting.setPath(`${tabId}/${sectionId}/${itemId}`);
      }
    }
  }
}
