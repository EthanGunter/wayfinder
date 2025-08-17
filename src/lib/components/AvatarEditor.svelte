<script lang="ts">
	import { type User } from '$lib/API/Auth/User';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import * as Dialog from '@/components/ui/dialog';
	import Icon from '@iconify/svelte';

	interface Props {
		user: User;
		onAvatarChange?: (avatarUrl: string) => void;
		class?: string;
	}
	const { user = $bindable(), onAvatarChange, class: className }: Props = $props();

	let isUploading = $state(false);
	let dragActive = $state(false);

	// Handle file selection
	function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			handleFileUpload(file);
		}
	}

	// Handle file upload (ready for server integration)
	async function handleFileUpload(file: File) {
		isUploading = true;

		try {
			// TODO: Implement actual file upload to server
			// For now, create a local blob URL as placeholder
			const blobUrl = URL.createObjectURL(file);

			// Simulate server upload delay
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// TODO: Replace with actual server URL
			const serverUrl = `https://your-server.com/avatars/${user.id}/${file.name}`;

			user.avatar_url = serverUrl;

			onAvatarChange?.(serverUrl);
		} catch (error) {
			console.error('File upload failed:', error);
			// TODO: Show error message to user
		} finally {
			isUploading = false;
		}
	}

	// Handle drag and drop
	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		dragActive = true;
	}

	function handleDragLeave() {
		dragActive = false;
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragActive = false;

		const files = event.dataTransfer?.files;
		if (files && files.length > 0) {
			handleFileUpload(files[0]);
		}
	}

	// Clean up blob URLs
	function cleanup() {
		// TODO: Clean up any created blob URLs when component unmounts
	}
</script>

<Dialog.Root>
	<Dialog.Trigger>
		<div class="group relative cursor-pointer {className}">
			<UserAvatar {user} class="transition-transform sm:group-hover:scale-105" />

			<!-- Edit Icon - Always visible on mobile, hover-only on larger screens -->
			<div
				class="absolute right-5 bottom-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary shadow-lg transition-all sm:hidden sm:opacity-0 sm:group-hover:opacity-100"
			>
				<Icon icon="lucide:edit-2" class="h-3 w-3 text-white" />
			</div>

			<!-- Hover overlay - Only on larger screens -->
			<div
				class="absolute inset-0 hidden rounded-full bg-black/20 transition-opacity sm:flex sm:items-center sm:justify-center sm:opacity-0 sm:group-hover:opacity-100"
			>
				<Icon icon="lucide:edit-2" class="h-full max-h-20 w-full max-w-20 text-background" />
			</div>
		</div>
	</Dialog.Trigger>

	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Edit Avatar</Dialog.Title>
			<Dialog.Description>
				Update your profile picture by entering a URL. <p class="text-xs text-gray-400">
					File upload coming soon
				</p>
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-6 py-4">
			<!-- Current Avatar Preview -->
			<div class="flex flex-col items-center space-y-4">
				<UserAvatar {user} class="h-full max-h-[50vh] w-full max-w-[50vw]" />
				{#if isUploading}
					<div class="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
						<div class="h-8 w-8 animate-spin rounded-full border-b-2 border-white"></div>
					</div>
				{/if}
				<span class="text-sm text-gray-600">Current Avatar</span>
			</div>

			<hr class="border-t border-gray-200" />

			<!-- URL Input Section -->
			<div class="space-y-3">
				<label for="avatar-url" class="text-sm font-medium text-gray-700"> Avatar URL </label>
				<div class="flex space-x-2">
					<input
						id="avatar-url"
						type="url"
						bind:value={user.avatar_url}
						placeholder="https://example.com/avatar.jpg"
						class="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
					/>
				</div>
				<p class="text-xs text-gray-500">Enter a direct link to an image file (JPG, PNG, GIF)</p>
			</div>

			<div class="border-t border-gray-200"></div>

			<!-- File Upload Section -->
			<!-- TODO: Requires file hosting server implementation -->
			{#if false}
				<div class="space-y-3">
					<label class="text-sm font-medium text-gray-700"> Upload Image </label>

					<!-- Drag & Drop Area -->
					<div
						class="relative rounded-lg border-2 border-dashed p-6 text-center transition-colors"
						class:border-blue-400={dragActive}
						class:border-gray-300={!dragActive}
						class:bg-blue-50={dragActive}
						class:bg-gray-50={!dragActive}
						ondragover={handleDragOver}
						ondragleave={handleDragLeave}
						ondrop={handleDrop}
					>
						<input
							type="file"
							accept="image/*"
							class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
							onchange={handleFileSelect}
						/>

						<div class="space-y-2">
							<svg
								class="mx-auto h-8 w-8 text-gray-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
								/>
							</svg>
							<div class="text-sm text-gray-600">
								<span class="font-medium text-blue-600 hover:text-blue-500"> Click to upload </span>
								or drag and drop
							</div>
							<p class="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
						</div>
					</div>

					{#if isUploading}
						<div class="flex items-center space-x-2 text-sm text-blue-600">
							<div class="h-4 w-4 animate-spin rounded-full border-b-2 border-blue-600"></div>
							<span>Uploading...</span>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<Dialog.Footer>
			<Dialog.Close class="self-end">
				<button
					class="self-end rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
				>
					close
				</button>
			</Dialog.Close>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
