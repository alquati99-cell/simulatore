# Benchmark database e uso nel motore

## Obiettivo

Il motore deve smettere di usare solo formule fisse quando il dato benchmark esiste.

La regola e:

- `prima benchmark reale`
- `poi formula interna`

Questo permette al simulatore di restare robusto anche quando non abbiamo ancora tutti i dati territoriali.

## File creati

- schema D1: [schema.sql](/Users/matteo7/Desktop/Simulatore%20scenari%20assicurativi/cloudflare/d1/schema.sql)
- seed iniziale: [seed.sql](/Users/matteo7/Desktop/Simulatore%20scenari%20assicurativi/cloudflare/d1/seed.sql)
- catalogo fonti: [italy-source-catalog.json](/Users/matteo7/Desktop/Simulatore%20scenari%20assicurativi/data/italy-source-catalog.json)
- subset universita: [mur_university_costs_2018.csv](/Users/matteo7/Desktop/Simulatore%20scenari%20assicurativi/data/processed/mur_university_costs_2018.csv)

## Logica target per obiettivo

### Obiettivo casa

Ordine consigliato:

1. `housing_city_prices` per citta e semestre
2. fallback su media provinciale o regionale
3. fallback su indice macro `ISTAT IPAB`
4. fallback sulla formula attuale del simulatore

Formula obiettivo suggerita quando il benchmark esiste:

- `prezzo_medio_mq * metratura_target`
- anticipo iniziale tra `20%` e `30%`
- aggiunta spese accessorie

### Obiettivo studi figli

Ordine consigliato:

1. `education_city_benchmarks` per citta
2. benchmark regionale
3. benchmark nazionale
4. fallback sulla formula attuale del simulatore

Componenti:

- contribuzione universitaria
- eventuale costo vita fuori sede
- durata standard del percorso

### Fondo emergenze

Ordine consigliato:

1. `household_expense_benchmarks`
2. uscita mensile rilevata dal questionario
3. formula attuale del simulatore

Componenti:

- spese fisse
- costo vita del nucleo
- moltiplicatore mesi di sicurezza

### Risparmio e pensione

Ordine consigliato:

1. `income_wealth_benchmarks`
2. dati cliente dichiarati
3. formula attuale

Uso pratico:

- tarare il cliente rispetto a una mediana realistica
- capire se il piano e aggressivo o prudente

## Come userei questi benchmark nel codice

### Primo step semplice

Nel motore JS:

- se `goal.id === "education"` e il cliente ha `city`, cerco un benchmark MUR
- se lo trovo, il `targetAmount` parte da quel dato e non dal numero fisso
- se non lo trovo, lascio il comportamento attuale

### Secondo step

Spostare i lookup benchmark lato API:

- `/api/benchmarks/education?city=Milano`
- `/api/benchmarks/housing?city=Torino`
- `/api/benchmarks/profile?region=Lombardia&age_band=35-44`

### Terzo step

Far lavorare il RAG solo sopra questi benchmark:

- per spiegare
- per motivare
- per recuperare il perche del numero

Non per generare il numero.

## Perche questa struttura e sensata

1. il motore non dipende da un LLM per i calcoli
2. i numeri reali possono crescere nel tempo senza riscrivere tutto
3. puoi mostrare fonti e benchmark in modo credibile al cliente
4. il deploy su Cloudflare diventa naturale con `D1 + Workers`

## Cosa manca ancora

- import OMI per prezzi casa e affitti
- estrazione ISTAT spese famiglie
- subset Banca d'Italia per reddito/patrimonio mediano
- subset INAIL per settore professionale

## Prossimo passo che consiglierei

Prendere il motore attuale e sostituire il `targetAmount` dell'obiettivo `education`
con il primo lookup benchmark locale, cosi il simulatore inizia subito a usare dati veri.
