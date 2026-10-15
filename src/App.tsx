import { useEffect } from "react";
import { api } from "./api.js";
import { FamilyHome } from "./pages/FamilyHome.js";
import { FamilySignIn } from "./pages/FamilySignIn.js";
import { NotFound } from "./pages/NotFound.js";
import { People } from "./pages/People.js";
import { SignIn } from "./pages/SignIn.js";
import { Unsubscribe } from "./pages/Unsubscribe.js";
import { Verify } from "./pages/Verify.js";

// Routes on the path. A handful of routes don't justify a router dependency.
export function App() {
  const match = location.pathname.match(/^\/f\/([a-z0-9-]+)(?:\/(family|sign-in|verify|unsubscribe|people))?\/?$/);
  useFamilyTitle(match?.[1]);
  if (!match) return <NotFound />;
  const [, slug, page] = match as unknown as [string, string, string | undefined];
  if (page === "family") return <FamilySignIn slug={slug} />;
  if (page === "sign-in") return <SignIn slug={slug} />;
  if (page === "verify") return <Verify slug={slug} />;
  if (page === "unsubscribe") return <Unsubscribe slug={slug} />;
  if (page === "people") return <People slug={slug} />;
  return <FamilyHome slug={slug} />;
}

// Titles the browser tab with the family's display name on its pages. The gate shows that
// name to anyone at the address, so the tab reveals nothing more. Other pages keep the
// title from index.html.
function useFamilyTitle(slug: string | undefined) {
  useEffect(() => {
    if (!slug) return;
    api<{ displayName?: string }>(slug, "gate").then(({ status, data }) => {
      if (status === 200 && data?.displayName) document.title = data.displayName;
    });
  }, [slug]);
}
