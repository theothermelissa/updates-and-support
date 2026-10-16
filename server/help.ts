import type { Db } from "./db.js";
import { appUrl, helpOfferEmail, type SendEmails } from "./email.js";
import { RequestError } from "./errors.js";
import { validName } from "./families.js";
import type { Person, Prisma } from "./generated/prisma/client.js";
import { requireFamilyMember } from "./people.js";

const MAX_BODY = 2_000;
const MAX_SLOTS = 99;
const MAX_REQUESTS = 100;

// What a viewer sees of an offer. A supporter gets only their own offer. Family members get
// every offer, with the email when there is one and the offer's id so they can remove it.
// Never a person's id.
export type HelpOfferView = {
  id: string | null;
  name: string;
  mine: boolean;
  email: string | null;
};

export type HelpRequestView = {
  id: string;
  body: string;
  // Null means as many people as want to may offer.
  slots: number | null;
  full: boolean;
  // How many active offers there are, including any the viewer can't see.
  offered: number;
  offers: HelpOfferView[];
};

const requestInclude = (familyId: string) =>
  ({
    offers: {
      where: { person: { familyId, removedAt: null, name: { not: null } } },
      select: {
        id: true,
        personId: true,
        createdAt: true,
        person: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    },
  }) satisfies Prisma.HelpRequestInclude;

type LoadedRequest = Prisma.HelpRequestGetPayload<{ include: ReturnType<typeof requestInclude> }>;

function view(request: LoadedRequest, viewer: Person): HelpRequestView {
  const offers = [...request.offers].sort((a, b) => {
    const mine = Number(b.personId === viewer.id) - Number(a.personId === viewer.id);
    if (mine !== 0) return mine;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  const family = viewer.role === "family";
  // Supporters don't see who else offered, so offering doesn't invite comparison.
  const visible = family ? offers : offers.filter((offer) => offer.personId === viewer.id);
  return {
    id: request.id,
    body: request.body,
    slots: request.slots,
    full: request.slots !== null && offers.length >= request.slots,
    offered: offers.length,
    offers: visible.map((offer) => ({
      id: family ? offer.id : null,
      name: offer.person.name ?? "",
      mine: offer.personId === viewer.id,
      email: family ? offer.person.email : null,
    })),
  };
}

export async function hasHelpRequests(db: Db, familyId: string): Promise<boolean> {
  const count = await db.helpRequest.count({ where: { familyId } });
  return count > 0;
}

export async function listHelp(db: Db, person: Person): Promise<HelpRequestView[]> {
  const requests = await db.helpRequest.findMany({
    where: { familyId: person.familyId },
    orderBy: { createdAt: "asc" },
    include: requestInclude(person.familyId),
  });
  return requests.map((request) => view(request, person));
}

async function loadOne(db: Db, person: Person, id: string): Promise<HelpRequestView | null> {
  const request = await db.helpRequest.findFirst({
    where: { id, familyId: person.familyId },
    include: requestInclude(person.familyId),
  });
  return request ? view(request, person) : null;
}

function validBody(body: unknown): string {
  const clean = typeof body === "string" ? body.trim() : "";
  if (clean.length < 1 || clean.length > MAX_BODY) {
    throw new RequestError(400, `A request must be 1 to ${MAX_BODY.toLocaleString("en-US")} characters.`);
  }
  return clean;
}

// Null is "many people." Anything else has to be a whole number of places.
function validSlots(slots: unknown): number | null {
  if (slots === null) return null;
  if (typeof slots !== "number" || !Number.isInteger(slots) || slots < 1 || slots > MAX_SLOTS) {
    throw new RequestError(400, `Say how many people can help: from 1 to ${MAX_SLOTS}, or as many as want to.`);
  }
  return slots;
}

export async function createHelp(
  db: Db,
  person: Person,
  input: { body?: unknown; slots?: unknown },
): Promise<HelpRequestView> {
  requireFamilyMember(person);
  const body = validBody(input.body);
  const slots = validSlots(input.slots);
  const existing = await db.helpRequest.count({ where: { familyId: person.familyId } });
  if (existing >= MAX_REQUESTS) throw new RequestError(400, `A family can have at most ${MAX_REQUESTS} requests.`);
  const request = await db.helpRequest.create({
    data: { familyId: person.familyId, body, slots },
    include: requestInclude(person.familyId),
  });
  return view(request, person);
}

export async function updateHelp(
  db: Db,
  person: Person,
  id: string,
  input: { body?: unknown; slots?: unknown },
): Promise<HelpRequestView> {
  requireFamilyMember(person);
  const body = validBody(input.body);
  const slots = validSlots(input.slots);
  const { count } = await db.helpRequest.updateMany({
    where: { id, familyId: person.familyId },
    data: { body, slots },
  });
  if (count === 0) throw new RequestError(404, "Request not found");
  const request = await loadOne(db, person, id);
  if (!request) throw new RequestError(404, "Request not found");
  return request;
}

export async function deleteHelp(db: Db, person: Person, id: string): Promise<void> {
  requireFamilyMember(person);
  const { count } = await db.helpRequest.deleteMany({ where: { id, familyId: person.familyId } });
  if (count === 0) throw new RequestError(404, "Request not found");
}

// A family member removes someone else's offer, or their own. Another family's offer
// behaves like one that doesn't exist.
export async function removeOffer(db: Db, person: Person, requestId: string, offerId: string): Promise<void> {
  requireFamilyMember(person);
  const { count } = await db.helpOffer.deleteMany({
    where: { id: offerId, request: { id: requestId, familyId: person.familyId } },
  });
  if (count === 0) throw new RequestError(404, "Offer not found");
}

// The signed-in person offers, or withdraws. A numbered request locks its row so two people
// can't take the last place. A new offer on a numbered request emails the other family members,
// with no request text; a failed email leaves the offer in place.
export async function offerHelp(
  db: Db,
  send: SendEmails | undefined,
  person: Person,
  requestId: string,
  input: { helping?: unknown; name?: unknown },
): Promise<{ name: string }> {
  if (typeof input.helping !== "boolean") throw new RequestError(400, "Expected helping: true or false");
  const outcome = await db.$transaction(async (tx) => {
    const [request] = await tx.$queryRaw<{ id: string; slots: number | null }[]>`
      SELECT id, slots FROM "HelpRequest"
      WHERE id = ${requestId} AND "familyId" = ${person.familyId}
      FOR UPDATE`;
    if (!request) throw new RequestError(404, "Request not found");

    const [author] = await tx.$queryRaw<{ name: string | null }[]>`
      SELECT name FROM "Person"
      WHERE id = ${person.id} AND "familyId" = ${person.familyId} AND "removedAt" IS NULL
      FOR UPDATE`;
    if (!author) throw new RequestError(403, "You can't offer help here");

    if (!input.helping) {
      await tx.helpOffer.deleteMany({ where: { requestId, personId: person.id } });
      return { name: author.name ?? "", notify: false };
    }

    const already = await tx.helpOffer.findUnique({
      where: { requestId_personId: { requestId, personId: person.id } },
    });
    if (!already && request.slots !== null) {
      const taken = await tx.helpOffer.count({
        where: { requestId, person: { familyId: person.familyId, removedAt: null, name: { not: null } } },
      });
      if (taken >= request.slots) throw new RequestError(409, "Someone else just took this");
    }

    const name = author.name ?? validName(input.name);
    if (!author.name) await tx.person.update({ where: { id: person.id }, data: { name } });
    if (already) return { name, notify: false };

    await tx.helpOffer.create({ data: { requestId, personId: person.id } });
    return { name, notify: request.slots !== null };
  });

  if (outcome.notify && send) {
    try {
      await emailFamily(db, send, person.familyId, person.id);
    } catch (err) {
      console.error(`Help offer email failed for family ${person.familyId}: ${(err as Error).message}`);
    }
  }
  return { name: outcome.name };
}

async function emailFamily(db: Db, send: SendEmails, familyId: string, exceptPersonId: string) {
  const family = await db.family.findUniqueOrThrow({
    where: { id: familyId },
    include: {
      people: {
        where: { role: "family", removedAt: null, email: { not: null }, id: { not: exceptPersonId } },
        select: { email: true },
      },
    },
  });
  const link = `${appUrl()}/f/${family.slug}/help`;
  await send(
    family.people.flatMap(({ email }) => (email ? [helpOfferEmail(email, family.displayName, link)] : [])),
  );
}
