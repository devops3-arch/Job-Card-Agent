import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
    })
  : new Pool({
      host: process.env.PGHOST ?? "localhost",
      port: Number(process.env.PGPORT ?? 5432),
      database: process.env.PGDATABASE ?? "newjobcard",
      user: process.env.PGUSER ?? "postgres",
      password: process.env.PGPASSWORD ?? "0000",
    });

export default pool;