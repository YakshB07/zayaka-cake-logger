    # 🎂 Zayaka Cake Logger

    A fast, sleek cake-order logger for **Zayaka Bakes n' Bites** — log every custom cake in seconds, never miss a pickup.

    ## What it does

    - **Log a cake in seconds** — customer, size (4"–12" or custom/tiered), flavour (your full menu built in, with menu prices pre-filled), pickup date & time, price discussed, writing on the cake, design notes.
    - **Design photos** — drag & drop reference pictures right onto the form.
    - **Payments** — track the pre-payment (amount + cash / e-transfer / card) and the app calculates the balance due at pickup and how it'll be paid.
    - **Text reminders** — 2 days before, 1 day before, and the morning of pickup, a reminder text goes to **226-961-0140** and **226-961-0150** with all the cake details. There's also a "Text now" button on every order.
    - **Dashboard** — upcoming cakes sorted by pickup, "coming up" alerts for the next 2 days, search, and one-tap "Mark picked up".

    ## Running it

    You need [Node.js](https://nodejs.org) (v20+). Then, in this folder:

    ```bash
    npm install     # first time only
    npm run dev     # starts the app
    ```

    Open **http://localhost:5173** in your browser. Orders and photos are saved on your computer in `server/data/` and `server/uploads/`.

    For everyday use (a single, faster server on http://localhost:3001):

    ```bash
    npm start
    ```

    > ⚠️ The reminder texts are sent by the little server this app runs — the computer (or a small host like Render/Railway) needs to be **on** at 9:00 AM for the daily reminder check to fire. It also catches up on missed reminders whenever it starts.

    ## Turning on real SMS texts

    Without setup, reminders still appear in the app and in the server console — but to get actual texts:

    1. Create a [Twilio](https://www.twilio.com) account and get a phone number (~$1.50/mo + ~1¢/text).
    2. Copy `.env.example` to `.env` and fill in `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.
    3. Restart the app. The yellow banner disappears and texts start flowing.

    On a Twilio **trial** account you must first verify 226-961-0140 and 226-961-0150 as allowed recipients in the Twilio console (Verified Caller IDs).

    ## Going live (free hosting)

    GitHub Pages can only host static pages — it can't run the server that saves orders and sends texts, so this app deploys to **Render** (free web hosting that runs a real server) with **Supabase** (free Postgres + file storage) so orders and photos survive restarts.

    1. **Supabase** (free) — create a project at [supabase.com](https://supabase.com).
       - *Project Settings → Database → Connection string (URI)* → this is `DATABASE_URL`.
       - *Project Settings → API* → copy the Project URL (`SUPABASE_URL`) and the `service_role` key (`SUPABASE_SERVICE_KEY`).
       - *Storage* → create a bucket named `cake-photos`, mark it **Public**.
    2. **Render** (free) — [render.com](https://render.com) → New → Blueprint → connect this GitHub repo (it reads `render.yaml` automatically). When prompted, fill in the env vars from step 1, plus a random string for `CRON_SECRET`, plus your Twilio values if you have them.
    3. **GitHub Actions** (free) — this repo's `.github/workflows/reminders.yml` pings the app at 9am so reminder texts still fire even if Render's free tier has put the app to sleep. In the repo's Settings → Secrets and variables → Actions:
       - Add secret `CRON_SECRET` (same value as on Render).
       - Add variable `RENDER_URL` (your Render service's URL, e.g. `https://zayaka-cake-logger.onrender.com`).
    4. If you already had test orders locally, run `npx tsx scripts/migrate-to-supabase.ts` once (with `.env` filled in) to copy them into Supabase.

    Render's free tier spins the app down after 15 minutes idle, so the very first visit of the day (or the 9am reminder ping) can take ~30 seconds to wake back up — that's normal.

    ## Tech

    React + TypeScript + Vite frontend · Express + node-cron backend · JSON file storage (no database to manage) · Brand colours & fonts matched to zayakabakesnbites.com.
