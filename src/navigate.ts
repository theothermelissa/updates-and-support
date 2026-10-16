import { useEffect, useState, type MouseEvent } from "react";

// Moving between pages without a page load, so the family's navigation bar stays in place.
// Back and Forward fire popstate; navigate() fires the same event so one listener hears both.

export function navigate(href: string, options?: { replace?: boolean }) {
  if (options?.replace) history.replaceState(null, "", href);
  else history.pushState(null, "", href);
  window.scrollTo(0, 0);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const follow = () => setPath(location.pathname);
    window.addEventListener("popstate", follow);
    return () => window.removeEventListener("popstate", follow);
  }, []);
  return path;
}

// The click handler for links within the app. A modified or non-left click is left to the
// browser, so opening in a new tab still works. A link to the current page does nothing.
export function followLink(event: MouseEvent<HTMLAnchorElement>) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const href = event.currentTarget.getAttribute("href")!;
  if (new URL(href, location.href).pathname !== location.pathname) navigate(href);
}
