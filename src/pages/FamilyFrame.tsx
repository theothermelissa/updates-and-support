import { useEffect, useState } from "react";
import { FamilyShell, type FamilyPage } from "@/components/familyShell";
import { PrivacyBanner } from "@/components/privacyBanner";
import { api, type Me } from "../api.js";
import { navigate } from "../navigate.js";
import { FamilyHome } from "./FamilyHome.js";
import { Gate } from "./Gate.js";
import { Help } from "./Help.js";
import { NotFound } from "./NotFound.js";
import { People } from "./People.js";
import { Wall } from "./Wall.js";

// What each family page gets from the frame: who is signed in, and ways to change it.
export type FamilyPageProps = {
  slug: string;
  home: string;
  me: Me;
  setMe: (me: Me) => void;
  reloadMe: () => void;
  onSignedOut: () => void;
};

// The family's pages under one navigation bar, which stays mounted while the reader moves
// between them; only the content below it changes. Who is signed in is loaded once, here.
// Each page still loads its own data, and the server decides what it may see.
export function FamilyFrame({ slug, home, page }: { slug: string; home: string; page: FamilyPage }) {
  const [me, setMe] = useState<Me | "loading" | "signed-out" | "not-found">("loading");

  function load() {
    api<Me>(slug, "me").then(({ status, data }) => {
      if (status === 200) setMe(data);
      else setMe(status === 404 ? "not-found" : "signed-out");
    });
  }

  useEffect(load, [slug]);

  // Signed out on any page but Updates: move to Updates, which shows the gate.
  useEffect(() => {
    if (me === "signed-out" && page !== "updates") navigate(home, { replace: true });
  }, [me, page, home]);

  if (me === "loading") return null;
  if (me === "not-found") {
    return (
      <>
        <PrivacyBanner />
        <NotFound />
      </>
    );
  }
  if (me === "signed-out") {
    if (page !== "updates") return null;
    return (
      <>
        <PrivacyBanner />
        <Gate slug={slug} onJoined={load} />
      </>
    );
  }

  const props: FamilyPageProps = { slug, home, me, setMe, reloadMe: load, onSignedOut: () => setMe("signed-out") };
  return (
    <>
      <PrivacyBanner text={me.family.privacyNotice} />
      <FamilyShell
        slug={slug}
        home={home}
        me={me}
        page={page}
        column={page === "help" || page === "people"}
        noCopy={page !== "people"}
        onPersonChanged={load}
      >
        {page === "updates" && <FamilyHome {...props} />}
        {page === "help" && <Help {...props} />}
        {page === "notes" && <Wall {...props} />}
        {page === "people" && <People {...props} />}
      </FamilyShell>
    </>
  );
}
