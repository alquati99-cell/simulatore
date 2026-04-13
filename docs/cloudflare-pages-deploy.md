# Deploy su Cloudflare Pages

Questo progetto e pronto per essere pubblicato come demo statica su Cloudflare Pages partendo dal repository GitHub:

- repo: `https://github.com/alquati99-cell/simulatore`
- branch: `main`

## Stato attuale

Il progetto Pages live esiste gia:

- project: `alquati99-simulatore`
- URL stabile: `https://alquati99-simulatore.pages.dev`

Il repository contiene anche il workflow GitHub Actions:

- [.github/workflows/deploy-cloudflare-pages.yml](/Users/matteo7/Desktop/Simulatore%20scenari%20assicurativi/.github/workflows/deploy-cloudflare-pages.yml)

Questo workflow:

- parte a ogni push su `main`
- esegue `bash scripts/build_pages_bundle.sh`
- pubblica il contenuto di `public/` su Cloudflare Pages con `wrangler-action`
- permette anche il rilancio manuale con `workflow_dispatch`

## Secret GitHub richiesti

Nel repository GitHub servono questi 2 secret Actions:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Valori da usare:

- `CLOUDFLARE_ACCOUNT_ID`: l'account id Cloudflare del progetto
- `CLOUDFLARE_API_TOKEN`: un token con permesso `Account > Cloudflare Pages > Edit`

Percorso GitHub:

1. `Settings`
2. `Secrets and variables`
3. `Actions`
4. `New repository secret`

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
- eventuali file `risk_db_*.json` presenti nella root del repository dentro `public/data/uploads/`
- eventuali file `.json` in `data/uploads/` dentro `public/data/uploads/`

## Regola pratica per chi carica dati

- non modificare direttamente `public/`, perche viene rigenerata a ogni deploy
- modificare sempre i file sorgente in root oppure aggiungere i dataset in `data/uploads/`
- i dataset caricati vengono pubblicati su Pages in `https://alquati99-simulatore.pages.dev/data/uploads/...`

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
