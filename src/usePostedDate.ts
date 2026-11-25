import { useState } from "react";
import { earliest, fromLocalInput, photoIds, toLocalInput } from "./photoDate.js";

// The posted-date setting of the post and edit forms (see "Dating an update from its photos" in
// spec/updates.md). `initial` is an update's current date as a datetime-local value when
// editing, null when posting. The value shown is the one set by hand if there is one, else, with
// the box checked, the earliest date among the photos now in `content`, else where it started.
export function usePostedDate(content: unknown, initial: string | null) {
  // Dates read from photos as they were added, by public ID. Null: the photo has none.
  const [dates, setDates] = useState<ReadonlyMap<string, Date | null>>(new Map());
  const [on, setOnState] = useState(false);
  const [byHand, setByHand] = useState<string | null>(null);
  const [fallback, setFallback] = useState(initial ?? "");

  const found = on ? earliest(photoIds(content).map((id) => dates.get(id))) : null;
  const value = byHand ?? (found ? toLocalInput(found) : fallback);
  const date = fromLocalInput(value);

  return {
    on,
    value,
    // Nothing found while the box is checked: said under the checkbox.
    noneFound: on && byHand === null && found === null,
    // A checked box with an empty or impossible date can't be posted.
    invalid: (on || byHand !== null) && date === null,
    setOn(next: boolean) {
      setOnState(next);
      setByHand(null);
      setFallback(initial ?? (next ? toLocalInput(new Date()) : ""));
    },
    setValue: setByHand,
    onPhotoDate(publicId: string, date: Date | null) {
      setDates((current) => new Map(current).set(publicId, date));
    },
    // The date to send: only when it's different from where it started.
    postedAt(): string | undefined {
      if (value === (initial ?? "") || date === null) return undefined;
      return date.toISOString();
    },
    reset() {
      setDates(new Map());
      setOnState(false);
      setByHand(null);
      setFallback(initial ?? "");
    },
  };
}
