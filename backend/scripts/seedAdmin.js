import bcrypt from "bcryptjs";
import pool from "../db.js";

const adminUser = {
  email: "admin@example.com",
  name: "Administrator",
  role: "admin",
  password: "AdminPassword123!",
};

const main = async () => {
  const client = await pool.connect();
  try {
    const existing = await client.query("SELECT id FROM users WHERE email = $1", [adminUser.email]);
    if (existing.rows.length > 0) {
      console.log(`Skipping existing admin user: ${adminUser.email}`);
      return;
    }

    const hashedPassword = await bcrypt.hash(adminUser.password, 10);
    await client.query(
      `INSERT INTO users (name, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, TRUE)`,
      [adminUser.name, adminUser.email, hashedPassword, adminUser.role]
    );
    console.log(`Created admin user: ${adminUser.email} / ${adminUser.password}`);
  } catch (err) {
    console.error("Failed to seed admin user:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

main();
