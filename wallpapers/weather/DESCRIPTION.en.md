# Weather

Current weather from [Open-Meteo](https://open-meteo.com) as an animated scene
(sun, clouds, rain, snow, fog, storm) with a 4-day forecast.

## Install

Copy `wallpaper.lua` to the SD card as `/sd/wallpaper.lua`. Connect to Wi-Fi in Keira,
then open `/sd/wallpaper.lua` from the file manager once: the app downloads the data into `weather.txt`.
The wallpaper only reads that file (the launcher can't make network requests),
so open the app again from time to time to refresh it.

Set your city in `CITY`, `LAT`, `LON` at the top of the script.

## Controls (app only)

- **A** — Refresh.
- **START** — Exit.
