# Deploy su Cloudflare Pages

Questo progetto e pronto per essere pubblicato come demo statica su Cloudflare Pages partendo dal repository GitHub:

- repo: `https://github.com/alquati99-cell/simulatore`
- branch: `main`

## Percorso consigliato

1. Apri Cloudflare Dashboard
2. Vai in `Workers & Pages`
3. Clicca `Create`
4. Scegli `Pages`
5. Scegli `Connect to Git`
6. Autorizza GitHub se richiesto
7. Seleziona il repository `simulatore`

## Impostazioni da usare

- Framework preset: `None`
- Production branch: `main`
- Build command: `bash scripts/build_pages_bundle.sh`
- Build output directory: `public`
- Root directory: lascia vuoto

## Cosa fa il build

Lo script [build_pages_bundle.sh](/Users/matteo7/Desktop/Simulatore%20scenari%20assicurativi/scripts/build_pages_bundle.sh) crea una cartella `public/` pronta per Pages e copia:

- `advisor-platform.html` come `index.html`
- `advisor-app.js`
- `simulator-db.js`
- `simulator-engine.js`
- `data/processed/bdi_benchmarks_2022.js`

## Output atteso

Una volta finito il primo deploy, Cloudflare ti dara un URL del tipo:

- `https://simulatore.pages.dev`

## Passo successivo

Quando la demo statica e online, il passo dopo e spostare il layer benchmark/API su:

- `Workers` per endpoint di simulazione
- `D1` per benchmark casa, education, spese e reddito/patrimonio

In quel momento conviene aggiungere anche:

- `wrangler.toml`
- binding `D1`
- API `GET /benchmarks`
- API `POST /simulate`
