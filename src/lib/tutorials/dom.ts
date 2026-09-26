export type QueryWaitOptions = {
  timeoutMs?: number;
  root?: ParentNode;
};

/**
 * Query an element by selector; if not found, wait up to `timeoutMs` for it to appear.
 * Returns the element, or `null` on timeout.
 */
export async function queryOrWait<T extends HTMLElement>(
  selector: string,
  { timeoutMs = 10000, root = document }: QueryWaitOptions = {}
): Promise<T | null> {
  // Fast path: return immediately if present
  const immediate = root.querySelector<T>(selector);
  if (immediate) return immediate;

  let resolveFn: (el: T | null) => void;
  let timer: number | undefined;

  const result = new Promise<T | null>((resolve) => (resolveFn = resolve));

  // Set up an observer to watch for DOM changes under the chosen root
  const observer = new MutationObserver(() => {
    const el = root.querySelector<T>(selector);
    if (el) {
      // Element appeared; stop observing and resolve
      cleanup();
      resolveFn(el);
    }
  });

  function cleanup() {
    observer.disconnect();
    if (timer) window.clearTimeout(timer);
  }

  // Observe the entire subtree to catch late-mounted nodes
  observer.observe(root === document ? document.documentElement : (root as Element), {
    childList: true,
    subtree: true,
  });

  if (timeoutMs > 0) {
    // Give up after the requested timeout
    timer = window.setTimeout(() => {
      cleanup();
      resolveFn(null);
    }, timeoutMs);
  }

  return result;
}

export type RectObserverHandle = {
  disconnect: () => void;
};

export function observeRect(
  element: Element,
  onChange: (rect: DOMRect) => void
): RectObserverHandle {
  let last: string | null = null;

  function emit() {
    const rect = element.getBoundingClientRect();
    const key = [rect.x, rect.y, rect.width, rect.height].join('|');
    if (key !== last) {
      last = key;
      onChange(rect);
    }
  }

  const resizeObserver = new ResizeObserver(emit);
  resizeObserver.observe(element as Element);

  const scrollListener = () => emit();
  const resizeListener = () => emit();

  window.addEventListener('scroll', scrollListener, true);
  window.addEventListener('resize', resizeListener, true);

  // Initial
  emit();

  return {
    disconnect() {
      resizeObserver.disconnect();
      window.removeEventListener('scroll', scrollListener, true);
      window.removeEventListener('resize', resizeListener, true);
    },
  };
}

/** Tailwind's `sm` breakpoint; below it tutorials favor centered fallbacks. */
export const NARROW_BREAKPOINT_PX = 640;

export function isNarrowViewport(breakpointPx = NARROW_BREAKPOINT_PX): boolean {
  return typeof window !== 'undefined' && window.innerWidth < breakpointPx;
}

/**
 * True if the element can't be pointed at: detached, zero-size, `display:none` (itself or an
 * ancestor, e.g. `hidden sm:block`), or `visibility:hidden`.
 */
export function isElementHidden(element: Element): boolean {
  if (!element.isConnected) return true;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return true;
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return true;
  // offsetParent is null for display:none ancestors (and for position:fixed, which is fine)
  if (element instanceof HTMLElement && element.offsetParent === null && style.position !== 'fixed') {
    return element !== document.body;
  }
  return false;
}

/** True if no part of the element's box intersects the viewport. */
export function isElementOffscreen(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.bottom <= 0 ||
    rect.right <= 0 ||
    rect.top >= window.innerHeight ||
    rect.left >= window.innerWidth
  );
}

/** True if the element's box is entirely inside the viewport. */
export function isElementFullyInView(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right <= window.innerWidth
  );
}

/** Scroll the element to the center of the viewport unless it's already fully visible. */
export function bringToViewIfNeeded(element: Element) {
  if (isElementFullyInView(element)) return;
  if ('scrollIntoView' in element) {
    try {
      (element as HTMLElement).scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    } catch {
      // ignore
    }
  }
}


