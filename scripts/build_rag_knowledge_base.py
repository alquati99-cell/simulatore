#!/usr/bin/env python3
import csv
import json
import statistics
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SEED_DIR = ROOT / "cloudflare" / "rag-worker" / "seed"
SOURCE_CATALOG_PATH = ROOT / "data" / "italy-source-catalog.json"
MANUAL_SEED_PATH = SEED_DIR / "knowledge-seed.json"
HOUSING_PATH = ROOT / "data" / "processed" / "omi_city_home_benchmarks_20252.csv"
EDUCATION_PATH = ROOT / "data" / "processed" / "mur_university_costs_2018.csv"
EXPENSE_PATH = ROOT / "data" / "processed" / "bdi_household_expense_benchmarks_2022.csv"
INCOME_PATH = ROOT / "data" / "processed" / "bdi_income_wealth_benchmarks_2022.csv"
GENERATED_PATH = SEED_DIR / "knowledge-benchmarks.generated.json"
COMBINED_PATH = SEED_DIR / "knowledge-base.json"


HOUSEHOLD_LABELS = {
    "single": "single",
    "couple": "coppia",
    "family_1": "famiglia con 1 figlio",
    "family_2_plus": "famiglia con 2 o piu figli",
    "extended": "famiglia estesa",
}

CHILDREN_LABELS = {
    "0": "senza figli",
    "1": "con 1 figlio",
    "2_plus": "con 2 o piu figli",
}

AGE_LABELS = {
    "under_35": "under 35",
    "35_44": "35-44 anni",
    "45_54": "45-54 anni",
    "55_64": "55-64 anni",
    "65_plus": "65+",
    "all_ages": "tutte le eta",
}


