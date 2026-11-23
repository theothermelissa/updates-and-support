// Who can see an update, as the server sends it to family members only. Supporters never
// receive an update's audience or the family's groups.

export type Group = { id: string; name: string };

// "everyone", or the groups it's shared with, sorted by name. No groups: family members only.
export type Audience = "everyone" | { groups: Group[] };

// What Post settings' "Who can see this" holds. ids are the checked groups, kept while another
// choice is selected so switching back finds them. "family" is offered only while it's the
// update's current audience; the post form never starts there.
export type AudienceChoice = { mode: "everyone" | "groups" | "family"; ids: string[] };

export const EVERYONE: AudienceChoice = { mode: "everyone", ids: [] };

export function choiceFor(audience: Audience | undefined): AudienceChoice {
  if (!audience || audience === "everyone") return EVERYONE;
  if (audience.groups.length === 0) return { mode: "family", ids: [] };
  return { mode: "groups", ids: audience.groups.map((g) => g.id) };
}

// The checked groups that still exist, so a group gone since the form opened isn't sent.
export function chosenIds(choice: AudienceChoice, groups: Group[]): string[] {
  return choice.ids.filter((id) => groups.some((g) => g.id === id));
}

// Whether the choice can be posted or saved: "Only these groups" needs at least one checked.
export function canShare(choice: AudienceChoice, groups: Group[]): boolean {
  return choice.mode !== "groups" || chosenIds(choice, groups).length > 0;
}

// The request's `audience`. Family members only is never sent: it's kept by leaving it out.
export function audienceBody(choice: AudienceChoice, groups: Group[]): "everyone" | { groups: string[] } | undefined {
  if (choice.mode === "everyone") return "everyone";
  if (choice.mode === "groups") return { groups: chosenIds(choice, groups) };
  return undefined;
}

// The `audience` to send with an edit, or undefined when it hasn't changed.
export function changedAudience(from: AudienceChoice, to: AudienceChoice, groups: Group[]) {
  if (from.mode === to.mode) {
    if (to.mode !== "groups") return undefined;
    const ids = chosenIds(to, groups);
    if (ids.length === from.ids.length && ids.every((id) => from.ids.includes(id))) return undefined;
  }
  return audienceBody(to, groups);
}

// The feed's muted line for family members, or null for an update shared with everyone.
export function audienceLabel(audience: Audience | undefined): string | null {
  if (!audience || audience === "everyone") return null;
  if (audience.groups.length === 0) return "Family members only";
  return `Shared with ${audience.groups.map((g) => g.name).join(", ")}`;
}
