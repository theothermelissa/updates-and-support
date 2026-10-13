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

export type PersonView = { id: string; name: string; role: "family" | "supporter"; notificationsOn: boolean; emailVerified: boolean };
export type Me = { family: { displayName: string }; person: PersonView };
