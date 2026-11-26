import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { emoji } from "../reactions.js";
import { RichText } from "../richText.js";

// What the server sends a visitor who isn't signed in for each public update (server/publicUpdates.ts).
export type PublicUpdateData = {
  id: string;
  content: unknown;
  createdAt: string;
  reactions: { count: number; kinds: string[] };
};

// The family's public updates, under the family's name, read-only: no names, notes, or buttons.
export function PublicUpdates({ displayName, updates }: { displayName: string; updates: PublicUpdateData[] }) {
  if (updates.length === 0) return null;
  return (
    <section className="mx-auto max-w-2xl space-y-4 px-4 pb-8" aria-labelledby="public-updates">
      <h2 id="public-updates" className="text-xl font-semibold tracking-tight">
        Public updates
      </h2>
      {updates.map((update) => (
        <Card key={update.id}>
          <CardHeader>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{displayName}</span> ·{" "}
              {new Date(update.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </CardHeader>
          <CardContent className="text-base">
            <RichText doc={update.content} />
          </CardContent>
          {update.reactions.count > 0 && (
            <CardFooter className="gap-2 text-sm text-muted-foreground">
              <span aria-hidden>{update.reactions.kinds.slice(0, 3).map(emoji).join("")}</span>
              <span>
                {update.reactions.count} {update.reactions.count === 1 ? "reaction" : "reactions"}
              </span>
            </CardFooter>
          )}
        </Card>
      ))}
    </section>
  );
}
