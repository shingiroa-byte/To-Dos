-- Run this once against your Postgres/Supabase database before starting the service.

CREATE TABLE IF NOT EXISTS tasks (
  id             SERIAL PRIMARY KEY,
  workspace      TEXT NOT NULL DEFAULT 'personal', -- 'personal' or 'work'
  day            TEXT NOT NULL,             -- 'Monday' .. 'Sunday'
  text           TEXT NOT NULL,
  done           BOOLEAN DEFAULT FALSE,
  position       INTEGER DEFAULT 0,         -- for drag-reorder within a day
  reminder_time  TEXT,                      -- 'HH:MM' 24h, nullable
  reminder_sent  BOOLEAN DEFAULT FALSE,
  chat_id        TEXT,                      -- Telegram chat ID to notify; falls back to the workspace's default chat ID env var if null
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_workspace_day ON tasks (workspace, day);
CREATE INDEX IF NOT EXISTS idx_tasks_reminder ON tasks (workspace, day, reminder_time, reminder_sent);
