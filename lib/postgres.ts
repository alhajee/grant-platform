import { Client, type QueryResultRow } from "pg";

export function getPostgres() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and start the PostgreSQL container.");
  }

  // The preview uses the Workers runtime, where sockets belong to one request.
  // A global pool can hand a later request an unusable socket after a refresh.
  return {
    async transaction<T>(run: (client: Client) => Promise<T>) {
      const client = new Client({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 10000 });
      try {
        await client.connect();
        await client.query("BEGIN");
        const result = await run(client);
        await client.query("COMMIT");
        return result;
      } catch (cause) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw cause;
      } finally {
        await client.end();
      }
    },
    async query<Row extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]) {
      const client = new Client({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 10000 });
      try {
        await client.connect();
        return await client.query<Row>(sql, values);
      } finally {
        await client.end();
      }
    },
  };
}
