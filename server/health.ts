export type Health = { ok: boolean; database: "up" | "down" };

// Anything that can run a trivial query. Prisma's client satisfies this; tests can pass a fake.
export type Pingable = { $queryRaw: (query: TemplateStringsArray) => Promise<unknown> };

export async function checkHealth(db: Pingable): Promise<Health> {
  try {
    await db.$queryRaw`SELECT 1`;
    return { ok: true, database: "up" };
  } catch {
    return { ok: false, database: "down" };
  }
}
