# Backtests on the flight log

These scripts produced the measurements in `AGENTS.md` ("Što baza može predvidjeti"). The code they test is no longer in the app, so each one runs against the commit named below. They end in `.txt` so that the tests, the linter and the build skip them.

| Script | What it measures | Run on commit |
|---|---|---|
| `schedule-forecast.test.ts.txt` | Predicting single flights: Upcoming opportunities, the old next-pass method and Where to stand | `4435cc0` |
| `sky-density.test.ts.txt` | Sky density model against simpler models, without the visible-Moon filter | `4435cc0` |
| `sky-density-slots.test.ts.txt` | Expected and real transits per half-hour for a Moon that can be shot. The thresholds and fortnight totals come from this | `a86bb11` |

All three predict each of six 14-day periods from the 30 days before it, then compare with the positions logged during the period. They use the default observer and fixed dates. Edit `END` and the list of days to cover newer data.

## 1. Copy the production log

Run this from the project root. It needs the SSH settings from `.env`. Do not read the database on the server: a long read blocks the poller's writes.

```bash
mkdir -p /tmp/lunapic-backtest/data
```

```bash
set -a; source .env; set +a; rsync -az --inplace "$SSH_USER@$SSH_HOST:LunaPic/data/flight-log.db" /tmp/lunapic-backtest/data/flight-log.db
```

The database changes during the first copy, so that file is usually damaged. A damaged copy does not fail loudly: the session read returns an empty result and whole periods silently drop out. Repeat the same `rsync`, which takes seconds, until this prints `ok`:

```bash
sqlite3 -readonly /tmp/lunapic-backtest/data/flight-log.db "pragma quick_check(1);"
```

## 2. Run a script

Use a separate worktree, so the commit does not disturb your working copy.

```bash
git worktree add /tmp/lunapic-bt a86bb11
```

```bash
cp scripts/backtests/sky-density-slots.test.ts.txt /tmp/lunapic-bt/src/lib/domain/flightlog/zzslots.test.ts
```

`sky-density-slots` also needs the arc helper, which only exists on the older commit:

```bash
git show 4435cc0:src/lib/domain/geometry/sky-separation.ts | sed 's#from "./wgs84"#from "@/lib/domain/geometry/wgs84"#' > /tmp/lunapic-bt/src/lib/domain/flightlog/zzarc.ts
```

Then, in the worktree, with its dependencies linked:

```bash
ln -s "$PWD/node_modules" /tmp/lunapic-bt/node_modules
```

```bash
cd /tmp/lunapic-bt && BT_DIR=/tmp/lunapic-backtest npx vitest run src/lib/domain/flightlog/zzslots.test.ts --testTimeout=1800000
```

The results go to `$BT_DIR`: `result.json`, `density-useful.json` or `slots.json`, depending on the script. `sky-density` needs no arc helper on `4435cc0`.

## What to watch for

- **Count only what can be photographed.** The first density measurement skipped the Sun and the Moon's phase, and looked good on transits nobody could shoot.
- **Rank with fixed thresholds.** Ranking inside a period makes the best of a quiet fortnight look good.
- **Compare with a simple model.** Ranking by time of day alone already holds 42 % of transits in the top quarter of half-hours.
- **Thresholds were chosen on the same data they were measured on,** and only 26 transits count. Check any new rule on newer periods.
