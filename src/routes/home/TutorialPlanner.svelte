<script lang="ts">
  import { onMount } from 'svelte';
  import { tutorials } from '$lib/components/tutorials/store';
  import TTooltip from '$lib/components/tutorials/primitives/TTooltip.svelte';

  let active = $state(false);
  const id = 'home.todays-tasks';

  onMount(() => {
    if (!tutorials.isDone('home.welcome')) return;
    if (tutorials.isDone(id)) return;
    active = true;
  });

  function markDone() {
    tutorials.complete(id);
    active = false;
  }
</script>

{#if active}
  <TTooltip selector="#todays-tasks-list .task-list-item :global([data-slot=checkbox])" text="Mark a task complete here" onDismiss={markDone} />
{/if}


