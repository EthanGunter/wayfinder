import { describe, expect, it } from 'vitest';
import { placeFloating } from './placement';

const viewport = { width: 1440, height: 900 };
const card = { width: 320, height: 90 };

/** True if two boxes overlap. */
function intersects(
	a: { left: number; top: number; width: number; height: number },
	b: { left: number; top: number; width: number; height: number }
) {
	return (
		a.left < b.left + b.width &&
		b.left < a.left + a.width &&
		a.top < b.top + b.height &&
		b.top < a.top + a.height
	);
}

describe('placeFloating', () => {
	it('uses the preferred side when there is room, centered on the anchor', () => {
		const anchor = { left: 500, top: 300, width: 400, height: 400 };
		const p = placeFloating({ anchor, floating: card, viewport, side: 'top', gap: 26 });
		expect(p.side).toBe('top');
		expect(p.fits).toBe(true);
		expect(p.top).toBe(300 - 26 - 90);
		expect(p.left).toBe(700 - 160);
		expect(p.arrow).toBe(160);
		expect(intersects({ ...p, ...card }, anchor)).toBe(false);
	});

	it('flips to the opposite side when the preferred one has no room', () => {
		const anchor = { left: 500, top: 60, width: 400, height: 300 };
		const p = placeFloating({ anchor, floating: card, viewport, side: 'top', gap: 26 });
		expect(p.side).toBe('bottom');
		expect(p.top).toBe(60 + 300 + 26);
		expect(intersects({ ...p, ...card }, anchor)).toBe(false);
	});

	it('tries the sides next when neither top nor bottom fits', () => {
		const anchor = { left: 560, top: 40, width: 320, height: 820 };
		const p = placeFloating({ anchor, floating: card, viewport, side: 'top', gap: 26 });
		expect(p.side).toBe('right');
		expect(intersects({ ...p, ...card }, anchor)).toBe(false);
	});

	it('keeps the card inside the viewport and hides the arrow if it cannot point at the anchor', () => {
		const anchor = { left: 0, top: 400, width: 10, height: 40 };
		const p = placeFloating({ anchor, floating: card, viewport, side: 'top', gap: 26 });
		expect(p.left).toBe(16);
		expect(p.arrow).toBeNull();
	});

	it('falls back to the roomiest side, clamped, when nothing fits', () => {
		const small = { width: 390, height: 300 };
		const anchor = { left: 0, top: 60, width: 390, height: 240 };
		const p = placeFloating({ anchor, floating: card, viewport: small, side: 'top', gap: 26 });
		expect(p.fits).toBe(false);
		expect(p.side).toBe('top');
		expect(p.top).toBe(16);
		expect(p.arrow).toBeNull();
	});
});
