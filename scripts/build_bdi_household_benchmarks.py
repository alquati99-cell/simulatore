#!/usr/bin/env python3

import csv
import io
import json
import zipfile
from collections import defaultdict
from pathlib import Path


ZIP_PATH = Path("data/raw/bdi/ind22_ascii.zip")
OUT_EXPENSE_JSON = Path("data/processed/bdi_household_expense_benchmarks_2022.json")
OUT_EXPENSE_CSV = Path("data/processed/bdi_household_expense_benchmarks_2022.csv")
OUT_INCOME_JSON = Path("data/processed/bdi_income_wealth_benchmarks_2022.json")
OUT_INCOME_CSV = Path("data/processed/bdi_income_wealth_benchmarks_2022.csv")
OUT_COMBINED_JS = Path("data/processed/bdi_benchmarks_2022.js")


AREA5_LABELS = {
    "1": "Nord Ovest",
    "2": "Nord Est",
    "3": "Centro",
    "4": "Sud",
    "5": "Isole",
}


def parse_float(value):
    if value is None:
        return 0.0
    text = str(value).strip()
    if not text:
        return 0.0
    return float(text)


def weighted_median(items):
    clean = [(float(value), float(weight)) for value, weight in items if value is not None and weight and weight > 0]
    if not clean:
        return None
    clean.sort(key=lambda item: item[0])
    total_weight = sum(weight for _, weight in clean)
    threshold = total_weight / 2.0
    cumulative = 0.0
    for value, weight in clean:
      cumulative += weight
      if cumulative >= threshold:
        return round(value, 2)
    return round(clean[-1][0], 2)


def load_csv(zf, member):
    with zf.open(member) as handle:
        return list(csv.DictReader(io.TextIOWrapper(handle, encoding="utf-8")))


def household_type(ncomp, nfigli):
    if ncomp <= 1:
        return "single"
    if nfigli >= 2:
        return "family_2_plus"
    if nfigli == 1:
        return "family_1"
    if ncomp == 2:
        return "couple"
    return "extended"


def children_band(nfigli):
    if nfigli >= 2:
        return "2_plus"
    return str(nfigli)


def age_band(age):
    if age <= 34:
        return "under_35"
    if age <= 44:
        return "35_44"
    if age <= 54:
        return "45_54"
    if age <= 64:
        return "55_64"
    return "65_plus"


