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

  async function setNotifications(on: boolean) {
    const { status, data } = await api<{ person: Me["person"] }>(slug, "notifications", {
      method: "POST",
      body: { on },
    });
    if (status === 200 && typeof me === "object") setMe({ ...me, person: data.person });
  }

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
        {me.person.role === "family" && (
          <>
            {" "}
            <a href={`/f/${slug}/people`}>People</a>
          </>
        )}
      </p>
      {me.person.role === "supporter" && (
        <p>
          <label>
            <input
              type="checkbox"
              checked={me.person.notificationsOn}
              onChange={(e) => setNotifications(e.target.checked)}
            />{" "}
            Email me when there's a new update
          </label>
          {me.person.notificationsOn && !me.person.emailVerified && (
            <>
              <br />
              Emails start once you confirm your address: look for a "Confirm your email" message, or sign in
              by email once.
            </>
          )}
        </p>
      )}
      <Feed slug={slug} canEdit={me.person.role === "family"} />
    </main>
  );
}
