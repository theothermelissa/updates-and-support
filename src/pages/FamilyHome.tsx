import { useEffect, useState } from "react";
import { api, type Me } from "../api.js";
import { Feed } from "./Feed.js";
import { Gate } from "./Gate.js";
import { NotFound } from "./NotFound.js";

export function FamilyHome({ slug }: { slug: string }) {
  const [me, setMe] = useState<Me | "loading" | "signed-out" | "not-found">("loading");

  function load() {
    api<Me>(slug, "me").then(({ status, data }) => {
      if (status === 200) setMe(data);
      else setMe(status === 404 ? "not-found" : "signed-out");
    });
  }

  useEffect(load, [slug]);

  async function signOut() {
    await api(slug, "auth/sign-out", { method: "POST" });
    setMe("signed-out");
  }

  if (me === "loading") return null;
  if (me === "not-found") return <NotFound />;
  if (me === "signed-out") return <Gate slug={slug} onJoined={load} />;
  return (
    <main>
      <h1>{me.family.displayName}</h1>
      <p>
        Signed in as {me.person.name}. <button onClick={signOut}>Sign out</button>
      </p>
      <Feed slug={slug} canEdit={me.person.role === "family"} />
    </main>
  );
}
