import pkg from "pg";
import dotenv from "dotenv";
import logger from "./services/logger/logger.js";

dotenv.config();

const { Pool } = pkg;

// keepAlive stops idle pooled sockets from going stale behind NAT/firewall
// idle timeouts, which is what makes managed Postgres reset them.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
      keepAlive: true,
    })
  : new Pool({
      host: process.env.PGHOST ?? "localhost",
      port: Number(process.env.PGPORT ?? 5432),
      database: process.env.PGDATABASE ?? "newjobcard",
      user: process.env.PGUSER ?? "postgres",
      password: process.env.PGPASSWORD ?? "0000",
      keepAlive: true,
    });

// Errors on IDLE clients have no query to reject into, so without this listener
// they surface as an uncaughtException — and the worker manager's global handler
// responds by killing the whole process. The pool discards the broken client and
// opens a fresh one on the next query, so logging and continuing is correct.
pool.on("error", (err) => {
  logger.error({ err, code: err?.code }, "Idle Postgres client error — client discarded, pool will reconnect");
});

export default pool;