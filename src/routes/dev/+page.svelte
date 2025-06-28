<script lang="ts">
	import Tooltip from '$lib/components/Tooltip.svelte';
	import BubbleText from '$lib/components/BubbleText.svelte';
</script>

<div class="examples">
	<h2>Tooltip Examples</h2>

	<section>
		<h3>1. Basic Tooltip</h3>
		<Tooltip content="This is a helpful tooltip!" position="top">
			<button>Hover me</button>
		</Tooltip>
	</section>

	<section>
		<h3>2. Different Positions</h3>
		<div class="position-grid">
			<Tooltip content="Top tooltip" position="top">
				<button>Top</button>
			</Tooltip>
			
			<Tooltip content="Right tooltip" position="right">
				<button>Right</button>
			</Tooltip>
			
			<Tooltip content="Bottom tooltip" position="bottom">
				<button>Bottom</button>
			</Tooltip>
			
			<Tooltip content="Left tooltip" position="left">
				<button>Left</button>
			</Tooltip>
		</div>
	</section>

	<section>
		<h3>3. BubbleText with Error Tooltip</h3>
		<div class="bubble-examples">
			<BubbleText id="normal" onDelete={(id) => console.log('Delete:', id)}>
				Normal Tag
			</BubbleText>
			
			<BubbleText 
				id="error" 
				error={{ msg: "This tag has an error that needs attention!" }}
				onDelete={(id) => console.log('Delete:', id)}
			>
				Error Tag
			</BubbleText>
		</div>
	</section>

	<section>
		<h3>4. Complex Content</h3>
		<Tooltip content="This tooltip has a longer message that will wrap to multiple lines when it gets too long" position="bottom">
			<div class="complex-trigger">
				<span>📊</span>
				<span>Complex Element</span>
			</div>
		</Tooltip>
	</section>

	<section>
		<h3>5. Delayed Tooltip</h3>
		<Tooltip content="This tooltip appears after a delay" position="top" delay={500}>
			<button>Hover and wait</button>
		</Tooltip>
	</section>
</div>

<style lang="scss">
	.examples {
		max-width: 600px;
		margin: 2rem auto;
		padding: 2rem;
		
		section {
			margin-bottom: 3rem;
			
			h3 {
				margin-bottom: 1rem;
				color: var(--c-text);
			}
		}
	}

	.position-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 2rem;
		justify-items: center;
		padding: 2rem;
	}

	.bubble-examples {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.complex-trigger {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: var(--c-bg_1);
		border: 1px solid var(--c-border);
		border-radius: var(--interactible-border-radius);
		cursor: pointer;
		
		&:hover {
			background: var(--c-bg);
		}
	}

	button {
		padding: 0.5rem 1rem;
		background: var(--c-primary);
		color: var(--c-bg_2);
		border: none;
		border-radius: var(--interactible-border-radius);
		cursor: pointer;
		
		&:hover {
			background: var(--c-primary_-1);
		}
	}
</style>