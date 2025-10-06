import {
	BoolSetting,
	StringSetting,
	EnumSetting,
	NumberSetting,
	assignPaths,
	type SettingsTree,
	RangeSetting
} from './types';
import TestHint from './TestHint.svelte';

enum test {
	a, b, c, d
}
enum test2 {
	a2 = "a2!", b2 = "b2!", c2 = "c2!", d2 = "d2!"
}
export const settings = {
	dev: {
		$label: 'Dev',

		overrides: {
			$label: 'Overrides',
			/* 			supabaseAuthUrl: new StringSetting({
							label: 'Supabase Auth URL',
							placeholder: import.meta.env?.VITE_SUPABASE_URL,
							hint: 'Restart is required for overrides to take effect',
							manualSave: true,
							scope: "device"
						}),
						supabaseAuthKey: new StringSetting({
							label: 'Supabase Auth API Key',
							placeholder: import.meta.env?.VITE_SUPABASE_API_KEY,
							desc: "Use the service role API key or you will encounter RLS issues",
							hint: 'Restart is required for overrides to take effect',
							manualSave: true,
							scope: "device"
						}),
						supabaseTaskUrl: new StringSetting({
							label: 'Supabase Tasks URL',
							placeholder: import.meta.env?.VITE_SUPABASE_URL,
							hint: 'Restart is required for overrides to take effect',
							manualSave: true,
						}),
						supabaseTaskKey: new StringSetting({
							label: 'Supabase Tasks API Key',
							placeholder: import.meta.env?.VITE_SUPABASE_API_KEY,
							desc: "Use the service role API key or you will encounter RLS issues",
							hint: 'Restart is required for overrides to take effect',
							manualSave: true,
						}), */
		},

		test: {
			$label: "TEST FIELDS",
			string: new StringSetting({
				label: "String",
				desc: "A string editor",
				hint: "A helpful hint",
				placeholder: "No value provided",
				defaultValue: "Default",
			}),
			boolean: new BoolSetting({
				label: "boolean",
				desc: "A boolean editor",
				hint: "A helpful hint",
				defaultValue: false
			}),
			enum: new EnumSetting<test>({
				label: "enum",
				desc: "An enum editor",
				hint: TestHint,
				options: test,
				defaultValue: test.a,
			}),
			enum2: new EnumSetting<test2>({
				label: "enum",
				desc: "An enum editor",
				hint: TestHint,
				options: test2,
				defaultValue: test2.a2,
			}),
			int: new NumberSetting({
				label: "int",
				desc: "An int editor",
				hint: "A helpful hint",
				defaultValue: 0,
				step: 1,
				max: 100
			}),
			float: new NumberSetting({
				label: "float",
				desc: "A float editor",
				hint: "A helpful hint",
				defaultValue: 0,
				min: -1,
				max: 1
			}),
			range: new RangeSetting({
				label: "range",
				desc: "A float editor",
				hint: "A helpful hint",
				defaultValue: [0, 1],
				min: -1,
				max: 2,
			})
		}

	},
} satisfies SettingsTree;

export type AppSettings = typeof settings;

assignPaths(settings);