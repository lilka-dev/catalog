# PC Monitoring

A PC stats dashboard for Lilka. It polls a Prometheus server over WiFi and
displays real-time gauges for CPU, RAM, GPU, temperatures, disk usage, or any
other metric your Prometheus instance scrapes.

## Requirements

- A microSD card, formatted FAT32, with a `config.json` next to the firmware
  (see the [`sd_card_template/`](https://github.com/lilka-dev/PC_monitoring/tree/main/sd_card_template)
  folder in the repository for the format).
- A reachable Prometheus server (`prometheus.url` in `config.json`) already
  scraping whatever exporter(s) provide the metrics you want.
- WiFi: either already configured through KeiraOS (its WiFi setup screen
  saves credentials, which this firmware reads automatically), or supplied
  via `wifi.ssid` / `wifi.password` in `config.json` as a fallback.

## config.json

```json
{
  "wifi": { "ssid": "...", "password": "..." },
  "prometheus": { "url": "http://192.168.1.50:9090", "poll_interval_ms": 3000 },
  "clock": { "timezone_offset_min": 120, "ntp_server": "pool.ntp.org" },
  "queries": [
    { "label": "CPU", "query": "100 - (avg(rate(node_cpu_seconds_total{mode=\"idle\"}[1m])) * 100)" },
    { "label": "RAM", "query": "(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100" },
    { "label": "GPU", "query": "avg(nvidia_smi_utilization_gpu_ratio) * 100" }
  ]
}
```

- `queries` is optional: omit it entirely to get the built-in node_exporter
  defaults for CPU/RAM/GPU. Otherwise list as many `{"label", "query"}`
  gauges as you want; more gauges than fit on screen are paginated with
  LEFT/RIGHT rather than dropped.

## Controls

- **A** — force an immediate refresh (dashboard) / back to dashboard (status screen).
- **LEFT / RIGHT** — switch page when there are more gauges than fit on one screen.
- **START** — toggle the status screen (WiFi/Prometheus connection details, per-metric status, last error).

## Error handling

- A single failing query shows `N/A`/`ERR` on just that gauge; the rest keep updating.
- If every query fails in the same poll cycle, the dashboard falls back to a
  full-screen NTP-synced clock with a "Prometheus unreachable, retrying..."
  message, and switches back automatically once polling succeeds again.
- WiFi drops are retried automatically every 30 seconds without blocking the UI.
