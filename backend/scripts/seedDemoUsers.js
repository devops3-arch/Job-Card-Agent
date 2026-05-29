import bcrypt from "bcryptjs";
import pool from "../db.js";

const demoUsers = [
  // Engineers
  {
    email: "bijmon@example.com",
    name: "Bijmon Mathai",
    role: "engineer",
    password: "Password123!",
  },
  {
    email: "sinoy@example.com",
    name: "Sinoy Syamalan",
    role: "engineer",
    password: "Password123!",
  },
  {
    email: "fasil@example.com",
    name: "Fasil Musthafa",
    role: "engineer",
    password: "Password123!",
  },
  {
    email: "sameer@example.com",
    name: "Sameer Lambay",
    role: "engineer",
    password: "Password123!",
  },
  // Managers
  {
    email: "nitesh@example.com",
    name: "Nitesh gawali",
    role: "manager",
    password: "Password123!",
  },
  {
    email: "arvind@example.com",
    name: "Arvind kumar Jaiswal",
    role: "manager",
    password: "Password123!",
  },
  {
    email: "mohan@example.com",
    name: "Mohan Krishnan",
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
