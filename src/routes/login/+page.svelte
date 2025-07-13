<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import authProvider from '$lib/API/Auth';
	let redir = page.url.searchParams.get('redirectTo');
	let email: string;
	let password: string;

	function handleRegister(evt: MouseEvent) {
		authProvider.signUp({ type: 'email_password', email, password });
		goto(redir ?? '');
	}
	function handleLogin(evt: MouseEvent) {
		authProvider.signIn({ type: 'email_password', email, password });
		goto(redir ?? '');
	}
</script>

<div>
	<p>So you wanna log in, huh?</p>
</div>
<div style="display:flex; flex-direction: column">
	<label for="email">Email:</label><input id="email" type="text" bind:value={email} />
	<label for="pass">Password:</label><input id="pass" type="password" bind:value={password} />
	<button onclick={handleLogin}>Login</button>
	<button onclick={handleRegister}>Register</button>
</div>
