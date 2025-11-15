<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = { header: Snippet; content: Snippet; class?: string };

	const { header, content, class: className }: Props = $props();

	let scroller: HTMLDivElement | null = null;
	let sentinel: HTMLDivElement | null = null;

	// reactive state
	let atTop = $state(true); // true when scrollTop === 0
	let shadowStrength = $state(0); // 0..1

	const maxShadowAt = 200; // px at which shadow saturates
	const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

	function handleScroll(e: Event) {
		const el = e.currentTarget as HTMLDivElement;
		const y = el.scrollTop;
		atTop = y <= 0;
		// smooth non-linear curve for nicer feel (sqrt). Tweak as you like.
		const t = clamp01(y / maxShadowAt);
		shadowStrength = Math.sqrt(t);
		// write CSS var directly for cheap paint
		el.style.setProperty('--shadow-strength', shadowStrength.toString());
	}

	// Set up IO to detect "top reached" even if content changes programmatically
	function setupIO(node: Element) {
		const io = new IntersectionObserver(
			(entries) => {
				// We consider atTop when sentinel is intersecting (visible)
				atTop = entries[0]?.isIntersecting ?? true;
				// When we snap back to top, also zero the shadow variable if scroller exists
				if (atTop && scroller) {
					scroller.style.setProperty('--shadow-strength', '0');
					shadowStrength = 0;
				}
			},
			{
				root: scroller,
				rootMargin: '0px 0px 0px 0px',
				threshold: 1.0 // require fully visible 1px bar to consider "top"
			}
		);
		io.observe(node);
		return {
			destroy: () => io.disconnect()
		};
	}
</script>

<!-- TODO:bug this solution blocks contect from properly becoming 100% height
 becase the sticky header is taken out of the flow when height is calculated.
 This results in the content thinking it needs to be taller than it is,
 pushing it off the bottom of the container. -->
<div
	bind:this={scroller}
	class="relative grow overflow-auto overscroll-contain {className}"
	onscroll={handleScroll}
	style="--shadow-strength: 0"
>
	<!-- Sticky header -->
	<div
		class="sticky top-0 z-10 bg-white backdrop-blur supports-[backdrop-filter]:bg-white/70"
		style="
		box-shadow: 0 0 calc(5px * var(--shadow-strength, 0)) rgba(0,0,0,.5),
					0 0 calc(18px * var(--shadow-strength, 0)) rgba(0,0,0,.2);
	  "
	>
		{@render header()}
	</div>

	<!-- Scrollable content -->

	<!-- Sentinel: a 1px strip at the very top inside the scroll root -->
	<div bind:this={sentinel} use:setupIO class="pointer-events-none h-px w-full"></div>
	{@render content()}
</div>
