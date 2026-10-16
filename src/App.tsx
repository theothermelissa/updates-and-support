import { useEffect, useState } from "react";
import { FamilyFrame } from "./pages/FamilyFrame.js";
import { api } from "./api.js";
import { usePath } from "./navigate.js";
import { FamilySignIn } from "./pages/FamilySignIn.js";
import { NotFound } from "./pages/NotFound.js";
import { SignIn } from "./pages/SignIn.js";
import { Unsubscribe } from "./pages/Unsubscribe.js";
import { Verify } from "./pages/Verify.js";

const FAMILY_PATH = /^\/f\/([a-z0-9-]+)(?:\/(family|sign-in|verify|unsubscribe|people|wall|help))?\/?$/;

// Routes on the path. A handful of routes don't justify a router dependency. Every family
// page renders through the same FamilyPage, so moving between them in the app keeps it mounted.
export function App() {
  const path = usePath();
  const rootSlug = useRootSlug(path === "/");
  if (path === "/") {
    if (rootSlug === undefined) return null;
    if (rootSlug === null) return <NotFound />;
    return <FamilyPage slug={rootSlug} />;
  }
  const match = path.match(FAMILY_PATH);
  if (!match) return <NotFound />;
  const [, slug, page] = match as unknown as [string, string, string | undefined];
  return <FamilyPage slug={slug} page={page} />;
}

// The site's root shows one family's home page, if the deployment names one.
function useRootSlug(needed: boolean) {
  const [slug, setSlug] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!needed || slug !== undefined) return;
    fetch("/api/root").then(
      async (res) => setSlug(res.ok ? ((await res.json()) as { slug: string }).slug : null),
      () => setSlug(null),
    );
  }, [needed, slug]);
  return slug;
}

// Looks up the family first, and moves the page to where it lives, keeping a link's token after
// the "#": the home page to the family's home (the site's root, for the root family), and any
// other page to the family's current address. Then the browser tab takes the family's display
// name, which the gate shows to anyone at the address anyway. This happens once per family, not
// on each move between its pages, whose links already use its current address.
function FamilyPage({ slug, page }: { slug: string; page?: string }) {
  const [family, setFamily] = useState<{ slug: string; home: string } | null>(null);
  useEffect(() => {
    setFamily(null);
    api<{ displayName?: string; slug?: string; home?: string }>(slug, "gate").then(
      ({ status, data }) => {
        if (status !== 200 || !data?.slug) return setFamily({ slug, home: `/f/${slug}` });
        const home = data.home ?? `/f/${data.slug}`;
        const target = page ? `/f/${data.slug}/${page}` : home;
        if (withoutTrailingSlash(location.pathname) !== withoutTrailingSlash(target)) {
          location.replace(target + location.hash);
          return;
        }
        if (data.displayName) document.title = data.displayName;
        setFamily({ slug: data.slug, home });
      },
      () => setFamily({ slug, home: `/f/${slug}` }),
    );
    // Only on a change of family: see above.
  }, [slug]);
  if (!family) return null;
  if (page === "family") return <FamilySignIn slug={family.slug} />;
  if (page === "sign-in") return <SignIn slug={family.slug} />;
  if (page === "verify") return <Verify slug={family.slug} />;
  if (page === "unsubscribe") return <Unsubscribe slug={family.slug} />;
  const shown = page === "people" ? "people" : page === "wall" ? "notes" : page === "help" ? "help" : "updates";
  return <FamilyFrame slug={family.slug} home={family.home} page={shown} />;
}

function withoutTrailingSlash(path: string) {
  return path.length > 1 ? path.replace(/\/$/, "") : path;
}
