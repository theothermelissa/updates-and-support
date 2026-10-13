import { FamilyHome } from "./pages/FamilyHome.js";
import { FamilySignIn } from "./pages/FamilySignIn.js";
import { NotFound } from "./pages/NotFound.js";
import { SignIn } from "./pages/SignIn.js";
import { Unsubscribe } from "./pages/Unsubscribe.js";
import { Verify } from "./pages/Verify.js";

// Routes on the path. A handful of routes don't justify a router dependency.
export function App() {
  const match = location.pathname.match(/^\/f\/([a-z0-9-]+)(?:\/(family|sign-in|verify|unsubscribe))?\/?$/);
  if (!match) return <NotFound />;
  const [, slug, page] = match as unknown as [string, string, string | undefined];
  if (page === "family") return <FamilySignIn slug={slug} />;
  if (page === "sign-in") return <SignIn slug={slug} />;
  if (page === "verify") return <Verify slug={slug} />;
  if (page === "unsubscribe") return <Unsubscribe slug={slug} />;
  return <FamilyHome slug={slug} />;
}
