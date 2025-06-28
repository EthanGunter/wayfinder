<script lang="ts">
import { goto } from "$app/navigation";
import { invalidateAll } from "$app/navigation";
import { page } from "$app/state";

function navTo(path: string) {
  // SvelteKit SPA navigation
  if (page.url.pathname.includes(path)) {
    // Refresh the current page data instead of reloading
    invalidateAll();
  } else {
    goto(path);
  }
}
</script>

<div class={"app-footer"}>
  <button onclick={() => navTo("/home")}
    aria-label="Go to home">
    <!-- TODO: Replace with real icon - using ChecklistIcon equivalent -->
    <span>✓</span>
  </button>
  <button onclick={() => navTo("/tasks")}
    aria-label="Go to tasks">
    <!-- TODO: Replace with real icon - using AccountTreeIcon equivalent -->
    <span>🌳</span>
  </button>
</div>

<style lang="scss">
.app-footer {
    // Layout
    display: flex;
    align-items: center;
    justify-content: space-between;

    // Style
    box-shadow: 0px 0px 20px 0px var(--c-shadow);
    background-color: var(--c-bg_1);

    > :global(*) {
        flex: 1 1 auto;
        background: none;
        color: var(--c-text_2);
    }
    > :global(* + *) {
        border-left: solid 1px var(--c-text_2);
    }
}
</style>
