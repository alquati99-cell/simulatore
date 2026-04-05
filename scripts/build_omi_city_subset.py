#!/usr/bin/env python3

import csv
import html
import json
import re
import statistics
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import quote


BASE = "https://www1.agenziaentrate.gov.it/servizi/geopoi_omi"
OUT_JSON = Path("data/processed/omi_city_home_benchmarks_20252.json")
OUT_CSV = Path("data/processed/omi_city_home_benchmarks_20252.csv")
ZONE_WORKERS = 12

CITY_TARGETS = [
    {"city": "Torino", "prov": "TO", "region": "Piemonte"},
    {"city": "Milano", "prov": "MI", "region": "Lombardia"},
    {"city": "Padova", "prov": "PD", "region": "Veneto"},
    {"city": "Bologna", "prov": "BO", "region": "Emilia-Romagna"},
    {"city": "Firenze", "prov": "FI", "region": "Toscana"},
    {"city": "Pisa", "prov": "PI", "region": "Toscana"},
    {"city": "Roma", "prov": "RM", "region": "Lazio"},
    {"city": "Napoli", "prov": "NA", "region": "Campania"},
    {"city": "Bari", "prov": "BA", "region": "Puglia"},
    {"city": "Palermo", "prov": "PA", "region": "Sicilia"},
    {"city": "Catania", "prov": "CT", "region": "Sicilia"},
    {"city": "Cagliari", "prov": "CA", "region": "Sardegna"},
    {"city": "Verona", "prov": "VR", "region": "Veneto"},
    {"city": "Venezia", "prov": "VE", "region": "Veneto"},
]


ROW_RE = re.compile(
    r"<tr><td id='sin'>(?P<tipologia>.*?)&nbsp;</td>"
    r"<td id='sin'>(?P<stato>.*?)&nbsp;</td>"
    r"<td id='dx'[^>]*>(?P<buy_min>.*?)&nbsp;</td>"
    r"<td id='dx'[^>]*>(?P<buy_max>.*?)&nbsp;</td>"
    r"<td id='center'[^>]*>(?P<buy_surface>.*?)&nbsp;</td>"
    r"<td id='dx'[^>]*>(?P<rent_min>.*?)&nbsp;</td>"
    r"<td id='dx'[^>]*>(?P<rent_max>.*?)&nbsp;</td>"
    r"<td id='center'[^>]*>(?P<rent_surface>.*?)&nbsp;</td></tr>",
    re.I,
)


def run_curl(url: str) -> str:
    proc = subprocess.run(
        ["curl", "-sS", "-L", "--max-time", "20", url],
        check=True,
        capture_output=True,
        text=True,
    )
    return proc.stdout


