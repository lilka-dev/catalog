# ISS Tracker

Shows where the International Space Station is right now on a world map.
The position is calculated on the device from the ISS orbital elements (TLE),
so no internet connection is needed once the TLE has been downloaded.

## Features

- Live ISS marker on a world map with coastlines and a coordinate grid.
- Ground track: half an orbit behind and one full orbit ahead.
- Night side shading with the day/night terminator line.
- TLE is cached in `tle.txt` and refreshed automatically from CelesTrak
  (or ARISS as a fallback) when it is older than 12 hours and WiFi is connected.

## Requirements

- `main.lua`, `map.bmp` and `tle.txt` must be in the same folder.
- WiFi configured in KeiraOS: the clock is synced over NTP, and the TLE is
  refreshed over the network. Until the clock is synced the app shows
  "WAITING FOR CLOCK (WI-FI)".

## Wallpaper

The tracker can also be used as the home-screen wallpaper: copy the app
folder to the SD card root (`/sd`) and rename `main.lua` to `wallpaper.lua`
(adjust the folder name if needed).

As a wallpaper it only reads the cached `tle.txt` and never downloads: the
launcher's 8 KB stack is too small for an HTTP request. Open it as an app
once in a while to refresh the TLE.

## Controls

- **B** — exit.
