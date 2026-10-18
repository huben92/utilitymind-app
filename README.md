# UtilityMind dashboard app

Vue 3, Tailwind CSS 4, and Vite frontend for the Wheelworks utility metering pilot. This repository contains the dashboard UI only. It calls the same-origin Flask API from [utilitymind-api](https://github.com/huben92/utilitymind-api); live readings come from [utilitymind-simulator](https://github.com/huben92/utilitymind-simulator) through MQTT and ClickHouse.

## Local development

```bash
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/dashboard/`. Vite proxies `/api` to `http://127.0.0.1:8765`, so start the API stack first. Build with `npm run build`; generated files go to ignored `dist/`. The API's Dockerfile builds this app automatically when the two checkouts are siblings named `app/` and `api/`.

Start at `src/App.vue`; pages live in `src/*.vue`, and shared styles are in `src/style.css` and `src/styles/`. The app uses hash routes, so direct links work through Flask. The `legacy/` folder preserves older console assets required by API compatibility routes.

## Clone all three repositories

```bash
git clone https://github.com/huben92/utilitymind-app.git app
git clone https://github.com/huben92/utilitymind-api.git api
git clone https://github.com/huben92/utilitymind-simulator.git simulator
```

Run the stack from `api/` using its [setup guide](https://github.com/huben92/utilitymind-api#local-setup). All pilot telemetry and history are synthetic. The dashboard provides information and recommendations; it does not control machinery or utility supply.
