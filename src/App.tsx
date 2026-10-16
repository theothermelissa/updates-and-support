import { useEffect, useState } from "react";
import { api } from "./api.js";
import { FamilyHome } from "./pages/FamilyHome.js";
import { Help } from "./pages/Help.js";
import { FamilySignIn } from "./pages/FamilySignIn.js";
import { NotFound } from "./pages/NotFound.js";
import { People } from "./pages/People.js";
import { SignIn } from "./pages/SignIn.js";
import { Unsubscribe } from "./pages/Unsubscribe.js";
import { Verify } from "./pages/Verify.js";
import { Wall } from "./pages/Wall.js";

const FAMILY_PATH = /^\/f\/([a-z0-9-]+)(?:\/(family|sign-in|verify|unsubscribe|people|wall|help))?\/?$/;

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

// Looks up the family first, and moves the page to where it lives, keeping a link's token after
// the "#": the home page to the family's home (the site's root, for the root family), and any
// other page to the family's current address. Then the browser tab takes the family's display
// name, which the gate shows to anyone at the address anyway.
function FamilyPage({ slug, page }: { slug: string; page?: string }) {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    api<{ displayName?: string; slug?: string; home?: string }>(slug, "gate").then(
      ({ status, data }) => {
        if (status !== 200 || !data?.slug) return setCurrent(slug);
        const target = page ? `/f/${data.slug}/${page}` : (data.home ?? `/f/${data.slug}`);
        if (withoutTrailingSlash(location.pathname) !== withoutTrailingSlash(target)) {
          location.replace(target + location.hash);
          return;
        }
        if (data.displayName) document.title = data.displayName;
        setCurrent(data.slug);
      },
      () => setCurrent(slug),
    );
  }, [slug, page]);
  if (!current) return null;
  if (page === "family") return <FamilySignIn slug={current} />;
  if (page === "sign-in") return <SignIn slug={current} />;
  if (page === "verify") return <Verify slug={current} />;
  if (page === "unsubscribe") return <Unsubscribe slug={current} />;
  if (page === "people") return <People slug={current} />;
  if (page === "wall") return <Wall slug={current} />;
  if (page === "help") return <Help slug={current} />;
  return <FamilyHome slug={current} />;
}

function withoutTrailingSlash(path: string) {
  return path.length > 1 ? path.replace(/\/$/, "") : path;
}
