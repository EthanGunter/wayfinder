import Root from "./responsive-dialog-root.svelte";
import Content from "./responsive-dialog-content.svelte";
import Header from "./responsive-dialog-header.svelte";
import Footer from "./responsive-dialog-footer.svelte";

// Title and Description are identical between Dialog and Sheet
// since they both use the same bits-ui primitives, so we just re-export from Dialog
import {
	Title,
	Description
} from "../dialog";

export {
	Root,
	Content,
	Header,
	Footer,
	Title,
	Description,
	//
	Root as ResponsiveDialog,
	Content as ResponsiveDialogContent,
	Header as ResponsiveDialogHeader,
	Footer as ResponsiveDialogFooter,
	Title as ResponsiveDialogTitle,
	Description as ResponsiveDialogDescription,
};

