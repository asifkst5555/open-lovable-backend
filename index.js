import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
import { v4 as uuidv4 } from "uuid";
import archiver from "archiver";

dotenv.config();

const { Pool } = pkg;

/* =========================
   DB
========================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

/* =========================
   APP
========================= */

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   HEALTH
========================= */

app.get("/health", (_, res) => {
  res.json({ status: "Backend running OK" });
});

app.get("/db-test", async (_, res) => {
  try {
    const r = await pool.query("SELECT NOW()");
    res.json({ success: true, time: r.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

/* =========================
   INIT DB (RUN ONCE)
========================= */

app.get("/init-db", async (_, res) => {
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
});

/* =========================
   PROJECTS
========================= */

app.post("/projects", async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Name required" });

  const id = uuidv4();
  await pool.query(
    "INSERT INTO projects (id, name) VALUES ($1, $2)",
    [id, name]
  );

  res.json({ id, name });
});

app.get("/projects", async (_, res) => {
  const r = await pool.query(
    "SELECT * FROM projects ORDER BY created_at DESC"
  );
  res.json(r.rows);
});

/* =========================
   FILES (A8)
========================= */

app.get("/projects/:projectId/files", async (req, res) => {
  const r = await pool.query(
    `SELECT id, path, content FROM files WHERE project_id = $1`,
    [req.params.projectId]
  );
  res.json(r.rows);
});

app.post("/projects/:projectId/files/new", async (req, res) => {
  const { path } = req.body;
  if (!path) return res.status(400).json({ error: "Path required" });

  const id = uuidv4();
  await pool.query(
    `INSERT INTO files (id, project_id, path, content)
     VALUES ($1, $2, $3, '')`,
    [id, req.params.projectId, path]
  );

  res.json({ id, path, content: "" });
});

app.patch("/files/:id", async (req, res) => {
  if (req.body.content === undefined)
    return res.status(400).json({ error: "Content required" });

  await pool.query(
    "UPDATE files SET content = $1 WHERE id = $2",
    [req.body.content, req.params.id]
  );

  res.json({ success: true });
});

app.delete("/files/:id", async (req, res) => {
  await pool.query("DELETE FROM files WHERE id = $1", [req.params.id]);
  res.json({ success: true });
});

/* =========================
   A10 — DOWNLOAD ZIP ✅
========================= */

app.get("/projects/:projectId/download", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT path, content FROM files WHERE project_id = $1`,
      [req.params.projectId]
    );

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=project-${req.params.projectId}.zip`
    );

    const archive = archiver("zip");
    archive.pipe(res);

    r.rows.forEach((f) => {
      archive.append(f.content, { name: f.path });
    });

    await archive.finalize();
  } catch (e) {
    console.error("ZIP ERROR:", e);
    res.status(500).json({ error: "Failed to generate ZIP" });
  }
});

/* ========================= */

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("Backend running on port", PORT);
});
