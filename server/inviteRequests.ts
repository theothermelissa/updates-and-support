import { requestSignInLink } from "./auth.js";
import type { Db } from "./db.js";
import { appUrl, inviteRequestEmail, type SendEmail, type SendEmails } from "./email.js";
import { RequestError } from "./errors.js";
import { validNameAndEmail } from "./families.js";
import type { Client } from "./gate.js";
import type { Family, Person } from "./generated/prisma/client.js";
import { createSupporter, inviteRequestCutoff, requireFamilyMember, sendSupporterWelcome } from "./people.js";

export const NETWORK_LIMIT_PER_HOUR = 5;
export const PENDING_CAP = 50;
export const MESSAGE_MAX = 500;
const HOUR = 60 * 60 * 1000;

export type RequestResult = "thanks" | "closed";
export type ApproveResult = { added: true } | { added: false; reason: "supporter" | "family" | "removed" };

// The optional message: trimmed text up to MESSAGE_MAX characters, or null when empty or absent.
export function validMessage(message: unknown): string | null {
  if (message === undefined || message === null) return null;
  if (typeof message !== "string") throw new RequestError(400, "The message must be text.");
  const clean = message.trim();
  if (clean.length > MESSAGE_MAX) {
    throw new RequestError(400, `The message can be up to ${MESSAGE_MAX} characters.`);
  }
  return clean || null;
}

// Someone who isn't in an invite-only family asking to be added. Every outcome but a full
// family replies "thanks", so the reply never says whether the email is known or whether
// anything was stored or sent. The 400 and 403 depend only on what was typed and the family.
export async function requestInvite(
  db: Db,
  send: SendEmail,
  sendMany: SendEmails,
  family: Family,
  client: Client,
  input: { name?: unknown; email?: unknown; message?: unknown },
): Promise<RequestResult> {
  const { name, email } = validNameAndEmail(input.name, input.email);
  const message = validMessage(input.message);
  if (!family.inviteOnly) throw new RequestError(403, "This family isn't invite-only.");

  await db.inviteRequest.deleteMany({ where: { familyId: family.id, createdAt: { lte: inviteRequestCutoff() } } });
  // At the cap the reply depends on nothing the visitor typed, whatever the email is.
  if ((await db.inviteRequest.count({ where: { familyId: family.id } })) >= PENDING_CAP) return "closed";

  const existing = await db.person.findUnique({ where: { familyId_email: { familyId: family.id, email } } });
  if (existing) {
    if (!existing.removedAt) await requestSignInLink(db, send, family.slug, email);
    return "thanks";
  }

  const recent = await db.inviteRequest.count({
    where: { familyId: family.id, network: client.network, createdAt: { gt: new Date(Date.now() - HOUR) } },
  });
  if (recent >= NETWORK_LIMIT_PER_HOUR) return "thanks";

  try {
    await db.inviteRequest.create({
      data: { familyId: family.id, name, email, message, network: client.network },
    });
  } catch (err) {
    // A request for this email is already pending, or was made a moment ago.
    if ((err as { code?: string }).code === "P2002") return "thanks";
    throw err;
  }
  try {
    await notifyInviteRequest(db, sendMany, family);
  } catch (err) {
    console.error(`Invite request email failed at ${family.slug}:`, err);
  }
  return "thanks";
}

// Tells the family's active, opted-in family members that someone asked to join. Nothing
// about the requester goes in the email.
export async function notifyInviteRequest(db: Db, sendMany: SendEmails, family: Family): Promise<void> {
  const members = await db.person.findMany({
    where: { familyId: family.id, role: "family", removedAt: null, email: { not: null }, notificationsOn: true },
    select: { email: true, unsubscribeToken: true },
  });
  const base = `${appUrl()}/f/${family.slug}`;
  await sendMany(
    members.flatMap(({ email, unsubscribeToken }) =>
      email
        ? [
            inviteRequestEmail(email, family.displayName, {
              peoplePage: `${base}/people`,
              unsubscribePage: `${base}/unsubscribe#token=${unsubscribeToken}`,
              oneClickUnsubscribe: `${appUrl()}/api/f/${family.slug}/unsubscribe?token=${unsubscribeToken}`,
            }),
          ]
        : [],
    ),
  );
}

function gone() {
  return new RequestError(404, "That request is gone.");
}

// Adds the requester as a supporter, exactly as "Add supporter" would, and deletes the request.
// The delete comes first, as a claim, so a decline or another approval of the same request
// can't also win. If the email has since joined the family, nothing about that person changes
// and the request is simply cleared.
export async function approveInviteRequest(
  db: Db,
  send: SendEmail,
  person: Person,
  id: string,
): Promise<ApproveResult> {
  requireFamilyMember(person);
  const family = await db.family.findUniqueOrThrow({ where: { id: person.familyId } });
  // Only invite-only families take requests; a row on any other family is not approvable.
  if (!family.inviteOnly) throw gone();
  const mine = { id, familyId: person.familyId, createdAt: { gt: inviteRequestCutoff() } };
  let link;
  let email = "";
  try {
    const outcome = await db.$transaction(async (tx) => {
      const request = await tx.inviteRequest.findFirst({ where: mine });
      if (!request) throw gone();
      const { count } = await tx.inviteRequest.deleteMany({ where: mine });
      if (count === 0) throw gone();
      email = request.email;
      const existing = await tx.person.findUnique({
        where: { familyId_email: { familyId: family.id, email: request.email } },
      });
      if (existing) return existing.removedAt ? ("removed" as const) : existing.role;
      return createSupporter(tx, family, request.name, request.email);
    });
    if (typeof outcome === "string") return { added: false, reason: outcome };
    link = outcome;
  } catch (err) {
    // Someone with this email was added a moment ago. The unique violation aborted the
    // transaction and undid the claim, so clear the request and report who they are.
    if ((err as { code?: string }).code !== "P2002") throw err;
    const existing = await db.person.findUnique({ where: { familyId_email: { familyId: family.id, email } } });
    await db.inviteRequest.deleteMany({ where: { id, familyId: person.familyId } });
    if (!existing) throw err;
    return { added: false, reason: existing.removedAt ? "removed" : existing.role };
  }
  await sendSupporterWelcome(send, family, email, link.token);
  return { added: true };
}

// Deletes a request in the family member's own family and tells no one. Another family's
// requests behave like IDs that don't exist.
export async function declineInviteRequest(db: Db, person: Person, id: string): Promise<void> {
  requireFamilyMember(person);
  const { count } = await db.inviteRequest.deleteMany({ where: { id, familyId: person.familyId } });
  if (count === 0) throw gone();
}
