<script lang="ts">
	import { draggable, droppable, dragGroup } from "$lib/actions/dnd";
	import ItemList from "$lib/components/ItemList.svelte";

	let simpleList = $state(['Item 1', 'Item 2', 'Item 3', 'Item 4']);
	let todoItems = $state([
		{ id: 1, text: 'Buy groceries', done: false },
		{ id: 2, text: 'Walk the dog', done: false },
		{ id: 3, text: 'Read a book', done: true }
	]);
	let doneItems = $state([
		{ id: 4, text: 'Clean the house', done: true },
		{ id: 5, text: 'Pay bills', done: true }
	]);

	let kanbanTodo = $state(['Design mockups', 'Write documentation']);
	let kanbanInProgress = $state(['Implement feature', 'Code review']);
	let kanbanDone = $state(['Deploy to staging', 'User testing']);

	let dragEvents = $state<string[]>([]);
	let horizontalItems = $state(['Slide 1', 'Slide 2', 'Slide 3', 'Slide 4', 'Slide 5']);

	function logEvent(event: string) {
		dragEvents = [...dragEvents, `${new Date().toLocaleTimeString()}: ${event}`];
		if (dragEvents.length > 5) {
			dragEvents = dragEvents.slice(-5);
		}
	}
</script>

<h2>Drag and Drop Examples</h2>

