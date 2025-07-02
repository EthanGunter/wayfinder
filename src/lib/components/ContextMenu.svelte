<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';

  interface Props {
    open: boolean;
    x: number;
    y: number;
    onClose?: () => void;
    children?: any;
  }

  export let open: boolean;
  export let x: number;
  export let y: number;
  export let onClose: (() => void) | undefined;
  export let children: any;

  let menuEl: HTMLDivElement | null = null;
  const dispatch = createEventDispatcher();

  // Position state
  let left = 0;
  let top = 0;

  function clamp(val: number, min: number, max: number) {
    return Math.max(min, Math.min(max, val));
  }

  function positionMenu() {
    if (!menuEl) return;
    const rect = menuEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Default: place at mouse
    let _left = x;
    let _top = y;

    // If overflow right, stick to right edge
    if (_left + rect.width > vw) {
      _left = vw - rect.width - 8;
    }
    // If overflow bottom, position above mouse
    if (_top + rect.height > vh) {
      _top = y - rect.height;
      if (_top < 0) _top = 8; // Clamp to top
    }

    left = clamp(_left, 8, vw - rect.width - 8);
    top = clamp(_top, 8, vh - rect.height - 8);

    menuEl.style.left = `${left}px`;
    menuEl.style.top = `${top}px`;
  }

  function handleClickOff(event: MouseEvent) {
    if (menuEl && !menuEl.contains(event.target as Node)) {
      onClose?.();
      dispatch('close');
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose?.();
      dispatch('close');
    }
  }

  onMount(() => {
    if (open) {
      setTimeout(positionMenu, 0);
      document.addEventListener('mousedown', handleClickOff, true);
      document.addEventListener('keydown', handleKeyDown, true);
    }
  });

  $: if (open) {
    setTimeout(positionMenu, 0);
    document.addEventListener('mousedown', handleClickOff, true);
    document.addEventListener('keydown', handleKeyDown, true);
  } else {
    document.removeEventListener('mousedown', handleClickOff, true);
    document.removeEventListener('keydown', handleKeyDown, true);
  }

  onDestroy(() => {
    document.removeEventListener('mousedown', handleClickOff, true);
    document.removeEventListener('keydown', handleKeyDown, true);
  });
</script>

{#if open}
  <div
    bind:this={menuEl}
    class="context-menu"
    tabindex="0"
    style="position: fixed; z-index: 10000; left: 0; top: 0;"
    on:contextmenu|preventDefault
    role="menu"
    aria-modal="true"
  >
    {@render children?.()}
  </div>
{/if}

<style>
  .context-menu {
    min-width: 180px;
    background: var(--background-primary, #fff);
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 8px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.12);
    padding: 0.5rem 0;
    outline: none;
    user-select: none;
    /* No overlay */
  }
  .context-menu:focus {
    outline: 2px solid var(--primary-color, #3b82f6);
  }
</style>