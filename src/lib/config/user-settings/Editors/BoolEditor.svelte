<script lang="ts">
	import { Switch } from '$lib/components/ui/switch';
	import type { BoolSetting } from '../types';

	interface Props {
		store: BoolSetting;
	}

	const { store }: Props = $props();
</script>

<div style="grid-area: actions" class="justify-self-center self-center min-w-0">
	<Switch bind:checked={$store} />
</div>
