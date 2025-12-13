<script lang="ts">
	import * as ResponsiveDialog from '$lib/components/ui/responsive-dialog';
	import Calendar from '$lib/components/ui/calendar/calendar.svelte';
	import { Button } from '$lib/components/ui/button';
	import { CalendarDate, getLocalTimeZone, today, type DateValue } from '@internationalized/date';
	import { cn } from '$lib/utils';
	import Icon from '@iconify/svelte';
	import Label from './ui/label/label.svelte';

	let {
		title,
		value = $bindable<Date | undefined>(undefined),
		onchange,
		includeTime = true
	}: {
		title: string;
		value?: Date;
		onchange?: (timestamp?: Date) => void;
		includeTime?: boolean;
	} = $props();

	let open = $state(false);
	const todayDate = today(getLocalTimeZone());

	// Mutable state for calendar - synced with value prop
	let calendarValue = $state<DateValue | undefined>(undefined);

	// Sync calendarValue when value prop changes
	$effect(() => {
		if (!value) {
			calendarValue = undefined;
		} else {
			calendarValue = new CalendarDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
		}
	});

	// Convert DateValue back to Date/timestamp
	function handleCalendarChange(newValue: DateValue | undefined) {
		if (!newValue) {
			value = undefined;
			onchange?.(undefined);
			return;
		}

		// Convert DateValue to Date
		const date = new Date(newValue.year, newValue.month - 1, newValue.day);

		// If we have an existing value with time, preserve the time
		if (value && includeTime) {
			date.setHours(value.getHours());
			date.setMinutes(value.getMinutes());
			date.setSeconds(value.getSeconds());
		} else if (includeTime) {
			// Default to end of day if no existing time
			date.setHours(23, 59, 59);
		}

		value = date;
		onchange?.(date);
	}

	function handlePreset(days: number) {
		const newDate = todayDate.add({ days });
		handleCalendarChange(newDate);
		open = false;
	}

	function handleClear() {
		value = undefined;
		onchange?.(undefined);
		open = false;
	}

	// Format date for display
	const displayText = $derived.by(() => {
		if (!value) return 'Select a date';

		const isDefaultTime = includeTime && value.getHours() === 23 && value.getMinutes() === 59;
		const shouldShowTime = includeTime && !isDefaultTime;

		const formatter = new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			...(shouldShowTime && {
				hour: 'numeric',
				minute: '2-digit'
			})
		});

		return formatter.format(value);
	});
</script>

<Button
	variant="outline"
	class={cn('justify-start text-start font-normal', !value && 'text-muted-foreground')}
	onclick={() => (open = true)}
>
	<Icon icon="lucide:calendar" class="me-2 size-4" />
	{displayText}
</Button>

<ResponsiveDialog.Root bind:open>
	<ResponsiveDialog.Content>
		<ResponsiveDialog.Header>
			<ResponsiveDialog.Title>{title}</ResponsiveDialog.Title>
		</ResponsiveDialog.Header>

		<div class="p-4">
			<Calendar
				type="single"
				bind:value={calendarValue}
				onValueChange={handleCalendarChange}
				class="bg-transparent p-0 [--cell-size:--spacing(9.5)]"
			/>
		</div>

		<ResponsiveDialog.Footer class="flex flex-wrap gap-2 border-t px-4 !pt-4">
			{#each [{ label: 'Today', value: 0 }, { label: 'Tomorrow', value: 1 }, { label: 'In 3 days', value: 3 }, { label: 'In a week', value: 7 }, { label: 'In 2 weeks', value: 14 }] as preset (preset.value)}
				<Button
					variant="outline"
					size="sm"
					class="flex-1"
					onclick={() => handlePreset(preset.value)}
				>
					{preset.label}
				</Button>
			{/each}
			{#if value}
				<Button variant="outline" size="sm" class="flex-1" onclick={handleClear}>Clear</Button>
			{/if}
		</ResponsiveDialog.Footer>
	</ResponsiveDialog.Content>
</ResponsiveDialog.Root>
