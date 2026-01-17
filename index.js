import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   HEALTH + DB
========================= */

app.get("/health", (req, res) => {
  res.json({ status: "Backend running OK" });
});

app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ success: true, time: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================
   INIT DB (RUN ONCE)
========================= */

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
    res.status(500).json({ success: false, error: err.message });
  }
});

/* =========================
   PROJECTS
========================= */

app.post("/projects", async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Project name is required" });
  }

  const id = uuidv4();

  await pool.query(
    "INSERT INTO projects (id, name) VALUES ($1, $2)",
    [id, name]
  );

  res.json({ id, name });
});

app.get("/projects", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM projects ORDER BY created_at DESC"
  );
  res.json(result.rows);
});

/* =========================
   FILES (A8 COMPLETE)
========================= */

/* Load files */
app.get("/projects/:projectId/files", async (req, res) => {
  const { projectId } = req.params;

  const result = await pool.query(
    `
    SELECT id, path, content
    FROM files
    WHERE project_id = $1
    ORDER BY created_at ASC
    `,
    [projectId]
  );

  res.json(result.rows);
});

/* Create new file */
app.post("/projects/:projectId/files/new", async (req, res) => {
  const { projectId } = req.params;
  const { path } = req.body;

  if (!path) {
    return res.status(400).json({ error: "Path is required" });
  }

  const id = uuidv4();

  await pool.query(
    `
    INSERT INTO files (id, project_id, path, content)
    VALUES ($1, $2, $3, '')
    `,
    [id, projectId, path]
  );

  res.json({ id, path, content: "" });
});

/* Update file content */
app.patch("/files/:id", async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;

  if (content === undefined) {
    return res.status(400).json({ error: "Content is required" });
  }

  await pool.query(
    "UPDATE files SET content = $1 WHERE id = $2",
    [content, id]
  );

  res.json({ success: true });
});

/* Rename file */
app.patch("/files/:id/rename", async (req, res) => {
  const { id } = req.params;
  const { path } = req.body;

  if (!path) {
    return res.status(400).json({ error: "Path is required" });
  }

  await pool.query(
    "UPDATE files SET path = $1 WHERE id = $2",
    [path, id]
  );

  res.json({ success: true });
});

/* Delete file */
app.delete("/files/:id", async (req, res) => {
  const { id } = req.params;

  await pool.query("DELETE FROM files WHERE id = $1", [id]);

  res.json({ success: true });
});

/* ========================= */

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
