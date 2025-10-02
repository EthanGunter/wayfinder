// settings/schema.ts
type BoolMeta = { kind: 'bool'; label: string; default: boolean; desc?: string; hint?: string };
type StrMeta = {
	kind: 'string';
	label: string;
	default: string;
	desc?: string;
	hint?: string;
	pattern?: RegExp;
};
type NumMeta = {
	kind: 'number';
	label: string;
	default: number;
	desc?: string;
	hint?: string;
	min?: number;
	max?: number;
	step?: number;
};
type EnumMeta<T extends string> = {
	kind: 'enum';
	label: string;
	default: T;
	options: readonly T[];
	desc?: string;
	hint?: string;
};
type NonDictMeta = BoolMeta | StrMeta | NumMeta | EnumMeta<string>;

type DictMeta<K extends string, VM extends NonDictMeta> = {
	kind: 'dict';
	label: string;
	default: object;
	keyLabel?: string;
	valueMeta: VM;
	desc?: string;
	hint?: string;
};

// Common extensions available to all items without changing existing specific meta types.
// These are intersected in ItemMeta via WithCommon<> to avoid duplication.
type CommonMeta = {
	scope?: 'user' | 'device' | 'env';
	subheading?: string;
	featureFlag?: string;
	permissions?: readonly string[];
	validate?: (value: unknown) => string | void;
	onChange?: (value: unknown) => void;
};

type WithCommon<T> = T & CommonMeta;

// Union of leaf item metadata with common extensions.
export type ItemMeta = WithCommon<BoolMeta | StrMeta | NumMeta | EnumMeta<string> | DictMeta<string, NonDictMeta>>;

// Map an ItemMeta to its value type
export type ItemValue<M> =
	M extends BoolMeta ? boolean :
	M extends StrMeta ? string :
	M extends NumMeta ? number :
	M extends EnumMeta<infer T> ? T :
	M extends DictMeta<infer K, infer VM> ? Record<K, ItemValue<VM>> :
	never;

// Schema shapes (Tabs -> Sections -> Items)
export type SectionSchema = {
	label: string;
	items: Record<string, ItemMeta>;
};

export type TabSchema = {
	label: string;
	sections: Record<string, SectionSchema>;
};

export type TabsSchema = Record<string, TabSchema>;

// Type helper to derive the nested settings object shape of Writable stores from a schema
import type { Writable } from 'svelte/store';

export type SettingsStoresFromSchema<S extends TabsSchema> = {
	[TabId in keyof S]: {
		[SectionId in keyof S[TabId]['sections']]: {
			[ItemId in keyof S[TabId]['sections'][SectionId]['items']]: Writable<
				ItemValue<S[TabId]['sections'][SectionId]['items'][ItemId]>
			>;
		};
	};
};

// UI model types (lightly typed to keep compile-time complexity low)
export type UIModelItem = {
	path: string; // "tab/section/item"
	meta: ItemMeta;
	store: Writable<unknown>;
};

export type UIModelSection = {
	sectionId: string;
	label: string;
	items: UIModelItem[];
};

export type UIModelTab = {
	tabId: string;
	label: string;
	sections: UIModelSection[];
};

export type UIModel = UIModelTab[];
