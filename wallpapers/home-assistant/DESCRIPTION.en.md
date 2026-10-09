# Home Assistant

A [Home Assistant](https://www.home-assistant.io) panel: sensors, lights and switches as tiles.
Lights and switches can be toggled from the app.

## Install

Copy `wallpaper.lua` to the SD card as `/sd/wallpaper.lua` and connect to Wi-Fi in Keira.
At the top of the script set:

- `HA_HOST`: your Home Assistant IP address (`.local` names usually don't work),
- `HA_TOKEN`: a long-lived access token (Profile → Security → Long-lived access tokens),
- `ENTITIES`: your entity IDs and names. More than 6 entities are shown on pages.

Without a token the panel shows demo data. States refresh every 15 seconds, in the app and on the wallpaper
(wallpapers need a recent Keira with network modules). The last values are saved in `ha.txt`.

## Controls (app only)

- **Arrows** — Select a tile.
- **A** — Toggle light or switch.
- **B** — Refresh.
- **START** — Exit.
