import {
	BoolSetting,
	EnumSetting,
	assignPaths,
	type SettingsTree,
} from './types';
import { KeybindSetting } from './keybind';
import { dev as devEnv } from '$app/environment';

export const settings = {
	projects: {
		$label: "Projects",
		defaults: {
			$label: "New-Project Defaults",
			defaultProjectShowStreak: new BoolSetting({
				label: "Show streak",
				desc: "Default value for streak tracking on new projects",
				defaultValue: false,
			}),
			defaultProjectShowVelocity: new BoolSetting({
				label: "Show velocity",
				desc: "Default value for completion velocity on new projects",
				defaultValue: false,
			}),
			defaultProjectShowMomentumScore: new BoolSetting({
				label: "Show momentum score",
				desc: "Default value for momentum indicator on new projects",
				defaultValue: true,
			}),
			defaultProjectShowNextAction: new BoolSetting({
				label: "Show next action",
				desc: "Default value for displaying first incomplete task on new projects",
				defaultValue: true,
			}),
			defaultProjectShowMicroWins: new BoolSetting({
				label: "Show micro wins",
				desc: "Default value for weekly completions + celebration on new projects",
				defaultValue: false,
			}),
		},
		sorting: {
			$label: "Sorting",
			defaultProjectSort: EnumSetting.fromValues({
				label: "Default sort method",
				desc: "How projects should be sorted by default",
				defaultValue: "title",
				options: ["momentum", "velocity", "activity", "title", "dueDate", "created"],
			}),
		},
	},
	graph: {
		$label: "Project Graph",
		core: {
			$label: "Visibility",
			showCompleted: new BoolSetting({
				label: "Show completed",
				desc: "Should completed tasks be shown in the graph",
				defaultValue: true,
			}),
		},
		layout: {
			$label: "Layout",
			algorithm: EnumSetting.fromValues({
				label: "Algorithm",
				desc: "Which algorithm should be used to layout the graph?",
				defaultValue: "Layered",
				options: ["Layered", "Stress"],
			}),
			autoLayout: new BoolSetting({
				label: "Auto layout",
				desc: "Should the graph layout automatically update when tasks are added or completed?",
				defaultValue: true,
			}),
		},
		keybinds: {
			$label: "Keybinds",
			fitView: new KeybindSetting({
				label: "Fit view",
				desc: "Fit all nodes in view",
				defaultValue: { primary: false, shift: false, alt: false, key: 'F' },
			}),
			search: new KeybindSetting({ // TODO: This is likely a bad category for a keybing that will likely be used in multiple contexts
				label: "Search",
				desc: "Search for a task",
				defaultValue: { primary: true, shift: false, alt: false, key: 'F' },
			}),
		}
	},
	dev: {
		$label: "Dev",
		$userFeature: "dev",
		// $enabled: new BoolSetting({
		// 	label: "Enabled",
		// 	desc: "Should dev settings have an effect on anything?",
		// 	defaultValue: dev,
		// }),
		core: {
			$label: "Global", enabled: new BoolSetting({
				label: "Enabled",
				desc: "Should dev settings have an effect on anything?",
				defaultValue: devEnv,
			})
		},
	},
} satisfies SettingsTree;

export type AppSettings = Partial<typeof settings>;
assignPaths(settings);