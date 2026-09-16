# Team UAE schedule — WorldSkills Shanghai 2026

Tablet-first board for the team leader: every competitor's day at a glance, lunch slots vs. the
team's allocated lunch, finish times, and a shared "this got delayed" override that all devices see.

Hidden from search engines three ways: `<meta name="robots" content="noindex…">`, `/robots.txt`
(`Disallow: /`), and an `X-Robots-Tag` header on every response.

## Run it

```bash
cp .env.example .env      # set EDIT_PASSCODE
docker compose up --build -d
```

The app listens on port 8080. Point your reverse proxy (Caddy/nginx/Traefik) for
`mahmoud-schedule.mikkaiser.com` at it and terminate TLS there.

### Production (mikaserver22)

Pushing to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): it validates the
data and publishes `ghcr.io/mikkaiser/mahmoud-schedule:latest`. The server has no inbound key —
a cron job runs `deploy.sh` every 2 minutes, which pulls the image and recreates the container only
when it changed. Layout on the server: `/root/projects/mahmoud-schedule` (clone of this repo + `.env`),
overrides in `/root/server/db-volumes/mahmoud-schedule/store`, vhost in `/root/server/nginx/default.conf`.

```bash
# manual deploy / first run
bash deploy.sh
```

## Using it

- **Board** — one row per person, hour grid, red line at the current Shanghai time. Amber blocks are
  the skill's lunch break; the thin amber outline underneath is the team's allocated lunch slot.
  Tap any block for details. Add it to the iPad home screen for a full-screen view.
- **Now** — cards sorted by whoever changes state soonest: what they're doing, what's next, lunch
  vs. allocated ("fits" / "partly outside lunch" / "outside lunch break"), finish time.
- **Person** — one competitor's full day. Shareable link, e.g. `/#/C1/person/maitha`.

**Changing a time**: tap the lock → enter the passcode → tap a block → shift it (quick buttons or
time pickers) → *Save time*. The official time stays visible, struck through, and every open device
picks the change up within a minute. *Reset to official* removes it.

Testing the live view on another day: append `?now=2026-09-23T12:10` to the URL.

## Updating the data

Timetables live as plain text in `data/src/` — one file per day (`C-2.txt`, `C1.txt`, …) with
`@person-id` blocks and `HH:MM-HH:MM Title` lines. People and dates are in `data/src/meta.json`.
Mahmoud's own timetable goes in `data/src/leader.txt` under the `[C1]`-style day headers.

After editing:

```bash
node scripts/build-data.js && node scripts/validate-data.js
docker compose up --build -d
```

Notes on the transcription from the official PDFs (`schedules/`):

- Aircraft Maintenance and Health & Social Care list every group's rotation; those are merged into
  one "rotation" block per slot.
- Some skills published only the allocated lunch for a day (Industrial Control most days, Welding C3,
  Automobile and Car Painting on C-2). They show as "no timetable published".
- Event categories (competing / briefing / lunch / …) are inferred from titles in
  `scripts/build-data.js` (`KIND_RULES`).

## Layout

```
server.js          Express: static files + /api (schedule, overrides, unlock)
data/src/          editable timetable sources
data/*.json        generated — don't edit by hand
public/            the app (no build step): app.js, views/, lib/, styles.css
store/             runtime overrides (Docker volume)
```
