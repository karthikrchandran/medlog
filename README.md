# MedLog – Tablet Tracker

A personal daily tablet/medication tracker built with React + Vite.

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Deploy to Vercel (recommended, free)

### Option A — Vercel CLI
```bash
npm install -g vercel
vercel
# Follow prompts. Framework: Vite. Done.
```

### Option B — Vercel Dashboard (no CLI)
1. Push this folder to a GitHub repo
2. Go to https://vercel.com → New Project
3. Import your repo
4. Framework preset: **Vite** (auto-detected)
5. Click **Deploy** — live in ~30 seconds

---

## Deploy to Netlify (also free)

### Option A — Netlify CLI
```bash
npm install -g netlify-cli
npm run build
netlify deploy --prod --dir=dist
```

### Option B — Netlify Dashboard (drag & drop)
1. Run `npm run build` locally → produces a `dist/` folder
2. Go to https://app.netlify.com → Sites
3. Drag & drop the `dist/` folder onto the page
4. Done — you get a live URL instantly

### Option C — Netlify via GitHub
1. Push to GitHub
2. Netlify → New site from Git → pick your repo
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Deploy

---

## Data Storage
In the deployed app, data is stored in the browser's **localStorage** — it persists across sessions on the same device/browser. No backend or account needed.
