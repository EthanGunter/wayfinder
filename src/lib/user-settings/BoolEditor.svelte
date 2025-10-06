<script lang="ts">
	import { Switch } from '$lib/components/ui/switch';
	import type { BoolSetting } from './types';

	interface Props {
		store: BoolSetting;
	}

	const { store }: Props = $props();
</script>

<Switch bind:checked={$store} />
