[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/herzaafril/flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/herzaafril/flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

# Albatross Air Rally

A complete, original flight game that plays offline in a desktop browser from its own static files — no library, no network request, every polygon drawn in code.

Fly the **Kestrel K-9** bush plane over a procedural archipelago: a mountainous main island with a home runway and harbour town, satellite islets, a lighthouse, and open sea. Three sorties, each with a different goal:

1. **Ring Rally** — thread 10 gold rings around the archipelago against the clock, then land back home.
2. **Cargo Drop** — drop parachute crates on three island villages; wind drifts the crate, accuracy scores.
3. **Landing Challenge** — from the downwind leg, land on runway 36 and stop on the strip; graded on touchdown softness and centreline.

Plus free flight. The flight model rewards throttle and turn discipline: a real stall that drops the nose, fuel that burns and runs out, hull damage from heavy arrivals, gear and flaps, and a chase camera that never fights the pilot (cockpit view on `C`).

## Play

Serve `game/` with any static server and open it in desktop Chrome:

```
node serve.ts        # then open http://localhost:8080
```

Controls: arrows pitch & roll, `W`/`S` throttle, `A`/`D` rudder, `G` gear, `F` flaps, `SPACE` drop crate / brake, `C` camera, `P` pause, `M` sound. Mouse steers too; the wheel works the throttle.

## Hand in

`main.ts` (Node 22, standard library only) validates `game/` and `screenshots/` against the bounty gate's caps, copies them to `/output`, and writes `/output/dossier.json` with the vendored make.fun library:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Screenshots are real renders of the game's own code, staged deterministically with `?shot=cover|cargo|landing|dusk&seed=7` (see `shots.json`).

An entry for the make.fun bounty [Make the best flight game](https://make.fun/bounty/best-flight-game-20261126-0057). Original idea, art, sounds and names — no commercial game's names, characters, art, music or levels.
