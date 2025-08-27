<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { tutorials } from '$lib/components/tutorials/store';

  onMount(() => {
    if (!tutorials.isDone('home.welcome')) goto('/home');
  });
</script>


