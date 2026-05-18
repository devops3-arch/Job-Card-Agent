import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pool from "../db.js";
import logger from "../services/logger/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, "..", "migrations");

const MIGRATION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  migration_name TEXT UNIQUE NOT NULL,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;

const log = (message) => logger.info(message, { eventType: "migration" });

const ensureMigrationTable = async (client) => {
  await client.query(MIGRATION_TABLE_SQL);
};

const getAppliedMigrations = async (client) => {
  const result = await client.query(`SELECT migration_name FROM schema_migrations ORDER BY migration_name`);
  return new Set(result.rows.map((row) => row.migration_name));
};

const loadMigrationFiles = async () => {
  const files = await fs.readdir(migrationsDir);
  return files
    .filter((file) => file.endsWith(".sql"))
    .sort();
};

const runMigration = async (client, fileName, sql) => {
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO schema_migrations (migration_name) VALUES ($1)`,
      [fileName]
    );
    await client.query("COMMIT");
    log(`Completed ${fileName}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
};

const main = async () => {
  const client = await pool.connect();
  try {
    await ensureMigrationTable(client);
    const appliedMigrations = await getAppliedMigrations(client);
    const migrationFiles = await loadMigrationFiles();

    if (migrationFiles.length === 0) {
      log("No migration files found in migrations folder.");
      return;
    }

    for (const fileName of migrationFiles) {
      if (appliedMigrations.has(fileName)) {
        log(`Skipped ${fileName} (already applied)`);
        continue;
      }

      const filePath = path.join(migrationsDir, fileName);
      const sql = await fs.readFile(filePath, "utf8");
      log(`Running ${fileName}`);
      await runMigration(client, fileName, sql);
    }

    log("All pending migrations completed.");
  } catch (err) {
    logger.error("Migration failed", {
      eventType: "migration",
      error: err.message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

main();
