/**
 * Positioning for TModal's passive popover (the anchored card with no buttons). It is plain
 * geometry so it can be unit-tested: pick a side of the anchor with room for the card, never
 * overlapping the anchor if any side fits, and keep the card inside the viewport.
 */

export type Side = 'top' | 'right' | 'bottom' | 'left';

export type Box = { left: number; top: number; width: number; height: number };
export type Size = { width: number; height: number };

export type PlaceOptions = {
	/** Anchor box in viewport coordinates (getBoundingClientRect). */
	anchor: Box;
	/** Size of the card to place. */
	floating: Size;
	viewport: Size;
	/** Preferred side of the anchor. */
	side: Side;
	/** Space between the anchor and the card (includes the arrow). */
	gap?: number;
	/** Minimum distance from the viewport edges. */
	padding?: number;
	/** Keep the arrow this far from the card's corners. */
	arrowPadding?: number;
};

export type Placement = {
	/** The side that was used (may differ from the preferred one). */
	side: Side;
	/** Card position in viewport coordinates. */
	left: number;
	top: number;
	/** Arrow position along the card's edge that faces the anchor, or null if it can't point at it. */
	arrow: number | null;
	/** False when no side had room and the card had to overlap the anchor. */
	fits: boolean;
};

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const PERPENDICULAR: Record<Side, [Side, Side]> = {
	top: ['right', 'left'],
	bottom: ['right', 'left'],
	left: ['top', 'bottom'],
	right: ['top', 'bottom']
};

const clamp = (value: number, min: number, max: number) =>
	max < min ? min : Math.min(Math.max(value, min), max);

/** Free space between the anchor and the viewport edge on `side`, minus the card's need. */
function spare(side: Side, o: Required<Omit<PlaceOptions, 'arrowPadding'>>): number {
	const { anchor, floating, viewport, gap, padding } = o;
	switch (side) {
		case 'top':
			return anchor.top - padding - gap - floating.height;
		case 'bottom':
			return viewport.height - (anchor.top + anchor.height) - padding - gap - floating.height;
		case 'left':
			return anchor.left - padding - gap - floating.width;
		case 'right':
			return viewport.width - (anchor.left + anchor.width) - padding - gap - floating.width;
	}
}

/**
 * Place a card next to `anchor`: the preferred side if it has room, else the opposite side,
 * else a perpendicular side, else whichever side comes closest (clamped into the viewport).
 */
export function placeFloating(options: PlaceOptions): Placement {
	const o = { gap: 8, padding: 16, ...options };
	const { anchor, floating, viewport, gap, padding } = o;
	const arrowPadding = options.arrowPadding ?? 12;

	const order: Side[] = [o.side, OPPOSITE[o.side], ...PERPENDICULAR[o.side]];
	let side = order.find((s) => spare(s, o) >= 0);
	const fits = side !== undefined;
	side ??= order.reduce((best, s) => (spare(s, o) > spare(best, o) ? s : best));

	const centerX = anchor.left + anchor.width / 2;
	const centerY = anchor.top + anchor.height / 2;
	let left: number;
	let top: number;
	switch (side) {
		case 'top':
			left = centerX - floating.width / 2;
			top = anchor.top - gap - floating.height;
			break;
		case 'bottom':
			left = centerX - floating.width / 2;
			top = anchor.top + anchor.height + gap;
			break;
		case 'left':
			left = anchor.left - gap - floating.width;
			top = centerY - floating.height / 2;
			break;
		case 'right':
			left = anchor.left + anchor.width + gap;
			top = centerY - floating.height / 2;
			break;
	}
	left = clamp(left, padding, viewport.width - padding - floating.width);
	top = clamp(top, padding, viewport.height - padding - floating.height);

	const vertical = side === 'top' || side === 'bottom';
	const along = vertical ? centerX - left : centerY - top;
	const length = vertical ? floating.width : floating.height;
	const arrow = fits && along >= arrowPadding && along <= length - arrowPadding ? along : null;

	return { side, left, top, arrow, fits };
}
