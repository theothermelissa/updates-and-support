import { useEffect, useState } from "react";
import { api } from "./api.js";
import { FamilyHome } from "./pages/FamilyHome.js";
import { FamilySignIn } from "./pages/FamilySignIn.js";
import { NotFound } from "./pages/NotFound.js";
import { People } from "./pages/People.js";
import { SignIn } from "./pages/SignIn.js";
import { Unsubscribe } from "./pages/Unsubscribe.js";
import { Verify } from "./pages/Verify.js";

const FAMILY_PATH = /^\/f\/([a-z0-9-]+)(?:\/(family|sign-in|verify|unsubscribe|people))?\/?$/;

// Routes on the path. A handful of routes don't justify a router dependency.
export function App() {
  if (location.pathname === "/") return <Root />;
  const match = location.pathname.match(FAMILY_PATH);
  if (!match) return <NotFound />;
  const [, slug, page] = match as unknown as [string, string, string | undefined];
  return <FamilyPage slug={slug} page={page} />;
}

// The site's root shows one family's home page, if the deployment names one.
function Root() {
  const [slug, setSlug] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/root").then(
      async (res) => setSlug(res.ok ? ((await res.json()) as { slug: string }).slug : null),
      () => setSlug(null),
    );
  }, []);
  if (slug === undefined) return null;
  if (slug === null) return <NotFound />;
  return <FamilyPage slug={slug} />;
}

// Looks up the family's address first. A page at an old address moves to the same page at the
// family's current one, keeping a link's token after the "#". Otherwise the browser tab takes
// the family's display name, which the gate shows to anyone at the address anyway.
function FamilyPage({ slug, page }: { slug: string; page?: string }) {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    api<{ displayName?: string; slug?: string }>(slug, "gate").then(
      ({ status, data }) => {
        const moved = status === 200 && data?.slug && data.slug !== slug;
        if (moved && location.pathname.startsWith(`/f/${slug}`)) {
          location.replace(location.pathname.replace(`/f/${slug}`, `/f/${data.slug}`) + location.hash);
          return;
        }
        if (status === 200 && data?.displayName) document.title = data.displayName;
        setCurrent(moved ? data.slug! : slug);
      },
      () => setCurrent(slug),
    );
  }, [slug]);
  if (!current) return null;
  if (page === "family") return <FamilySignIn slug={current} />;
  if (page === "sign-in") return <SignIn slug={current} />;
  if (page === "verify") return <Verify slug={current} />;
  if (page === "unsubscribe") return <Unsubscribe slug={current} />;
  if (page === "people") return <People slug={current} />;
  return <FamilyHome slug={current} />;
}
