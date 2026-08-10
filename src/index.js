import express from "express";
import cors from "cors";
import cron from "node-cron";
import dotenv from "dotenv";
import { pool } from "./db.js";
import { sendTelegramMessage } from "./telegram.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WORKSPACES = ["personal", "work"];

// Falls back: workspace-specific env var -> TELEGRAM_CHAT_ID -> null
function defaultChatIdFor(workspace) {
  if (workspace === "work") {
    return process.env.TELEGRAM_CHAT_ID_WORK || process.env.TELEGRAM_CHAT_ID || null;
  }
  return process.env.TELEGRAM_CHAT_ID_PERSONAL || process.env.TELEGRAM_CHAT_ID || null;
}

// ---------- Health check ----------
// Also useful as an external "keep-alive" ping target on free hosting tiers
// that spin services down after inactivity (see README).
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "weekly-workbench-reminder-service" });
});

// ---------- List tasks ----------
app.get("/api/tasks", async (req, res) => {
  const { workspace } = req.query; // optional filter: ?workspace=work
  try {
    const { rows } = workspace
      ? await pool.query(
          "SELECT * FROM tasks WHERE workspace = $1 ORDER BY day, position, id",
          [workspace]
        )
      : await pool.query("SELECT * FROM tasks ORDER BY workspace, day, position, id");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Create task ----------
app.post("/api/tasks", async (req, res) => {
  const { workspace = "personal", day, text, reminder_time, chat_id, position } = req.body;
  if (!day || !text) {
    return res.status(400).json({ error: "day and text are required" });
  }
  if (!WORKSPACES.includes(workspace)) {
    return res.status(400).json({ error: `workspace must be one of: ${WORKSPACES.join(", ")}` });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO tasks (workspace, day, text, reminder_time, chat_id, position)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [workspace, day, text, reminder_time || null, chat_id || null, position || 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Update task (text, done, reminder_time, position, chat_id) ----------
app.put("/api/tasks/:id", async (req, res) => {
  const { id } = req.params;
  const allowedFields = ["text", "done", "reminder_time", "position", "chat_id", "workspace"];
  const updates = [];
  const values = [];
  let i = 1;

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = $${i}`);
      values.push(req.body[field]);
      i++;
    }
  }
  // Changing the reminder time re-arms it so it can fire again.
  if (req.body.reminder_time !== undefined) {
    updates.push("reminder_sent = false");
  }
  if (updates.length === 0) {
    return res.status(400).json({ error: "nothing to update" });
  }

  values.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE tasks SET ${updates.join(", ")} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: "task not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Delete task ----------
app.delete("/api/tasks/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM tasks WHERE id = $1", [req.params.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Reorder tasks within a day (drag-and-drop persistence) ----------
app.post("/api/tasks/reorder", async (req, res) => {
  const { workspace = "personal", day, orderedIds } = req.body; // orderedIds: array of task ids, new order
  if (!day || !Array.isArray(orderedIds)) {
    return res.status(400).json({ error: "day and orderedIds[] are required" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let pos = 0; pos < orderedIds.length; pos++) {
      await client.query(
        "UPDATE tasks SET position = $1 WHERE id = $2 AND day = $3 AND workspace = $4",
        [pos, orderedIds[pos], day, workspace]
      );
    }
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ---------- Reminder loop ----------
// Runs every minute. Looks for tasks whose reminder_time matches "now"
// for today's weekday, hasn't fired yet, and isn't already done.
cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();
    const currentDay = DAYS[now.getDay()];
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const currentHM = `${hh}:${mm}`;

    const { rows } = await pool.query(
      `SELECT * FROM tasks
       WHERE day = $1 AND reminder_time = $2 AND reminder_sent = false AND done = false`,
      [currentDay, currentHM]
    );

    for (const task of rows) {
      const chatId = task.chat_id || defaultChatIdFor(task.workspace);
      if (!chatId) {
        console.warn(
          `Task ${task.id} (${task.workspace}) has a reminder but no chat_id and no default chat ID configured for that workspace — skipping.`
        );
        continue;
      }
      const label = task.workspace === "work" ? "Work" : "Personal";
      try {
        await sendTelegramMessage(chatId, `⏰ [${label}] Reminder — ${task.day}: ${task.text}`);
        await pool.query("UPDATE tasks SET reminder_sent = true WHERE id = $1", [task.id]);
        console.log(`Sent ${label} reminder for task ${task.id} (${task.text})`);
      } catch (err) {
        console.error(`Failed to send reminder for task ${task.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("Reminder check failed:", err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Reminder service listening on port ${PORT}`);
});