def load_json(path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_csv(path):
    last_error = None
    for encoding in ("utf-8-sig", "latin-1", "cp1252"):
        try:
            with path.open("r", encoding=encoding, newline="") as handle:
                return list(csv.DictReader(handle))
        except UnicodeDecodeError as exc:
            last_error = exc
    if last_error:
        raise last_error
    raise ValueError(f"Unable to decode CSV file: {path}")


def normalize(value):
    text = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(ch for ch in text if not unicodedata.combining(ch)).lower().strip()


def to_float(value):
    try:
        return float(str(value).strip())
    except (TypeError, ValueError):
        return 0.0


def to_int(value):
    try:
        return int(float(str(value).strip()))
    except (TypeError, ValueError):
        return 0


def euro(value):
    rounded = int(round(float(value or 0)))
    return f"{rounded:,}".replace(",", ".")


def slug(value):
    normalized = normalize(value)
    safe = []
    for char in normalized:
        safe.append(char if char.isalnum() else "-")
    return "".join(safe).strip("-")


def source_index():
    catalog = load_json(SOURCE_CATALOG_PATH)
    return {entry["id"]: entry for entry in catalog}


def source_documents(sources):
    documents = []
    for source in sources.values():
      provider = source.get("provider", "")
      primary_use = source.get("primary_use_in_simulator", [])
      primary_text = "; ".join(primary_use[:3])
      documents.append(
          {
              "id": f"source-{source['id']}",
              "title": source["label"],
              "category": "source",
              "sourceType": "official_source_catalog",
              "sourceUrl": source.get("landing_url"),
              "tags": [
                  source.get("category", "benchmark"),
                  source.get("provider", ""),
                  source.get("id", ""),
              ],
              "text": (
                  f"Fonte ufficiale: {source['label']}. Provider: {provider}. "
                  f"Copertura territoriale: {source.get('geography', 'n.d.')}. "
                  f"Granularita: {source.get('granularity', 'n.d.')}. "
                  f"Nel simulatore viene usata soprattutto per: {primary_text}. "
                  f"Stato corrente: {source.get('status', 'n.d.')}. "
                  f"Note: {source.get('notes', '')}"
              ),
          }
      )
    return documents


def housing_documents(sources):
    source = sources["ae_omi_quotes"]
    documents = []
    for row in load_csv(HOUSING_PATH):
        city = row["city"]
        documents.append(
            {
                "id": f"housing-{slug(city)}-{row['semester']}",
                "title": f"Benchmark casa {city} ({row['semester']})",
                "category": "benchmark",
                "sourceType": "official_dataset_summary",
                "sourceUrl": source["landing_url"],
                "city": city,
                "tags": [
                    "housing",
                    city,
                    row["region"],
                    row["semester"],
                    source["id"],
                ],
                "text": (
                    f"Secondo il subset OMI del semestre {row['semester']}, a {city} "
                    f"il prezzo mediano di acquisto residenziale e circa {euro(row['buy_mid_median_eur_sqm'])} euro al metro quadro, "
                    f"con un intervallo interquartile indicativo tra {euro(row['buy_mid_p25_eur_sqm'])} e {euro(row['buy_mid_p75_eur_sqm'])} euro al metro quadro. "
                    f"Il canone mediano residenziale e circa {euro(row['rent_mid_median_eur_sqm_month'])} euro al metro quadro al mese. "
                    f"Il benchmark deriva da {row['sample_zone_count']} zone OMI del comune e aiuta il simulatore a stimare target casa, anticipo iniziale e sostenibilita dell'obiettivo immobiliare. "
                    f"Zona rappresentativa: {row['representative_zone']}. "
                    f"Nota dataset: {row['notes']}"
                ),
            }
        )
    return documents


def aggregate_education_by_city(home_rows):
    education_rows = load_csv(EDUCATION_PATH)
    city_map = {row["city"]: [] for row in home_rows}

    for row in education_rows:
        fee = to_float(row["avg_fee_payers_eur"])
        if fee <= 0:
            continue
        university_name = normalize(row["university_name"])
        for city in city_map.keys():
            if normalize(city) in university_name:
                city_map[city].append(row)

    return city_map


def education_documents(sources):
    source = sources["mur_university_contribution"]
    home_rows = load_csv(HOUSING_PATH)
    aggregated = aggregate_education_by_city(home_rows)
    documents = []

    for row in home_rows:
        city = row["city"]
        entries = aggregated.get(city, [])
        if not entries:
            continue

        fees = [to_float(entry["avg_fee_payers_eur"]) for entry in entries if to_float(entry["avg_fee_payers_eur"]) > 0]
        if not fees:
            continue

        median_fee = statistics.median(fees)
        low_fee = min(fees)
        high_fee = max(fees)
        documents.append(
            {
                "id": f"education-{slug(city)}-2017-2018",
                "title": f"Benchmark studi figli {city}",
                "category": "benchmark",
                "sourceType": "official_dataset_summary",
                "sourceUrl": source["landing_url"],
                "city": city,
                "tags": [
                    "education",
                    city,
                    row["region"],
                    source["id"],
                ],
                "text": (
                    f"Nel dataset MUR 2017-2018, per la piazza di {city} la contribuzione media universitaria pagata dagli iscritti e intorno a {euro(median_fee)} euro l'anno, "
                    f"con un range osservato tra {euro(low_fee)} e {euro(high_fee)} euro tra gli atenei intercettati. "
                    f"Il campione locale include {len(entries)} atenei riconducibili alla citta o al suo polo universitario. "
                    f"Nel simulatore questo benchmark non rappresenta tutto il costo di studio: serve come base ufficiale a cui si sommano costo vita, fuori sede e spese accessorie per costruire il fondo studi figli."
                ),
            }
        )

    return documents


def household_label(household_type, children_band):
    if household_type == "single" and children_band == "0":
        return "single senza figli"
    if household_type == "single" and children_band == "1":
        return "genitore single con 1 figlio"
    if household_type == "single" and children_band == "2_plus":
        return "genitore single con 2 o piu figli"
    if household_type == "couple" and children_band == "0":
        return "coppia senza figli"
    if household_type == "couple" and children_band == "1":
        return "coppia con 1 figlio"
    if household_type == "couple" and children_band == "2_plus":
        return "coppia con 2 o piu figli"
    if household_type == "family_1":
        return "famiglia con 1 figlio"
    if household_type == "family_2_plus":
        return "famiglia con 2 o piu figli"
    if household_type == "extended":
        return "famiglia estesa"
    return HOUSEHOLD_LABELS.get(household_type, household_type)


def expense_documents(sources):
    source = sources["bdi_shiw_microdata"]
    documents = []
    for row in load_csv(EXPENSE_PATH):
        sample_size = to_int(row["sample_size"])
        if sample_size < 75:
            continue
        household = household_label(row["household_type"], row["children_band"])
        documents.append(
            {
                "id": f"expense-{slug(row['macro_area'])}-{slug(row['household_type'])}-{slug(row['children_band'])}",
                "title": f"Benchmark spesa familiare {row['macro_area']} - {household}",
                "category": "benchmark",
                "sourceType": "official_dataset_summary",
                "sourceUrl": source["landing_url"],
                "tags": [
                    "household_expenses",
                    row["macro_area"],
                    row["household_type"],
                    row["children_band"],
                    source["id"],
                ],
                "text": (
                    f"Secondo i microdati SHIW/Banca d'Italia 2022, per {household} nell'area {row['macro_area']} "
                    f"la spesa mensile mediana per consumi e circa {euro(row['monthly_consumption_median_eur'])} euro e il risparmio mensile mediano circa {euro(row['monthly_saving_median_eur'])} euro. "
                    f"Il benchmark si basa su un campione di {sample_size} osservazioni e viene usato nel simulatore per tarare fondo emergenze, pressione delle uscite e sostenibilita del piano."
                ),
            }
        )
    return documents


def income_documents(sources):
    source = sources["bdi_shiw_microdata"]
    documents = []
    for row in load_csv(INCOME_PATH):
        sample_size = to_int(row["sample_size"])
        if sample_size < 25:
            continue
        household = HOUSEHOLD_LABELS.get(row["household_type"], row["household_type"])
        age_band = AGE_LABELS.get(row["age_band"], row["age_band"])
        documents.append(
            {
                "id": f"incomewealth-{slug(row['macro_area'])}-{slug(row['age_band'])}-{slug(row['household_type'])}",
                "title": f"Benchmark reddito e patrimonio {row['macro_area']} - {age_band} - {household}",
                "category": "benchmark",
                "sourceType": "official_dataset_summary",
                "sourceUrl": source["landing_url"],
                "tags": [
                    "income_wealth",
                    row["macro_area"],
                    row["age_band"],
                    row["household_type"],
                    source["id"],
                ],
                "text": (
                    f"Per nuclei {household} nell'area {row['macro_area']} e fascia {age_band}, i microdati SHIW/Banca d'Italia 2022 mostrano un reddito mediano annuo di circa {euro(row['income_median_eur'])} euro, "
                    f"una ricchezza mediana di circa {euro(row['wealth_median_eur'])} euro e attivita finanziarie mediane intorno a {euro(row['financial_assets_median_eur'])} euro. "
                    f"Il campione disponibile e di {sample_size} osservazioni. "
                    f"Nel simulatore questi valori servono come benchmark di riferimento per capire se il cliente e sopra o sotto una base realistica di reddito, patrimonio e liquidita."
                ),
            }
        )
    return documents


def build_documents():
    sources = source_index()
    manual_docs = load_json(MANUAL_SEED_PATH)["documents"]
    generated_docs = []
    generated_docs.extend(source_documents(sources))
    generated_docs.extend(housing_documents(sources))
    generated_docs.extend(education_documents(sources))
    generated_docs.extend(expense_documents(sources))
    generated_docs.extend(income_documents(sources))

    return manual_docs, generated_docs


def save_payload(path, documents):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump({"documents": documents}, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def main():
    manual_docs, generated_docs = build_documents()
    combined = manual_docs + generated_docs
    save_payload(GENERATED_PATH, generated_docs)
    save_payload(COMBINED_PATH, combined)
    print(
        json.dumps(
            {
                "manual_documents": len(manual_docs),
                "generated_documents": len(generated_docs),
                "combined_documents": len(combined),
                "generated_path": str(GENERATED_PATH),
                "combined_path": str(COMBINED_PATH),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
