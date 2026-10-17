import type { Db } from "./db.js";
import { appUrl, helpOfferEmail, type SendEmails } from "./email.js";
import { RequestError } from "./errors.js";
import { isValidEmail, normalizeEmail, validName } from "./families.js";
import { Prisma, type Person } from "./generated/prisma/client.js";
import { requireFamilyMember } from "./people.js";
import { validPhone } from "./phone.js";
import { docFromText, shownContent, textOf, validDoc } from "./richText.js";
import type { Doc } from "../src/lib/doc.js";

const MAX_BODY = 2_000;
const MAX_SLOTS = 99;
const MAX_REQUESTS = 100;
const MESSAGE_LIMITS = { noun: "message", maxText: 2_000 } as const;

// What a viewer sees of an offer. A supporter gets only their own offer, with no email or
// phone. Family members get every offer, with the email when there is one, a supporter's
// phone when they have one, and the offer's id so they can remove it. Never a person's id.
// A null name is an offer made without one.
export type HelpOfferView = {
  id: string | null;
  name: string | null;
  mine: boolean;
  email: string | null;
  phone: string | null;
};

export type HelpRequestView = {
  id: string;
  body: string;
  // Null means as many people as want to may offer.
  slots: number | null;
  requireName: boolean;
  requireEmail: boolean;
  requirePhone: boolean;
  // As typed: "YYYY-MM-DD" and "HH:MM", with no time zone.
  date: string | null;
  time: string | null;
  full: boolean;
  // How many active offers there are, including any the viewer can't see.
  offered: number;
  offers: HelpOfferView[];
};