def normalize(value: str) -> str:
    text = (value or "").strip().lower()
    replacements = {
        "à": "a",
        "è": "e",
        "é": "e",
        "ì": "i",
        "ò": "o",
        "ù": "u",
        "’": "'",
        "`": "'",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    text = re.sub(r"\s+", " ", text)
    return text


def parse_number(value: str):
    text = html.unescape(value or "").strip()
    if not text or text == "-":
        return None
    text = text.replace(".", "").replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def parse_semester() -> str:
    data = json.loads(run_curl(f"{BASE}/zoneomi.php?richiesta=5"))
    return data[0]["SEMESTRE"]


def fetch_codcom(city: str, prov: str) -> str:
    comuni = json.loads(run_curl(f"{BASE}/zoneomi.php?richiesta=2&prov={quote(prov)}"))
    target = normalize(city)
    for entry in comuni:
        if normalize(entry["DIZIONE"]) == target:
            return entry["CODCOM"]
    raise RuntimeError(f"Comune non trovato per {city} ({prov})")


def fetch_zones(codcom: str):
    return json.loads(run_curl(f"{BASE}/zoneomi.php?richiesta=3&codcom={quote(codcom)}"))


def fetch_geometries(codcom: str, semester: str):
    payload = json.loads(run_curl(f"{BASE}/zoneomi.php?richiesta=6&codcom={quote(codcom)}&semestre={quote(semester)}"))
    return {feature["properties"]["zona"]: feature for feature in payload["dat"]["features"]}


def polygon_centroid(feature) -> tuple[float, float]:
    geometry = feature["geometry"]
    if geometry["type"] == "Polygon":
        ring = geometry["coordinates"][0]
    elif geometry["type"] == "MultiPolygon":
        ring = geometry["coordinates"][0][0]
    else:
        raise RuntimeError(f"Geometria non gestita: {geometry['type']}")
    xs = [float(point[0]) for point in ring]
    ys = [float(point[1]) for point in ring]
    return (sum(xs) / len(xs), sum(ys) / len(ys))


def residential_rank(row: dict) -> int:
    tipologia = normalize(row["tipologia"])
    stato = normalize(row["stato"])
    if "abitazioni civili" in tipologia and stato == "normale":
        return 0
    if "abitazioni civili" in tipologia:
        return 1
    if "tipo economico" in tipologia and stato == "normale":
        return 2
    if "tipo economico" in tipologia:
        return 3
    if tipologia.startswith("abitazioni") and stato == "normale":
        return 4
    if tipologia.startswith("abitazioni"):
        return 5
    if "ville" in tipologia or "villini" in tipologia:
        return 6
    return 99


def parse_stampa_rows(page_html: str):
    rows = []
    for match in ROW_RE.finditer(page_html):
        row = {key: html.unescape(value).strip() for key, value in match.groupdict().items()}
        row["buy_min"] = parse_number(row["buy_min"])
        row["buy_max"] = parse_number(row["buy_max"])
        row["rent_min"] = parse_number(row["rent_min"])
        row["rent_max"] = parse_number(row["rent_max"])
        row["rank"] = residential_rank(row)
        rows.append(row)
    return rows


def fetch_zone_benchmark(codcom: str, semester: str, zone_entry: dict, feature: dict):
    lon, lat = polygon_centroid(feature)
    url = (
        f"{BASE}/stampaomi.php?"
        f"{quote(codcom)}/{quote(zone_entry['LINK_ZONA'])}/{quote(semester)}/R/"
        f"{quote(zone_entry['ZONA'])}/{lon:.6f}/{lat:.6f}"
    )
    page_html = run_curl(url)
    rows = [row for row in parse_stampa_rows(page_html) if row["rank"] < 99 and row["buy_min"] and row["buy_max"]]
    if not rows:
        return None
    row = sorted(rows, key=lambda item: (item["rank"], -(item["buy_min"] + item["buy_max"])))[0]
    row["zona"] = zone_entry["ZONA"]
    row["fascia"] = zone_entry["FASCIA"]
    row["zona_label"] = zone_entry["DIZIONE"]
    row["link_zona"] = zone_entry["LINK_ZONA"]
    row["lon"] = round(lon, 6)
    row["lat"] = round(lat, 6)
    row["buy_mid"] = round((row["buy_min"] + row["buy_max"]) / 2.0, 2)
    if row["rent_min"] is not None and row["rent_max"] is not None:
        row["rent_mid"] = round((row["rent_min"] + row["rent_max"]) / 2.0, 2)
    else:
        row["rent_mid"] = None
    return row


def median(values):
    clean = [float(value) for value in values if value is not None]
    return round(statistics.median(clean), 2) if clean else None


def zone_value_band(zone_rows, key):
    values = sorted(float(row[key]) for row in zone_rows if row.get(key) is not None)
    if not values:
        return (None, None)
    low_idx = max(0, int((len(values) - 1) * 0.25))
    high_idx = max(0, int((len(values) - 1) * 0.75))
    return (round(values[low_idx], 2), round(values[high_idx], 2))


def build_city_benchmark(city_meta: dict, semester: str):
    codcom = fetch_codcom(city_meta["city"], city_meta["prov"])
    zones = fetch_zones(codcom)
    geometries = fetch_geometries(codcom, semester)
    zone_rows = []
    tasks = []
    with ThreadPoolExecutor(max_workers=ZONE_WORKERS) as executor:
        for zone_entry in zones:
            feature = geometries.get(zone_entry["ZONA"])
            if not feature:
                continue
            tasks.append(executor.submit(fetch_zone_benchmark, codcom, semester, zone_entry, feature))
        for task in as_completed(tasks):
            zone_row = task.result()
            if zone_row:
                zone_rows.append(zone_row)

    if not zone_rows:
        raise RuntimeError(f"Nessun benchmark OMI residenziale ottenuto per {city_meta['city']}")

    buy_p25, buy_p75 = zone_value_band(zone_rows, "buy_mid")
    rent_p25, rent_p75 = zone_value_band(zone_rows, "rent_mid")
    sample = {
        "city": city_meta["city"],
        "province": city_meta["prov"],
        "region": city_meta["region"],
        "semester": semester,
        "source_id": "ae_omi_quotes",
        "sample_zone_count": len(zone_rows),
        "buy_min_median_eur_sqm": median(row["buy_min"] for row in zone_rows),
        "buy_max_median_eur_sqm": median(row["buy_max"] for row in zone_rows),
        "buy_mid_median_eur_sqm": median(row["buy_mid"] for row in zone_rows),
        "buy_mid_p25_eur_sqm": buy_p25,
        "buy_mid_p75_eur_sqm": buy_p75,
        "rent_min_median_eur_sqm_month": median(row["rent_min"] for row in zone_rows),
        "rent_max_median_eur_sqm_month": median(row["rent_max"] for row in zone_rows),
        "rent_mid_median_eur_sqm_month": median(row["rent_mid"] for row in zone_rows),
        "rent_mid_p25_eur_sqm_month": rent_p25,
        "rent_mid_p75_eur_sqm_month": rent_p75,
        "representative_zone": zone_rows[0]["zona"],
        "notes": "Subset calcolato da OMI con mediane delle zone residenziali del comune."
    }
    return sample


def write_outputs(rows):
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n")
    with OUT_CSV.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def main():
    semester = parse_semester()
    rows = []
    total = len(CITY_TARGETS)
    for index, city_meta in enumerate(CITY_TARGETS, start=1):
        print(f"[{index}/{total}] OMI {city_meta['city']}...", file=sys.stderr, flush=True)
        rows.append(build_city_benchmark(city_meta, semester))
    write_outputs(rows)
    print(json.dumps(rows, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
