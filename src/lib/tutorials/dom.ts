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

export function bringToViewIfNeeded(element: Element) {
  if ('scrollIntoView' in element) {
    try {
      (element as HTMLElement).scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    } catch {
      // ignore
    }
  }
}


