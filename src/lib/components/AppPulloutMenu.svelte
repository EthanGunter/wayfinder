<script lang="ts">
	import BugReportModal from './BugReport.svelte';
	import { Button } from './ui/button';
	import * as Dialog from './ui/dialog';
</script>

<h1>Settings</h1>
<Dialog.Root>
	<Dialog.Trigger><Button>Submit a bug</Button></Dialog.Trigger>
	<Dialog.Content>
		<BugReportModal />
	</Dialog.Content>
</Dialog.Root>
