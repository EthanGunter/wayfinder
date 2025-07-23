<!-- SvelteKit root layout for PWA -->

<script lang="ts">
	// Import global styles
	import '$lib/_global-styles.scss';
	import '$lib/resets.scss';

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
		height: 100vh;
		// overflow: hidden;
	}

	:global(.page) {
		// Layout
		position: relative;
		// gap: var(--gap-small);
		width: 100%;
		height: 100%;

		// Style
		background-color: var(--c-bg_-2);

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

		:global(.content) {
			grid-area: content;

			display: flex;
			flex-direction: column;

			width: 100%;
			min-width: 20rem;
			max-width: 35rem;
			margin-left: auto;
			margin-right: auto;
			padding: 1rem;

			// justify-content: center;
			align-items: center;
			overflow-y: scroll;
			gap: 1rem;
			// overflow-x: hidden;
		}

		> :global(.app-footer) {
			// Layout
			height: var(--app-footer-height);
			grid-area: footer;
			z-index: 10;
		}
	}
</style>
