<script lang="ts">
	import Tooltip from '$lib/components/overlays/TooltipHover.svelte';
	import BubbleText from '$lib/components/BubbleText.svelte';
	import Modal from '$lib/components/overlays/Modal.svelte';
	import Pullout from '$lib/components/overlays/Pullout.svelte';
	import OverlayElement from '$lib/components/overlays/OverlayElement.svelte';
	import ItemList from '$lib/components/ItemList.svelte';
	import {
		draggable,
		droppable,
		dragGroup,
		type DragStartEvent,
		type DropEvent
	} from '$lib/actions/dnd';
	import { Button } from '@/components/ui/button';

	let showOverlays = $state(false);

	let showModal = $state(false);
	let showOverlay = $state(false);
	let openPullout = $state(false);
</script>

<div class="examples">
	<div>
		<Button onclick={() => (showOverlays = !showOverlays)}>
			{showOverlays ? '✔️' : '❌'}Overlays
		</Button>
	</div>
	{#if showOverlays}
		<Button
			onclick={() => {
				showOverlay = true;
			}}
		>
			open overlay
		</Button>
		<OverlayElement dismissable={true} bind:open={showOverlay}>
			This is the simplest form of overlay!
		</OverlayElement>
		<Modal title="Test Modal" bind:open={showModal}>Yep, this is a modal.</Modal>
		<Button onclick={() => (openPullout = true)}>Open pullout</Button>
		<Pullout bind:open={openPullout} placement="left">
			<h1>Hello! I'm a pullout</h1>
		</Pullout>

		<h2>Tooltip Examples</h2>

		<section>
			<h3>1. Basic Tooltip</h3>
			<Button id="basic-btn" onclick={() => (showModal = true)}>Hover me</Button>
			<Tooltip forElement="#basic-btn" position="mouse">This is a helpful tooltip!</Tooltip>
		</section>

		<section>
			<h3>2. Different Positions</h3>
			<div class="position-grid">
				<Button id="top">Top</Button>
				<Tooltip forElement="#top" position="top" followMouse>Top tooltip</Tooltip>

				<Button id="right">Right</Button>
				<Tooltip forElement="#right" position="right" followMouse>Right tooltip</Tooltip>

				<Button id="bottom">Bottom</Button>
				<Tooltip forElement="#bottom" position="bottom" followMouse>Bottom tooltip</Tooltip>

				<Button id="left">Left</Button>
				<Tooltip forElement="#left" position="left" followMouse>Left tooltip</Tooltip>
			</div>
		</section>

		<section>
			<h3>3. BubbleText with Error Tooltip</h3>
			<div class="bubble-examples">
				<BubbleText id="normal" onDelete={(id) => console.log('Delete:', id)}>Normal Tag</BubbleText
				>

				<BubbleText
					id="error"
					error={{ msg: 'This tag has an error that needs attention!' }}
					onDelete={(id) => console.log('Delete:', id)}
				>
					Error Tag
				</BubbleText>
			</div>
		</section>

		<section>
			<h3>4. Complex Content</h3>
			<div class="complex-trigger">
				<span>📊</span>
				<span>Complex Element</span>
			</div>
			<Tooltip forElement=".complex-trigger" position="bottom">Not so complex tooltip</Tooltip>
		</section>

		<section>
			<h3>5. Delayed Tooltip</h3>
			<Button id="wait">Hover and wait</Button>
			<Tooltip forElement="#wait" position="top" delay={500}
				>This tooltip appears after a delay</Tooltip
			>
		</section>

		<section>
			<h3>6. Advanced Tooltip with Named Slots</h3>
			<div class="advanced-examples">
				<Button class="fancy-button">
					<span class="icon">✨</span>
					<span>Fancy Button</span>
				</Button>

				<Tooltip forElement=".fancy-button" position="top">
					<div class="rich-tooltip">
						<h4>Rich Content</h4>
						<p>This tooltip can contain <strong>HTML</strong> content!</p>
						<ul>
							<li>✅ Lists</li>
							<li>🎨 Styling</li>
							<li>📊 Any content</li>
						</ul>
					</div>
				</Tooltip>

				<div class="card">
					<div class="card-icon">📈</div>
					<div class="card-content">
						<h4>Data Card</h4>
						<p>Hover for details</p>
					</div>
				</div>

				<Tooltip forElement=".card" position="right" delay={300}>
					<div class="data-tooltip">
						<div class="metric">
							<span class="label">Revenue:</span>
							<span class="value">$12,345</span>
						</div>
						<div class="metric">
							<span class="label">Growth:</span>
							<span class="value positive">+15.3%</span>
						</div>
						<div class="metric">
							<span class="label">Users:</span>
							<span class="value">1,234</span>
						</div>
					</div>
				</Tooltip>

				<img
					id="img"
					src="https://via.placeholder.com/100x100/4f46e5/ffffff?text=IMG"
					alt="Sample"
					class="sample-image"
				/>

				<Tooltip forElement="#img" position="bottom">
					<div class="image-tooltip">
						<h4>Image Details</h4>
						<div class="details">
							<div><strong>Size:</strong> 100x100px</div>
							<div><strong>Format:</strong> PNG</div>
							<div><strong>Created:</strong> Today</div>
						</div>
					</div>
				</Tooltip>
			</div>
		</section>
	{/if}
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
		color: var(--c-bg);
		border: none;
		border-radius: var(--interactible-border-radius);
		cursor: pointer;

		&:hover {
			background: var(--c-primary_-1);
		}
	}

	.advanced-examples {
		display: flex;
		gap: 2rem;
		flex-wrap: wrap;
		align-items: flex-start;
	}

	.fancy-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		background: linear-gradient(135deg, var(--c-primary), var(--c-primary_-1));
		color: var(--c-bg);
		border: none;
		border-radius: var(--interactible-border-radius);
		cursor: pointer;
		font-weight: 500;
		transition: all 0.2s ease;

		.icon {
			font-size: 1.1em;
		}

		&:hover {
			transform: translateY(-1px);
			box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		}
	}

	.card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: var(--c-bg_1);
		border: 1px solid var(--c-border);
		border-radius: var(--interactible-border-radius);
		cursor: pointer;
		transition: all 0.2s ease;
		min-width: 200px;

		&:hover {
			background: var(--c-bg);
			border-color: var(--c-primary);
		}

		.card-icon {
			font-size: 2rem;
		}

		.card-content {
			h4 {
				margin: 0 0 0.25rem 0;
				color: var(--c-text);
			}

			p {
				margin: 0;
				color: var(--c-text_-1);
				font-size: 0.9rem;
			}
		}
	}

	.sample-image {
		border-radius: var(--interactible-border-radius);
		cursor: pointer;
		transition: transform 0.2s ease;

		&:hover {
			transform: scale(1.05);
		}
	}

	/* Tooltip content styles */
	:global(.rich-tooltip) {
		h4 {
			margin: 0 0 0.5rem 0;
			color: var(--c-bg);
			font-size: 1rem;
		}

		p {
			margin: 0 0 0.5rem 0;
			line-height: 1.4;
		}

		ul {
			margin: 0;
			padding-left: 1rem;

			li {
				margin: 0.25rem 0;
			}
		}
	}

	:global(.data-tooltip) {
		.metric {
			display: flex;
			justify-content: space-between;
			align-items: center;
			margin: 0.5rem 0;
			min-width: 150px;

			&:first-child {
				margin-top: 0;
			}

			&:last-child {
				margin-bottom: 0;
			}

			.label {
				font-weight: 500;
			}

			.value {
				font-weight: 600;

				&.positive {
					color: #10b981;
				}
			}
		}
	}

	:global(.image-tooltip) {
		h4 {
			margin: 0 0 0.5rem 0;
			color: var(--c-bg);
		}

		.details {
			div {
				margin: 0.25rem 0;
				font-size: 0.9rem;
			}
		}
	}
</style>
