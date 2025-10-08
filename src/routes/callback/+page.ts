import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	console.log("Handling callback redirect!", params);

};