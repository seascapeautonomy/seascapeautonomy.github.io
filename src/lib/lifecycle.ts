/**
 * Run `setup` on every page load, including client-side navigations.
 *
 * A page's script can finish loading after `astro:page-load` has already fired
 * (e.g. a large dependency fetched during a client-side navigation), so `setup`
 * also runs immediately. It may therefore run twice for the same page and must
 * be idempotent — use `claim()` to skip elements that are already set up.
 */
export function onPageLoad(setup: () => void) {
  document.addEventListener('astro:page-load', setup);
  if (document.readyState !== 'loading') setup();
}

/** Returns false if `el` was already claimed, so setup code runs once per element. */
export function claim(el: HTMLElement): boolean {
  if (el.dataset.ready) return false;
  el.dataset.ready = 'true';
  return true;
}
