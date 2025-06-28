<script lang="ts">
// Svelte conversion of task-browser-list.tsx
import TaskListItem from './TaskListItem.svelte';
// TODO: Convert and import SortableTaskListItem.svelte
// import SortableTaskListItem from './SortableTaskListItem.svelte';
import type { Task } from '../../models/task';
// TODO: Define TaskListProps type
// import type { TaskListProps } from './TaskList';
import { onMount } from 'svelte';
import { writable } from 'svelte/store';

export let tasks: Task[] = [];
export let onListOrderChange: (tasks: Task[]) => void;
export let children: any;

let completedOpen = false;
let draggedTask: Task | undefined = undefined;
let localTasks = writable<Task[]>(tasks);

$: incomplete = $localTasks.filter(t => !t.completed);
$: completed = $localTasks.filter(t => t.completed);

// TODO: Implement drag-and-drop logic (Svelte alternative to dnd-kit)
// TODO: Implement gotoTask (set search params)

function handleTaskChange(task: Task, changes: Partial<Task>) {
    const idx = $localTasks.findIndex(t => t.id === task.id);
    if (idx !== -1) {
        const updatedTask = { ...task, ...changes };
        $localTasks = [
            ...$localTasks.slice(0, idx),
            updatedTask,
            ...$localTasks.slice(idx + 1)
        ];
    }
}

function handleDelete(task: Task) {
    $localTasks = $localTasks.filter(t => t.id !== task.id);
}
</script>

<ol class="task-list">
    <h3 style="padding: 1rem">In Progress</h3>
    {#each incomplete as t (t.id)}
        <!-- TODO: Use SortableTaskListItem when available -->
        <TaskListItem
            task={t}
            on:headerClicked={() => {/* TODO: gotoTask(t) */}}
            on:delete={() => handleDelete(t)}
            on:taskChange={(e) => handleTaskChange(t, e.detail)}
        />
    {/each}
</ol>

<slot />

{#if completed.length > 0}
    <div>
        <span id="completed-header" on:click={() => completedOpen = !completedOpen}>
            <h3>Completed ({completed.length})</h3>
            <button id="completed-toggle-button">
                <!-- TODO: KeyboardArrowDown icon -->
                ▼
            </button>
        </span>
        {#if completedOpen}
            <ol class="task-list completed">
                {#each completed as t (t.id)}
                    <TaskListItem
                        task={t}
                        on:headerClicked={() => {/* TODO: gotoTask(t) */}}
                        on:delete={() => handleDelete(t)}
                        on:taskChange={(e) => handleTaskChange(t, e.detail)}
                    />
                {/each}
            </ol>
        {/if}
    </div>
{/if}

<!-- TODO: DragOverlay equivalent for Svelte -->
<style>
@import './task-editor.scss';
</style>
