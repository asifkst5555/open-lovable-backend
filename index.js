import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false,
});

const app = express();
app.use(cors());
app.use(express.json());

/**
 * Health check
 */
app.get("/health", (req, res) => {
  res.json({ status: "Backend running OK" });
});

/**
 * Database connectivity test
 */
app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ success: true, time: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Initialize database tables (run once, then can be removed)
 */
app.get("/init-db", async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS files (
        id UUID PRIMARY KEY,
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Create a new project
 */
app.post("/projects", async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Project name is required" });
  }

  const id = uuidv4();

  try {
    await pool.query(
      "INSERT INTO projects (id, name) VALUES ($1, $2)",
      [id, name]
    );

    res.json({ id, name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * List all projects
 */
app.get("/projects", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM projects ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
