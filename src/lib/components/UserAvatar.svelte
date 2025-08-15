<script lang="ts">
	import type { LocalUser } from '@/API/Auth/User';

	interface Props {
		user: LocalUser;
	}
	const { user }: Props = $props();
</script>

<div class="user-avatar">
	{#if user.avatar_url}
		<img src={user.avatar_url} alt="User avatar" />
	{:else}
		<div class="user-avatar-placeholder">
			{user.display_name?.charAt(0)?.toUpperCase() || '?'}
		</div>
	{/if}
</div>

<style>
	.user-avatar {
		position: relative;
		border-radius: 50%;
		overflow: hidden;
		background: #f0f0f0;
		aspect-ratio: 1;
	}

	.user-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.user-avatar-placeholder {
		width: 100%;
		height: 100%;
		object-fit: cover;

		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 200%;
		font-weight: bold;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
	}
</style>
