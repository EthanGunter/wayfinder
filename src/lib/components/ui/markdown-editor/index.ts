import Milkdown from './MilkdownEditor.svelte'
import HumanSpeak from './HumanSpeakEditor.svelte'

export type Props = {
	value: string;
	onChange?: (md: string) => void;
};
export default HumanSpeak;