import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getDb } from "../../../../server/db.js";
import {
  familyContext,
  jsonBody,
  methodNotAllowed,
  param,
  sendRequestError,
  unauthorized,
} from "../../../../server/http.js";
import { addGroupMember, deleteGroup, removeGroupMember, renameGroup } from "../../../../server/groups.js";

const CHANGES = ["name", "add", "remove"] as const;

// PATCH: a family member renaming a group ({ name }), or adding ({ add: personId }) or removing
// ({ remove: personId }) a member, one at a time. DELETE: deleting it ({ moveTo: groupIds }),
// where the updates shared only with it get the groups in moveTo, or family members only if empty.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PATCH" && req.method !== "DELETE") return methodNotAllowed(res);
  const body = jsonBody(req, res);
  if (!body) return;
  const ctx = await familyContext(getDb(), req, res);
  if (!ctx) return;
  if (!ctx.person) return unauthorized(res);
  const id = param(req, "id");
  try {
    if (req.method === "DELETE") {
      await deleteGroup(getDb(), ctx.person, id, body.moveTo);
      return res.status(200).json({ ok: true });
    }
    const changes = CHANGES.filter((key) => key in body);
    if (changes.length !== 1) return res.status(400).json({ error: "Send one of name, add, or remove" });
    if ("name" in body) await renameGroup(getDb(), ctx.person, id, body.name);
    else if ("add" in body) await addGroupMember(getDb(), ctx.person, id, body.add);
    else await removeGroupMember(getDb(), ctx.person, id, body.remove);
    res.status(200).json({ ok: true });
  } catch (err) {
    sendRequestError(res, err);
  }
}
