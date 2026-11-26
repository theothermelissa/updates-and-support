// A small wrapper over fetch for the family API. Returns the status with the parsed body.
export async function api<T>(
  slug: string,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(`/api/f/${slug}/${path}`, {
    method: options.method ?? "GET",
    headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = res.headers.get("content-type")?.includes("application/json") ? await res.json() : null;
  return { status: res.status, data: data as T };
}

import type { PeopleGroup } from "@/components/groups";
import type { InviteRequest } from "@/components/inviteRequests";

export type PeopleSupporter = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
  notificationsOn: boolean;
  joinedAt: string;
  removedAt: string | null;
};
export type PeopleFamilyMember = { id: string; name: string; email: string; isYou: boolean };
// What GET people returns. An admin gets everything; any other family member gets only the two lists.
export type PeopleData =
  | {
      admin: true;
      familyMembers: (PeopleFamilyMember & { isAdmin: boolean })[];
      supporters: PeopleSupporter[];
      removed: PeopleSupporter[];
      devicesWithoutVerifiedEmail: number;
      question: string;
      acceptedAnswers: string[];
      noteReactions: string[];
      allowNotesByDefault: boolean;
      privacyNotice: string | null;
      publicUpdatesOn: boolean;
      publicNotice: string | null;
      // How many updates are public now, for the confirmation before turning public updates off.
      publicUpdateCount: number;
      // Sorted by name.
      groups: PeopleGroup[];
      // Invite-only families only; empty otherwise. Oldest first.
      inviteRequests: InviteRequest[];
    }
  | { admin: false; familyMembers: PeopleFamilyMember[]; supporters: PeopleSupporter[] };

// A supporter who has only answered the question has no name or email yet.
export type PersonView = {
  id: string;
  name: string | null;
  email: string | null;
  // Supporters only; only ever sent to its own person and to family members.
  phone: string | null;
  role: "family" | "supporter";
  // Family members only; admins manage people and settings (spec/access.md "Admins").
  isAdmin: boolean;
  notificationsOn: boolean;
  emailVerified: boolean;
};
// photos: what "Add photo" does in the editor. "real" uploads to Cloudinary; "placeholder"
// draws a grey box; "off" hides the button.
export type Me = {
  family: {
    displayName: string;
    photos: "real" | "placeholder" | "off";
    // Supporters see "How to help" once either is true.
    hasHelpRequests: boolean;
    hasHelpMessage: boolean;
    // The family's wording for the privacy banner; null for the standard wording.
    privacyNotice: string | null;
    // No community question: only people the family added can read, and every update names its
    // audience. Set when the family is created and never changes.
    inviteOnly: boolean;
    // Family members only: whether an admin may make an update public.
    publicUpdates?: boolean;
  };
  person: PersonView;
};
