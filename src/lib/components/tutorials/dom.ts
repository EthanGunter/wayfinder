export type QueryWaitOptions = {
  timeoutMs?: number;
  root?: ParentNode;
};

export async function queryOrWait(
  selector: string,
  { timeoutMs = 10000, root = document }: QueryWaitOptions = {}
): Promise<Element | null> {
  const immediate = root.querySelector(selector);
  if (immediate) return immediate;

  let resolveFn: (el: Element | null) => void;
  let timer: number | undefined;

  const result = new Promise<Element | null>((resolve) => (resolveFn = resolve));

  const observer = new MutationObserver(() => {
    const el = root.querySelector(selector);
    if (el) {
      cleanup();
      resolveFn(el);
    }
  });

  function cleanup() {
    observer.disconnect();
    if (timer) window.clearTimeout(timer);
  }

  observer.observe(root === document ? document.documentElement : (root as Element), {
    childList: true,
    subtree: true,
  });

  if (timeoutMs > 0) {
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