<section>
	<h3>1. Simple Reorderable List</h3>
	<p>Basic drag and drop within a single list</p>
	<ItemList items={simpleList} onListOrderChanged={(items) => (simpleList = items)}>
		{#snippet listItem(item)}
			<li
				use:draggable={{
					type: 'simple-item',
					data: item,
					devDelay: 10000
				}}
				class="simple-item"
			>
				{item}
			</li>
		{/snippet}
	</ItemList>
</section>

<section>
	<h3>2. Multiple Lists with Type Restrictions</h3>
	<p>Drag items between lists - only "done" items can go to the done list</p>
	<div class="two-lists">
		<div>
			<h4>Todo</h4>
			<ItemList
				items={todoItems}
				accepts={['todo-item']}
				onListOrderChanged={(items) => (todoItems = items)}
			>
				{#snippet listItem(item)}
					<li
						use:draggable={{
							type: 'todo-item',
							data: item
						}}
						class="todo-item"
						class:done={item.done}
					>
						<input type="checkbox" bind:checked={item.done} />
						{item.text}
					</li>
				{/snippet}
			</ItemList>
		</div>
		<div>
			<h4>Done</h4>
			<ItemList
				items={doneItems}
				accepts={['todo-item']}
				onListOrderChanged={(items) => {
					// Only accept items that are marked as done
					doneItems = items.filter((item) => item.done);
					// Return unchecked items to todo list
					const unchecked = items.filter((item) => !item.done);
					if (unchecked.length > 0) {
						todoItems = [...todoItems, ...unchecked];
					}
				}}
			>
				{#snippet listItem(item)}
					<li
						use:draggable={{
							type: 'todo-item',
							data: item
						}}
						class="todo-item done"
					>
						<input type="checkbox" bind:checked={item.done} />
						{item.text}
					</li>
				{/snippet}
			</ItemList>
		</div>
	</div>
</section>

<section>
	<h3>3. Kanban Board</h3>
	<p>Multiple columns with different types</p>
	<div class="kanban-board">
		<div class="kanban-column">
			<h4>To Do</h4>
			<ItemList
				items={kanbanTodo}
				accepts={['task']}
				onListOrderChanged={(items) => (kanbanTodo = items)}
			>
				{#snippet listItem(item)}
					<li
						use:draggable={{
							type: 'task',
							data: item
						}}
						class="kanban-task todo"
					>
						{item}
					</li>
				{/snippet}
			</ItemList>
		</div>
		<div class="kanban-column">
			<h4>In Progress</h4>
			<ItemList
				items={kanbanInProgress}
				accepts={['task']}
				onListOrderChanged={(items) => (kanbanInProgress = items)}
			>
				{#snippet listItem(item)}
					<li
						use:draggable={{
							type: 'task',
							data: item
						}}
						class="kanban-task in-progress"
					>
						{item}
					</li>
				{/snippet}
			</ItemList>
		</div>
		<div class="kanban-column">
			<h4>Done</h4>
			<ItemList
				items={kanbanDone}
				accepts={['task']}
				onListOrderChanged={(items) => (kanbanDone = items)}
			>
				{#snippet listItem(item)}
					<li
						use:draggable={{
							type: 'task',
							data: item
						}}
						class="kanban-task done"
					>
						{item}
					</li>
				{/snippet}
			</ItemList>
		</div>
	</div>
</section>

<section>
	<h3>4. Drag Events & Feedback</h3>
	<p>Monitor drag events and provide visual feedback</p>
	<div class="event-example">
		<div
			use:droppable={{
				accepts: ['event-item'],
				onDragEnter: () => logEvent('Drag entered drop zone'),
				onDragLeave: () => logEvent('Drag left drop zone'),
				onDrop: (e) => logEvent(`Dropped: ${e.detail.data}`)
			}}
			class="drop-zone"
		>
			<p>Drop items here</p>
		</div>
		<div class="event-items">
			{#each ['Red', 'Green', 'Blue'] as color}
				<div
					use:draggable={{
						type: 'event-item',
						data: color,
						devDelay: 10000,
						onDragStart: () => logEvent(`Started dragging ${color}`),
						onDrop: (e) =>
							logEvent(`${color} drop ${e.detail.dropAllowed ? 'succeeded' : 'failed'}`)
					}}
					class="color-box"
					style="background-color: {color.toLowerCase()}"
				>
					{color}
				</div>
			{/each}
		</div>
		<div class="event-log">
			<h5>Event Log:</h5>
			{#each dragEvents as event}
				<div class="log-entry">{event}</div>
			{/each}
		</div>
	</div>
</section>

<section>
	<h3>5. Axis Constraints</h3>
	<p>Restrict dragging to horizontal or vertical axis</p>
	<div class="axis-example">
		<h4>Horizontal Only</h4>
		<div class="horizontal-container">
			{#each horizontalItems as item, i}
				<div
					use:draggable={{
						type: 'h-item',
						data: item,
						axis: 'x'
					}}
					class="axis-item"
				>
					{item}
				</div>
			{/each}
		</div>

		<h4>Vertical Only</h4>
		<div class="vertical-container">
			{#each ['Top', 'Middle', 'Bottom'] as item}
				<div
					use:draggable={{
						type: 'v-item',
						data: item,
						axis: 'y'
					}}
					class="axis-item"
				>
					{item}
				</div>
			{/each}
		</div>
	</div>
</section>

<section>
	<h3>6. Drag Groups</h3>
	<p>Drag entire groups of elements together</p>
	<div class="group-example">
		<div use:dragGroup class="card-group">
			<h4 use:draggable={{ type: 'card', data: 'Card 1' }}>📋 Card 1</h4>
			<div class="card-content">
				<p>This entire card will be dragged as a group</p>
				<button onclick={() => alert('Clicked!')}>Click me</button>
			</div>
		</div>

		<div use:dragGroup class="card-group">
			<h4 use:draggable={{ type: 'card', data: 'Card 2' }}>📋 Card 2</h4>
			<div class="card-content">
				<p>Drag from the header to move the whole card</p>
				<input type="text" placeholder="Type here..." />
			</div>
		</div>
	</div>
</section>

<section>
	<h3>7. Drag Delay (Click vs Drag)</h3>
	<p>These items can be both clicked and dragged</p>
	<div class="click-drag-example">
		{#each ['Click or drag me', 'I work too!', 'And me!'] as item, i}
			<button
				use:draggable={{
					type: 'clickable',
					data: item,
					delay: 200
				}}
				onclick={() => alert(`Clicked: ${item}`)}
				class="clickable-draggable"
			>
				{item}
			</button>
		{/each}
	</div>
</section>

<section>
	<h3>8. Custom Drop Zones</h3>
	<p>Different drop zones accept different types</p>
	<div class="custom-drops">
		<div
			use:droppable={{
				accepts: ['number'],
				onDrop: (e) => alert(`Dropped number: ${e.detail.data}`)
			}}
			class="drop-zone numbers"
		>
			<h4>Numbers Only</h4>
			<p>Drop numbers here</p>
		</div>

		<div
			use:droppable={{
				accepts: ['letter'],
				onDrop: (e) => alert(`Dropped letter: ${e.detail.data}`)
			}}
			class="drop-zone letters"
		>
			<h4>Letters Only</h4>
			<p>Drop letters here</p>
		</div>

		<div
			use:droppable={{
				accepts: ['*'],
				onDrop: (e) => alert(`Dropped anything: ${e.detail.data}`)
			}}
			class="drop-zone anything"
		>
			<h4>Accepts Anything</h4>
			<p>Drop anything here</p>
		</div>

		<div class="drag-items">
			{#each ['1', '2', '3'] as num}
				<div use:draggable={{ type: 'number', data: num }} class="drag-item number">
					{num}
				</div>
			{/each}
			{#each ['A', 'B', 'C'] as letter}
				<div use:draggable={{ type: 'letter', data: letter }} class="drag-item letter">
					{letter}
				</div>
			{/each}
		</div>
	</div>
</section>

<section>
	<h3>9. Scroll Test</h3>
	<p>Test dragging with page scroll - scroll down and try dragging items</p>
	<div style="height: 200px; overflow-y: auto; border: 1px solid var(--c-border); padding: 1rem;">
		<div style="height: 500px;">
			<p>Scroll down to see more items...</p>
			<div style="margin-top: 100px;">
				{#each ['Item A', 'Item B', 'Item C'] as item}
					<div
						use:draggable={{
							type: 'scroll-item',
							data: item,
							delay: 200
						}}
						class="simple-item"
						style="margin-bottom: 50px;"
					>
						{item} - Drag me after scrolling
					</div>
				{/each}
			</div>
		</div>
	</div>
	<div style="height: 300px; padding-top: 50px;">
		<p>This adds some height to the page to test page-level scrolling</p>
		{#each ['Bottom Item 1', 'Bottom Item 2'] as item}
			<div
				use:draggable={{
					type: 'bottom-item',
					data: item,
					delay: 200
				}}
				class="simple-item"
			>
				{item} - Drag me with page scrolled
			</div>
		{/each}
	</div>
</section>

<style lang="scss">
	/* DnD Example Styles */
	.simple-item {
		padding: 0.75rem;
		background: var(--c-bg_1);
		border: 1px solid var(--c-border);
		border-radius: var(--interactible-border-radius);
		margin-bottom: 0.5rem;
		list-style: none;

		&:hover {
			background: var(--c-bg);
		}
	}

	.two-lists {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;

		h4 {
			margin-bottom: 1rem;
		}
	}

	.todo-item {
		padding: 0.75rem;
		background: var(--c-bg_1);
		border: 1px solid var(--c-border);
		border-radius: var(--interactible-border-radius);
		margin-bottom: 0.5rem;
		list-style: none;
		display: flex;
		align-items: center;
		gap: 0.5rem;

		&.done {
			opacity: 0.7;
			text-decoration: line-through;
		}

		input[type='checkbox'] {
			pointer-events: all;
		}
	}

	.kanban-board {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;

		.kanban-column {
			background: var(--c-bg_1);
			border-radius: var(--interactible-border-radius);
			padding: 1rem;

			h4 {
				margin: 0 0 1rem 0;
				text-align: center;
			}
		}
	}

	.kanban-task {
		padding: 0.75rem;
		border-radius: var(--interactible-border-radius);
		margin-bottom: 0.5rem;
		list-style: none;
		font-size: 0.9rem;

		&.todo {
			background: #fee2e2;
			color: #991b1b;
		}

		&.in-progress {
			background: #fef3c7;
			color: #92400e;
		}

		&.done {
			background: #d1fae5;
			color: #065f46;
		}
	}

	.event-example {
		display: grid;
		gap: 1rem;

		.drop-zone {
			padding: 2rem;
			background: var(--c-bg_1);
			border: 2px dashed var(--c-border);
			border-radius: var(--interactible-border-radius);
			text-align: center;
			min-height: 100px;
			display: flex;
			align-items: center;
			justify-content: center;
		}

		.event-items {
			display: flex;
			gap: 1rem;
		}

		.color-box {
			padding: 1rem 2rem;
			color: white;
			border-radius: var(--interactible-border-radius);
			font-weight: bold;
			text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
		}

		.event-log {
			background: var(--c-bg);
			padding: 1rem;
			border-radius: var(--interactible-border-radius);
			max-height: 150px;
			overflow-y: auto;

			h5 {
				margin: 0 0 0.5rem 0;
			}

			.log-entry {
				font-size: 0.85rem;
				padding: 0.25rem 0;
				border-bottom: 1px solid var(--c-border);

				&:last-child {
					border-bottom: none;
				}
			}
		}
	}

	.axis-example {
		.horizontal-container {
			display: flex;
			gap: 1rem;
			padding: 1rem;
			background: var(--c-bg_1);
			border-radius: var(--interactible-border-radius);
			overflow-x: auto;
			margin-bottom: 2rem;
		}

		.vertical-container {
			display: flex;
			flex-direction: column;
			gap: 1rem;
			padding: 1rem;
			background: var(--c-bg_1);
			border-radius: var(--interactible-border-radius);
			max-width: 200px;
		}

		.axis-item {
			padding: 1rem;
			background: var(--c-primary);
			color: white;
			border-radius: var(--interactible-border-radius);
			white-space: nowrap;
		}
	}

	.group-example {
		display: flex;
		gap: 2rem;
		flex-wrap: wrap;

		.card-group {
			background: var(--c-bg_1);
			border: 1px solid var(--c-border);
			border-radius: var(--interactible-border-radius);
			overflow: hidden;
			width: 250px;

			h4 {
				margin: 0;
				padding: 1rem;
				background: var(--c-bg);
				border-bottom: 1px solid var(--c-border);
				cursor: grab;

				&:active {
					cursor: grabbing;
				}
			}

			.card-content {
				padding: 1rem;

				p {
					margin: 0 0 1rem 0;
				}

				button,
				input {
					width: 100%;
				}
			}
		}
	}

	.click-drag-example {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;

		.clickable-draggable {
			padding: 0.75rem 1.5rem;
			background: var(--c-primary);
			color: white;
			border: none;
			border-radius: var(--interactible-border-radius);
			cursor: pointer;

			&:hover {
				background: var(--c-primary_-1);
			}
		}
	}

	.custom-drops {
		display: grid;
		gap: 2rem;

		.drop-zone {
			padding: 2rem;
			border: 2px dashed var(--c-border);
			border-radius: var(--interactible-border-radius);
			text-align: center;

			h4 {
				margin: 0 0 0.5rem 0;
			}

			p {
				margin: 0;
				color: var(--c-text_-1);
			}

			&.numbers {
				background: #e0e7ff;
				border-color: #6366f1;
			}

			&.letters {
				background: #fce7f3;
				border-color: #ec4899;
			}

			&.anything {
				background: #f0fdf4;
				border-color: #22c55e;
			}
		}

		.drag-items {
			display: flex;
			gap: 1rem;
			flex-wrap: wrap;

			.drag-item {
				padding: 1rem 1.5rem;
				border-radius: var(--interactible-border-radius);
				font-weight: bold;
				color: white;

				&.number {
					background: #6366f1;
				}

				&.letter {
					background: #ec4899;
				}
			}
		}
	}
</style>