const requestInclude = (familyId: string) =>
  ({
    offers: {
      where: { person: { familyId, removedAt: null } },
      select: {
        id: true,
        personId: true,
        email: true,
        createdAt: true,
        person: { select: { name: true, email: true, phone: true, role: true } },
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
    requireName: request.requireName,
    requireEmail: request.requireEmail,
    requirePhone: request.requirePhone,
    date: request.date,
    time: request.time,
    full: request.slots !== null && offers.length >= request.slots,
    offered: offers.length,
    offers: visible.map((offer) => ({
      id: family ? offer.id : null,
      name: offer.person.name,
      mine: offer.personId === viewer.id,
      // An offer has its own email only when the person had none on their record.
      email: family ? (offer.email ?? offer.person.email) : null,
      phone: family && offer.person.role === "supporter" ? offer.person.phone : null,
    })),
  };
}

export async function hasHelpRequests(db: Db, familyId: string): Promise<boolean> {
  const count = await db.helpRequest.count({ where: { familyId } });
  return count > 0;
}

// The family's message at the top of How to help: the introduction (message), and the "Do"
// and "Don't" parts, each a document or null. Read by the person's own family rather than the
// family loaded from the address, which a redirect can point elsewhere. An introduction written
// before formatting has only its text, which shownContent converts.
export type HelpMessage = { message: Doc | null; dos: Doc | null; donts: Doc | null };

export async function helpMessage(db: Db, person: Person): Promise<HelpMessage> {
  const family = await db.family.findUniqueOrThrow({
    where: { id: person.familyId },
    select: { helpMessage: true, helpMessageContent: true, helpDo: true, helpDont: true },
  });
  return {
    message: family.helpMessage === null ? null : shownContent(family.helpMessageContent, family.helpMessage),
    dos: (family.helpDo as Doc | null) ?? null,
    donts: (family.helpDont as Doc | null) ?? null,
  };
}

export function hasHelpMessage(message: HelpMessage): boolean {
  return message.message !== null || message.dos !== null || message.donts !== null;
}

// A family member writes or changes the message. Each of content (the introduction), dos, and
// donts is a document, null to remove that part, or left out to keep it as it is. Pages loaded
// before formatting send { message } as plain text for the introduction; empty removes it.
// Every part is checked before any is saved. The introduction's plain text is stored beside it.
export async function setHelpMessage(
  db: Db,
  person: Person,
  input: { content?: unknown; dos?: unknown; donts?: unknown; message?: unknown },
): Promise<HelpMessage> {
  requireFamilyMember(person);
  let intro = messagePart(input.content);
  if (input.content === undefined && typeof input.message === "string") {
    const text = input.message.trim();
    intro = text ? messagePart(docFromText(text)) : null;
  }
  const dos = messagePart(input.dos);
  const donts = messagePart(input.donts);
  if (intro === undefined && dos === undefined && donts === undefined) {
    throw new RequestError(400, "Expected the message's content");
  }
  const data: Prisma.FamilyUpdateInput = {};
  if (intro !== undefined) {
    data.helpMessage = intro ? textOf(intro) : null;
    data.helpMessageContent = intro ?? Prisma.DbNull;
  }
  if (dos !== undefined) data.helpDo = dos ?? Prisma.DbNull;
  if (donts !== undefined) data.helpDont = donts ?? Prisma.DbNull;
  await db.family.update({ where: { id: person.familyId }, data });
  return helpMessage(db, person);
}

// One part as sent: undefined to keep it, null to remove it, or a checked document.
function messagePart(input: unknown): Doc | null | undefined {
  if (input === undefined || input === null) return input;
  return validDoc(input, undefined, undefined, MESSAGE_LIMITS);
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

function validFlag(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new RequestError(400, `Expected ${label}: true or false`);
  return value;
}

// A real calendar date as "YYYY-MM-DD", or null (an empty field sends "").
function validDate(value: unknown): string | null {
  if (value === null || value === "") return null;
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (match) {
    const [y, m, d] = match.slice(1).map(Number) as [number, number, number];
    const check = new Date(Date.UTC(y, m - 1, d));
    if (check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d) return value as string;
  }
  throw new RequestError(400, "Please enter a valid date.");
}

// "HH:MM" on a 24-hour clock, or null. A time needs a date.
function validTime(value: unknown, date: string | null): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new RequestError(400, "Please enter a valid time.");
  }
  if (date === null) throw new RequestError(400, "A time needs a date.");
  return value;
}

type RequestInput = {
  body?: unknown;
  slots?: unknown;
  requireName?: unknown;
  requireEmail?: unknown;
  requirePhone?: unknown;
  date?: unknown;
  time?: unknown;
};

// Every field is required, so a page from before a field existed can't clear it by leaving it out.
function validRequest(input: RequestInput) {
  const fields = [input.requireName, input.requireEmail, input.requirePhone, input.date, input.time];
  if (fields.includes(undefined)) throw new RequestError(400, "This page is out of date. Please refresh it and try again.");
  const date = validDate(input.date);
  return {
    body: validBody(input.body),
    slots: validSlots(input.slots),
    requireName: validFlag(input.requireName, "requireName"),
    requireEmail: validFlag(input.requireEmail, "requireEmail"),
    requirePhone: validFlag(input.requirePhone, "requirePhone"),
    date,
    time: validTime(input.time, date),
  };
}

export async function createHelp(db: Db, person: Person, input: RequestInput): Promise<HelpRequestView> {
  requireFamilyMember(person);
  const data = validRequest(input);
  const existing = await db.helpRequest.count({ where: { familyId: person.familyId } });
  if (existing >= MAX_REQUESTS) throw new RequestError(400, `A family can have at most ${MAX_REQUESTS} requests.`);
  const request = await db.helpRequest.create({
    data: { familyId: person.familyId, ...data },
    include: requestInclude(person.familyId),
  });
  return view(request, person);
}

export async function updateHelp(
  db: Db,
  person: Person,
  id: string,
  input: RequestInput,
): Promise<HelpRequestView> {
  requireFamilyMember(person);
  const data = validRequest(input);
  const { count } = await db.helpRequest.updateMany({
    where: { id, familyId: person.familyId },
    data,
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
// can't take the last place. A name is asked for only when the request requires one and the
// person has none; an email only when the request requires one and the person has none on
// their record, and it's kept on the offer alone; a phone only on a new offer, when the request
// requires one and the person is a supporter with none, and it goes on their record. All are
// checked before anything is written.
// A new offer on a numbered request emails the other family members, with no request text;
// a failed email leaves the offer in place.
export async function offerHelp(
  db: Db,
  send: SendEmails | undefined,
  person: Person,
  requestId: string,
  input: { helping?: unknown; name?: unknown; email?: unknown; phone?: unknown },
): Promise<{ name: string }> {
  if (typeof input.helping !== "boolean") throw new RequestError(400, "Expected helping: true or false");
  const outcome = await db.$transaction(async (tx) => {
    const [request] = await tx.$queryRaw<
      { id: string; slots: number | null; requireName: boolean; requireEmail: boolean; requirePhone: boolean }[]
    >`
      SELECT id, slots, "requireName", "requireEmail", "requirePhone" FROM "HelpRequest"
      WHERE id = ${requestId} AND "familyId" = ${person.familyId}
      FOR UPDATE`;
    if (!request) throw new RequestError(404, "Request not found");

    const [author] = await tx.$queryRaw<
      { name: string | null; email: string | null; phone: string | null; role: "family" | "supporter" }[]
    >`
      SELECT name, email, phone, role FROM "Person"
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
        where: { requestId, person: { familyId: person.familyId, removedAt: null } },
      });
      if (taken >= request.slots) throw new RequestError(409, "Someone else just took this");
    }

    const newName = !author.name && request.requireName ? validName(input.name) : null;
    const email = !already && request.requireEmail && !author.email ? validOfferEmail(input.email) : null;
    const askPhone = !already && request.requirePhone && author.role === "supporter" && !author.phone;
    const newPhone = askPhone ? validPhone(input.phone) : null;
    if (askPhone && !newPhone) throw new RequestError(400, "Please enter a phone number.");
    const name = author.name ?? newName ?? "";
    if (newName || newPhone) {
      await tx.person.update({
        where: { id: person.id },
        data: { ...(newName && { name: newName }), ...(newPhone && { phone: newPhone }) },
      });
    }
    if (already) return { name, notify: false };

    await tx.helpOffer.create({ data: { requestId, personId: person.id, email } });
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

function validOfferEmail(email: unknown): string {
  const clean = typeof email === "string" ? normalizeEmail(email) : "";
  if (!isValidEmail(clean)) throw new RequestError(400, "Please enter a valid email address.");
  return clean;
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
