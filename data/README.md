# Data layer del simulatore

Questa cartella serve a separare bene:

- `fonti grezze`
- `subset puliti`
- `benchmark pronti per il motore`
- `eventuale materiale per RAG`

## Struttura

- `raw/`
  - file scaricati dalle fonti ufficiali
- `processed/`
  - subset puliti e omogenei per il simulatore
- `italy-source-catalog.json`
  - catalogo delle fonti, con uso previsto nel prodotto

## Principio di modellazione

Nel simulatore non tutti i dati devono andare nel RAG.

### Database strutturato

Qui vanno i dati numerici che il motore deve usare in modo stabile:

- prezzi casa per citta
- canoni medi
- costo medio universita
- spesa familiare per area e composizione
- benchmark reddito/patrimonio
- tassi mutuo o scenari macro di riferimento

### RAG / Vector store

Qui vanno soprattutto testi e documenti:

- metodologia fonti
- FAQ consulente
- schede prodotto
- note commerciali
- commenti narrativi per area geografica o tipologia cliente

## Tabelle consigliate per D1

### `city_housing_prices`

- `city`
- `province`
- `region`
- `semester`
- `property_type`
- `condition`
- `min_eur_sqm`
- `max_eur_sqm`
- `source_id`

### `education_costs`

- `education_level`
- `city`
- `region`
- `annual_cost_low`
- `annual_cost_mid`
- `annual_cost_high`
- `source_id`

### `household_expense_benchmarks`

- `region`
- `household_type`
- `children_band`
- `expense_type`
- `monthly_amount`
- `source_id`

### `income_wealth_benchmarks`

- `region`
- `age_band`
- `household_type`
- `income_median`
- `wealth_median`
- `source_id`

### `occupational_risk_benchmarks`

- `sector`
- `region`
- `risk_index`
- `injury_frequency`
- `source_id`

## Come usare i dati nel motore

### Esempi buoni

- se il cliente vuole comprare casa a Torino, il target non nasce a caso ma da `prezzo medio mq * metratura desiderata`
- se ha figli piccoli, il target studi puo essere stimato con benchmark universitari e costo vita
- se vive in una grande citta, il fondo emergenze puo tener conto del costo vita locale

### Esempi da evitare

- usare un documento RAG per decidere direttamente il punteggio
- usare testo narrativo al posto di tabelle benchmark

## Regola di governo

`Se il dato entra in una formula, meglio D1. Se serve a spiegare, cercare o contestualizzare, bene Vectorize.`
