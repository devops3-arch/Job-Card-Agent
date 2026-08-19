/**
 * Refuses to start the end-to-end run against anything but a local database.
 *
 * This guard is not paranoia. backend/.env sets DATABASE_URL to the Azure
 * production database, and dotenv will happily supply it to a server started
 * without an explicit override. These specs create, submit and approve job cards,
 * so a misconfigured run would write that traffic into production data. The check
 * is deliberately dependency-free and runs before any server or spec.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);

const describeTarget = (raw: string): string => {
  try {
    const url = new URL(raw);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return "an unparseable connection string";
  }
};

export default function globalSetup(): void {
  const raw =
    process.env.E2E_DATABASE_URL ?? "postgresql://shivampandey@localhost:5432/jobcard_dev";

  let hostname: string;
  try {
    hostname = new URL(raw).hostname;
  } catch {
    throw new Error(
      `E2E_DATABASE_URL is not a valid connection string, so the target database cannot be verified as local. Refusing to run.`,
    );
  }

  if (!LOCAL_HOSTS.has(hostname)) {
    throw new Error(
      [
        `Refusing to run the end-to-end suite against ${describeTarget(raw)}.`,
        ``,
        `These specs write job cards, so they must only ever run against a local`,
        `database. The host resolved to "${hostname}", which is not local.`,
        ``,
        `If a local database really is what you meant, set E2E_DATABASE_URL to it`,
        `explicitly — for example:`,
        `  E2E_DATABASE_URL=postgresql://localhost:5432/jobcard_dev npm run test:e2e`,
      ].join("\n"),
    );
  }

  // Also guard the variable the server itself would fall back to.
  const pgHost = process.env.PGHOST;
  if (pgHost && !LOCAL_HOSTS.has(pgHost)) {
    throw new Error(
      `PGHOST is set to "${pgHost}", which is not local. Refusing to run the end-to-end suite.`,
    );
  }
}
