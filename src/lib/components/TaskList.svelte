<script lang="ts">
  import { droppable } from "$lib/dnd";
  import TaskListItem from "$lib/components/TaskListItem.svelte";
  import type { Task } from "$lib/DataAPI/Task";

  const { tasks = [], scrollable = false, id = "", ghostRenderOverride } = $props<{
    tasks: Task[];
    scrollable?: boolean;
    id?: string;
    ghostRenderOverride?: (args: any) => void;
  }>();

  let taskListRef: HTMLElement;

  function handleDrop(e: CustomEvent) {
    // Forward the event for parent listeners (Svelte 5 style)
    dispatchEvent(new CustomEvent("listOrderChange", { detail: { tasks }, bubbles: true }));
  }
</script>

<ol
  bind:this={taskListRef}
  class="task-list drop-zone"
  data-scrollable={scrollable}
  use:droppable={{
    accepts: ["task"],
    onDrop: handleDrop,
    ghostRenderOverride
  }}
  id={id}
>
  {#each tasks as task (task.id)}
    <TaskListItem {task} />
  {/each}
</ol>

<style lang="scss">
.task-list {
    // Layout
    display: flex;
    flex-direction: column;

    // Style
    padding: 0.5rem;
    gap: 0.2rem;
    list-style: none;
    margin: 0;
}
.task-list[data-scrollable] {
    overflow-y: scroll;
}
.drop-zone {
  min-height: 2rem;
}

:global(#completed-header) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
}
:global(#completed-toggle-button) {
    background: none;
    padding: 0;

    svg {
        width: 2rem;
        height: 2rem;
    }
}
</style>
