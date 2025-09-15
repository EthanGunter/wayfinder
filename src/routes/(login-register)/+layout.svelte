<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '@/components/ui/button';
	import Icon from '@iconify/svelte';

	function goBack() {
		const redirect = page.url.searchParams.get('redirect');
		if (redirect) {
			goto(redirect);
		} else {
			goto('/');
		}
	}
</script>

<div class="page flex min-h-screen min-w-screen items-center justify-center p-4">
	<div
		class="relative grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg"
	>
		<!-- Back Button -->
		<Button
			variant="ghost"
			class="absolute top-4 left-4 h-8 w-8 rounded-full p-0 opacity-70 transition-opacity hover:opacity-100"
			onclick={goBack}
		>
			<Icon icon="lucide:arrow-left" class="h-4 w-4" />
			<span class="sr-only">Back</span>
		</Button>
		<slot />
	</div>
</div>
