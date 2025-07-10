<!-- SvelteKit root layout for PWA -->

<script lang="ts">
	// Import global styles
	import '$lib/_global-styles.scss';
	import '$lib/resets.scss';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import AppHeader from '$lib/components/AppHeader.svelte';

	const { children } = $props();

	//TODO Implement handlers for Browser/Android back buttons,
	// as well as state change handlers for when the app gets focused/goes into the backgroud
</script>

<div class="app-layout">
	{@render children?.()}
</div>

<style lang="scss">
	.app-layout {
		// Layout
		position: absolute;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100%;
		// overflow: hidden;

		// Internal layout
		display: grid;
		grid-template-rows: auto 1fr auto;
		grid-template-areas: 'header' 'content' 'footer';

		> :global(.app-header) {
			// Layout
			grid-area: header;
			height: var(--app-header-height);
			z-index: 10;
		}

		> :global(.app-footer) {
			// Layout
			height: var(--app-footer-height);
			grid-area: footer;
			z-index: 10;
		}
	}

	:global(.page) {
		// Layout
		position: relative;
		grid-area: content;
		display: flex;
		flex-direction: column;
		// gap: var(--gap-small);
		overflow-y: scroll;
		// overflow-x: hidden;
		max-width: 100vw;

		// Style
		background-color: var(--c-bg_-2);
	}
</style>
