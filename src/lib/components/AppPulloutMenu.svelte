<script lang="ts">
	import BugReportModal from './BugReport.svelte';
	import { Button } from './ui/button';
	import * as Dialog from './ui/dialog';
	import * as Sheet from './ui/sheet';

	let showSheet = $state(false);
</script>

<h1>Settings</h1>
<Dialog.Root>
	<Dialog.Trigger><Button>Submit a bug</Button></Dialog.Trigger>
	<Dialog.Content>
		<BugReportModal />
	</Dialog.Content>
</Dialog.Root>
