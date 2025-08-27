<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { observeRect, queryOrWait, bringToViewIfNeeded } from '../dom';

	let {
		selector,
		active = $bindable(true),
		backdropOpacity = 0.5
	}: {
		selector: string;
		active?: boolean;
		backdropOpacity?: number;
	} = $props();

	let target = $state<Element | null>(null);
	let rect = $state<DOMRect | null>(null);
	let unsub: { disconnect(): void } | null = null;

	function styleVars(): string {
		if (!rect) return 'display:none;';
		return `--x:${rect.x - 5}px; --y:${rect.y - 5}px; --w:${rect.width + 10}px; --h:${rect.height + 10}px; --alpha:${backdropOpacity};`;
	}

	onMount(async () => {
		target = await queryOrWait(selector);
		if (!target) {
			active = false;
			return;
		}
		bringToViewIfNeeded(target);
		unsub = observeRect(target, (r) => (rect = r));
	});

	onDestroy(() => {
		unsub?.disconnect();
	});
</script>

{#if active && rect}
	<div class="tgate-root" style={styleVars()} aria-hidden="true">
		<div class="tgate-top"></div>
		<div class="tgate-left"></div>
		<div class="tgate-right"></div>
		<div class="tgate-bottom"></div>
	</div>
{/if}

<style>
	.tgate-root {
		position: fixed;
		inset: 0;
		pointer-events: none;
		z-index: 10000;
	}
	.tgate-top,
	.tgate-bottom,
	.tgate-left,
	.tgate-right {
		position: fixed;
		background: rgba(0, 0, 0, var(--alpha));
		pointer-events: auto;
	}
	.tgate-top {
		left: 0;
		right: 0;
		top: 0;
		height: var(--y);
	}
	.tgate-bottom {
		left: 0;
		right: 0;
		top: calc(var(--y) + var(--h));
		bottom: 0;
	}
	.tgate-left {
		top: var(--y);
		height: var(--h);
		left: 0;
		width: var(--x);
	}
	.tgate-right {
		top: var(--y);
		height: var(--h);
		left: calc(var(--x) + var(--w));
		right: 0;
	}
</style>
