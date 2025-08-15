<script lang="ts">
	import Button from '@/components/ui/button/button.svelte';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Drawer from '$lib/components/ui/drawer';
</script>

<div class="mx-auto my-8 max-w-2xl p-8">
	<h1>Dev Playground</h1>
	<Sheet.Root>
		<Sheet.Trigger>
			<Button>Open sheet</Button>
		</Sheet.Trigger>
		<Sheet.Content side="bottom" class="animate-slide-up duration-fast ease-fast">I'M A ¿SHEET? apparently...</Sheet.Content>
	</Sheet.Root>
</div>
