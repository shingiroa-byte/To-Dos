# Weekly Workbench — Reminder Service

A small always-on backend for [The Weekly Workbench](../weekly-todo.html) planner.
It stores tasks in Postgres and checks every minute for reminders that are due,
sending a Telegram message when one fires — even if your browser is closed.

## Stack
- Node.js + Express (REST API)
- Postgres (works directly with Supabase, same as WaxUp)
- `node-cron` for the once-a-minute reminder check
- Telegram Bot API for notifications

## 1. Set up the database

Run `schema.sql` once against your Postgres/Supabase database:

```bash
psql "$DATABASE_URL" -f schema.sql
```

Or paste its contents into the Supabase SQL editor.

## 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in `.env` with:
- `DATABASE_URL` — your Supabase pooled connection string
- `TELEGRAM_BOT_TOKEN` — from [@BotFather](https://t.me/BotFather)
- `TELEGRAM_CHAT_ID` — fallback chat to notify if nothing more specific is set
- `TELEGRAM_CHAT_ID_PERSONAL` / `TELEGRAM_CHAT_ID_WORK` — optional, route each
  workspace's reminders to a different chat (e.g. your own DM vs a team group)

**Security note:** `.env` is already in `.gitignore`. Never commit real credentials —
if a token or connection string is ever exposed, rotate it immediately (BotFather
`/revoke` for the bot token, Supabase dashboard for the database password).

## 3. Run locally

```bash
npm install
npm start
```

The API is now live at `http://localhost:3000`.

## 4. API reference

| Method | Path                  | Purpose                              |
|--------|-----------------------|---------------------------------------|
| GET    | `/api/tasks`          | List all tasks, or filter with `?workspace=work` |
| POST   | `/api/tasks`          | Create a task (`workspace`, `day`, `text`, `reminder_time`, `chat_id`) |
| PUT    | `/api/tasks/:id`      | Update text / done / reminder_time / position / workspace |
| DELETE | `/api/tasks/:id`      | Delete a task                         |
| POST   | `/api/tasks/reorder`  | Persist a new drag order (`workspace`, `day`, `orderedIds[]`) |

`workspace` is `"personal"` or `"work"` (defaults to `"personal"` if omitted).
`reminder_time` is a 24h `"HH:MM"` string. `day` is a full weekday name, e.g. `"Monday"`.
Reminder messages are tagged `[Personal]` or `[Work]` so you can tell them apart in Telegram.

## 5. Deploy to Render (same setup as WaxUp)

1. Push this folder to a GitHub repo (see commands below).
2. In Render: **New > Web Service**, connect the repo.
3. Build command: `npm install` — Start command: `npm start`.
4. Add the same environment variables from `.env` in Render's **Environment** tab.
5. Deploy.

**Free-tier note:** Render's free web services spin down after inactivity, which
would pause the cron check. Two easy fixes:
- Use a free uptime pinger (e.g. cron-job.org or UptimeRobot) to hit your service's
  `/` health-check endpoint every 5–10 minutes, keeping it awake.
- Or upgrade to a paid Render instance, which doesn't sleep.

## 6. Push to GitHub

From inside this folder:

```bash
git add .
git commit -m "Initial commit: Weekly Workbench reminder service"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

(Create the empty repo on GitHub first, without a README, so there's no merge conflict.)

## 7. Next step: connect the frontend

Right now `weekly-todo.html` keeps tasks in-memory in the browser. To have it read
from and write to this service instead (so reminders survive a closed tab), the
planner's `fetch`/render logic would point at this API's `/api/tasks` endpoints
instead of the local `state` object. Ask if you'd like that wiring done next.
