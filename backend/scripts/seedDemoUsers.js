import bcrypt from "bcryptjs";
import pool from "../db.js";

const demoUsers = [
  {
    email: "engineer@example.com",
    name: "Demo Engineer",
    role: "engineer",
    password: "Password123!",
  },
  {
    email: "manager@example.com",
    name: "Demo Manager",
    role: "manager",
    password: "Password123!",
  },
];

const main = async () => {
  const client = await pool.connect();
  try {
    for (const user of demoUsers) {
      const existing = await client.query("SELECT id FROM users WHERE email = $1", [user.email]);
      if (existing.rows.length > 0) {
        console.log(`Skipping existing user: ${user.email}`);
        continue;
      }

      const hashedPassword = await bcrypt.hash(user.password, 10);
      await client.query(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, $3, $4)`,
        [user.name, user.email, hashedPassword, user.role]
      );
      console.log(`Created demo user: ${user.email} / ${user.password}`);
    }
  } catch (err) {
    console.error("Failed to seed demo users:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

main();