def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def write_json(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_js(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "window.FAMILY_ADVISOR_EXTRA_BENCHMARKS = " + json.dumps(payload, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )


def main():
    zf = zipfile.ZipFile(ZIP_PATH)

    household_rows = {row["NQUEST"]: row for row in load_csv(zf, "CSV/q22a.csv")}
    income_rows = {row["NQUEST"]: row for row in load_csv(zf, "CSV/rfam22.csv")}
    wealth_rows = {row["NQUEST"]: row for row in load_csv(zf, "CSV/ricfam22.csv")}
    spending_rows = {row["NQUEST"]: row for row in load_csv(zf, "CSV/risfam22.csv")}

    household_meta = {}
    for row in load_csv(zf, "CSV/carcom22.csv"):
        nquest = row["NQUEST"]
        if nquest not in household_meta or row.get("PARENT") == "1":
            household_meta[nquest] = row

    expense_groups = defaultdict(list)
    income_groups = defaultdict(list)

    for nquest, household in household_rows.items():
        meta = household_meta.get(nquest)
        income = income_rows.get(nquest)
        wealth = wealth_rows.get(nquest)
        spending = spending_rows.get(nquest)
        if not meta or not income or not wealth or not spending:
            continue

        weight = parse_float(household.get("pesofit"))
        if weight <= 0:
            continue

        ncomp = int(parse_float(household.get("NCOMP")))
        nfigli = int(parse_float(household.get("NFIGLI")))
        hh_type = household_type(ncomp, nfigli)
        child_band = children_band(nfigli)
        area_label = AREA5_LABELS.get(meta.get("AREA5"), "Italia")
        head_age = int(parse_float(meta.get("ETA")))
        age_label = age_band(head_age)

        annual_income = parse_float(income.get("Y"))
        net_worth = parse_float(wealth.get("W"))
        financial_assets = parse_float(wealth.get("AF"))
        monthly_consumption = parse_float(spending.get("C")) / 12.0
        monthly_saving = parse_float(spending.get("S")) / 12.0

        expense_key = (area_label, hh_type, child_band)
        expense_groups[expense_key].append({
            "monthly_consumption": monthly_consumption,
            "monthly_saving": monthly_saving,
            "weight": weight,
        })
        expense_groups[("Italia", hh_type, child_band)].append({
            "monthly_consumption": monthly_consumption,
            "monthly_saving": monthly_saving,
            "weight": weight,
        })

        income_key = (area_label, age_label, hh_type)
        income_groups[income_key].append({
            "annual_income": annual_income,
            "net_worth": net_worth,
            "financial_assets": financial_assets,
            "weight": weight,
        })
        income_groups[(area_label, "all_ages", hh_type)].append({
            "annual_income": annual_income,
            "net_worth": net_worth,
            "financial_assets": financial_assets,
            "weight": weight,
        })
        income_groups[("Italia", age_label, hh_type)].append({
            "annual_income": annual_income,
            "net_worth": net_worth,
            "financial_assets": financial_assets,
            "weight": weight,
        })
        income_groups[("Italia", "all_ages", hh_type)].append({
            "annual_income": annual_income,
            "net_worth": net_worth,
            "financial_assets": financial_assets,
            "weight": weight,
        })

    expense_rows = []
    for key in sorted(expense_groups.keys()):
        macro_area, hh_type, child_band = key
        items = expense_groups[key]
        expense_rows.append({
            "macro_area": macro_area,
            "household_type": hh_type,
            "children_band": child_band,
            "sample_size": len(items),
            "monthly_consumption_median_eur": weighted_median((item["monthly_consumption"], item["weight"]) for item in items),
            "monthly_saving_median_eur": weighted_median((item["monthly_saving"], item["weight"]) for item in items),
            "source_id": "bdi_shiw_microdata",
            "benchmark_period": "2022",
            "notes": "Mediane ponderate SHIW/Banca d'Italia; consumi e risparmio famigliare."
        })

    income_rows_out = []
    for key in sorted(income_groups.keys()):
        macro_area, age_label, hh_type = key
        items = income_groups[key]
        income_rows_out.append({
            "macro_area": macro_area,
            "age_band": age_label,
            "household_type": hh_type,
            "sample_size": len(items),
            "income_median_eur": weighted_median((item["annual_income"], item["weight"]) for item in items),
            "wealth_median_eur": weighted_median((item["net_worth"], item["weight"]) for item in items),
            "financial_assets_median_eur": weighted_median((item["financial_assets"], item["weight"]) for item in items),
            "source_id": "bdi_shiw_microdata",
            "benchmark_period": "2022",
            "notes": "Mediane ponderate SHIW/Banca d'Italia; le attivita finanziarie fungono da proxy di liquidita."
        })

    write_json(OUT_EXPENSE_JSON, expense_rows)
    write_csv(OUT_EXPENSE_CSV, expense_rows)
    write_json(OUT_INCOME_JSON, income_rows_out)
    write_csv(OUT_INCOME_CSV, income_rows_out)
    write_js(OUT_COMBINED_JS, {
        "householdExpense": {
            "rows": expense_rows
        },
        "incomeWealth": {
            "rows": income_rows_out
        }
    })

    print(json.dumps({
        "expense_rows": len(expense_rows),
        "income_rows": len(income_rows_out),
        "expense_sample": expense_rows[:5],
        "income_sample": income_rows_out[:5],
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
