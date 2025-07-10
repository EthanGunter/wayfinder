# Tutorial System

A flexible, component-based tutorial system for Svelte applications.

## Features

- **Decentralized**: Each component manages its own tutorials
- **Persistent**: Tracks progress and completion per tutorial
- **Resumable**: Offers to continue abandoned tutorials
- **Flexible**: Render function can return multiple elements
- **Extensible**: Easy to add new tutorial element types

## Basic Usage

### 1. Add TutorialOverlay to your app

```svelte
<!-- App.svelte or +layout.svelte -->
<script>
  import { TutorialOverlay } from '$lib/tutorials';
  // Optional: provide custom persistence
  // import { MyCustomPersistence } from './my-persistence';
</script>

<!-- Your app content -->
<main>
  <!-- ... -->
</main>

<!-- Tutorial overlay (should be at root level) -->
<!-- Uses LocalStorage by default, or provide custom persistence -->
<TutorialOverlay />
<!-- <TutorialOverlay persistence={new MyCustomPersistence()} /> -->
```

### 2. Create a tutorial in your component

```svelte
<!-- MyComponent.svelte -->
<script>
  import { Tutorial, TutorialTooltip } from '$lib/tutorials';
  import { onMount } from 'svelte';

  let tutorial: Tutorial;

  onMount(async () => {
    tutorial = new Tutorial({
      id: 'my-component-intro',
      steps: [
        {
          render: async (context) => {
            const tooltip = new TutorialTooltip({
              target: document.createElement('div'),
              props: {
                title: 'Welcome!',
                content: 'This is your first tutorial step.',
                target: '.my-button',
                onNext: context.next,
                onSkip: context.skip
              }
            });
            return [tooltip.$$.root];
          }
        },
        {
          render: async (context) => {
            const tooltip = new TutorialTooltip({
              target: document.createElement('div'),
              props: {
                content: 'Click this button to continue.',
                target: '.my-button',
                onNext: context.next,
                onPrevious: context.previous,
                onSkip: context.skip
              }
            });
            return [tooltip.$$.root];
          },
          canProceed: () => buttonWasClicked
        }
      ],
      onComplete: () => console.log('Tutorial completed!')
    });

    // Start tutorial if not completed
    const completed = await tutorial.isCompleted();
    if (!completed) {
      tutorial.start();
    }
  });
</script>

<button class="my-button">Click me</button>
```

## Pre-built Elements

### TutorialTooltip
Positioned tooltip that points to target elements.

```typescript
{
  render: async (context) => {
    const tooltip = new TutorialTooltip({
      target: document.createElement('div'),
      props: {
        title: 'Optional title',
        content: 'Tooltip content',
        target: '.css-selector', // Element to point to
        position: 'bottom', // 'top' | 'bottom' | 'left' | 'right' | 'center'
        onNext: context.next,
        onPrevious: context.previous,
        onSkip: context.skip
      }
    });
    return [tooltip.$$.root];
  }
}
```

### TutorialModal
Full-screen modal dialog.

```typescript
{
  render: async (context) => {
    const modal = new TutorialModal({
      target: document.createElement('div'),
      props: {
        title: 'Modal Title',
        content: 'Modal content goes here',
        size: 'medium', // 'small' | 'medium' | 'large'
        onNext: context.next,
        onPrevious: context.previous,
        onSkip: context.skip
      }
    });
    return [modal.$$.root];
  }
}
```

### TutorialHighlight
Highlights target elements with various styles.

```typescript
{
  render: async (context) => {
    const highlight = new TutorialHighlight({
      target: document.createElement('div'),
      props: {
        target: '.element-to-highlight',
        style: 'glow', // 'outline' | 'glow' | 'overlay'
        color: '#007acc',
        onNext: context.next,
        onPrevious: context.previous,
        onSkip: context.skip
      }
    });
    return [highlight.$$.root];
  }
}
```

## Combining Elements

You can return multiple elements from a single step:

```typescript
{
  render: async (context) => {
    const highlight = new TutorialHighlight({
      target: document.createElement('div'),
      props: {
        target: '.important-button',
        style: 'glow'
      }
    });

    const tooltip = new TutorialTooltip({
      target: document.createElement('div'),
      props: {
        content: 'This button is important!',
        target: '.important-button',
        position: 'top',
        onNext: context.next,
        onSkip: context.skip
      }
    });

    return [highlight.$$.root, tooltip.$$.root];
  }
}
```

## Advanced Features

### Step Lifecycle

```typescript
{
  onEnter: async (context) => {
    // Called when step starts
    console.log('Entering step', context.stepIndex);
  },
  onExit: async (context) => {
    // Called when leaving step
    console.log('Exiting step', context.stepIndex);
  },
  render: async (context) => {
    // Render tutorial elements
    return [/* elements */];
  },
  canProceed: (context) => {
    // Optional: prevent advancing until condition is met
    return someCondition;
  }
}
```

### Custom Persistence

```typescript
import { TutorialOverlay } from '$lib/tutorials';
import type { ITutorialPersistence } from '$lib/tutorials';

class CustomPersistence implements ITutorialPersistence {
  async getCompletedTutorials(): Promise<Set<string>> {
    // Your implementation
  }
  // ... other methods
}

// Pass to TutorialOverlay component - all tutorials will use this persistence
<TutorialOverlay persistence={new CustomPersistence()} />
```

### Safety Guards

The tutorial system includes safety guards to prevent runtime errors:

```typescript
// This will throw an error if TutorialOverlay is not mounted
const tutorial = new Tutorial({
  id: 'my-tutorial',
  steps: [/* ... */]
});

await tutorial.start(); // Error: Tutorial system not initialized
```

Make sure to mount the `TutorialOverlay` component before creating or starting any tutorials.

## TODO Items

- [ ] Integrate with UserPrefs system for global tutorial settings
- [ ] Add analytics integration for tracking tutorial completion rates
- [ ] Implement restart/continue dialogs (currently just logs)
- [ ] Add tutorial versioning system for invalidating old tutorials
- [ ] Create utility functions for common tutorial patterns