import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
const userId = "00000000-0000-4000-8000-000000000001";
const insert = `insert into public.vast_deployments
  (id,user_id,model,state,hourly_usd,gpu_name,tls_cert,expires_at)
  values ($1,$2,'kz-vast-qwen','creating',0.2,'RTX 4090','public-cert',now()+interval '1 hour')`;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.users(id uuid primary key);
    insert into public.users values ('${userId}');`);
  const migration = await readFile(new URL("../supabase/vast.sql", import.meta.url), "utf8");
  await db.exec(migration);
  await db.exec(migration); // Existing installations can safely reapply it.
}, 20_000);
afterAll(async () => { if (db) await db.close(); });

describe("GPU lease migration on PostgreSQL", () => {
  it("prevents two live leases for the same owner and permits a new one after release", async () => {
    const first = "10000000-0000-4000-8000-000000000001";
    const second = "10000000-0000-4000-8000-000000000002";
    await db.query(insert, [first, userId]);
    await expect(db.query(insert, [second, userId])).rejects.toMatchObject({ code: "23505" });
    await db.query("update public.vast_deployments set state='terminated' where id=$1", [first]);
    await db.query(insert, [second, userId]);
    expect((await db.query("select id from public.vast_deployments where state='creating'")).rows).toHaveLength(1);
  });
  it.each(["anon", "authenticated"])("denies %s direct reading and manipulation of leases", async role => {
    await db.exec(`set role ${role}`);
    try {
      await expect(db.query("select * from public.vast_deployments")).rejects.toMatchObject({ code: "42501" });
      await expect(db.query("update public.vast_deployments set state='terminated'")).rejects.toMatchObject({ code: "42501" });
    } finally { await db.exec("reset role"); }
  });
  it("grants lease management only to service_role and retains owners while leases exist", async () => {
    await db.exec("set role service_role");
    try { expect((await db.query("select * from public.vast_deployments")).rows.length).toBeGreaterThan(0); }
    finally { await db.exec("reset role"); }
    await expect(db.query("delete from public.users where id=$1", [userId])).rejects.toMatchObject({ code: "23001" });
  });
});
