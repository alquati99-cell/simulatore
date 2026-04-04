PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS source_catalog (
  source_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  provider TEXT NOT NULL,
  category TEXT NOT NULL,
  official INTEGER NOT NULL DEFAULT 1,
  landing_url TEXT,
  access_mode TEXT,
  local_status TEXT,
  last_ingested_on TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS housing_city_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL,
  province TEXT,
  region TEXT,
  semester_label TEXT NOT NULL,
  property_type TEXT NOT NULL,
  condition_label TEXT,
  min_eur_sqm REAL,
  max_eur_sqm REAL,
  rent_min_eur_sqm_month REAL,
  rent_max_eur_sqm_month REAL,
  source_id TEXT NOT NULL,
  confidence_label TEXT NOT NULL DEFAULT 'official',
  notes TEXT,
  FOREIGN KEY (source_id) REFERENCES source_catalog(source_id)
);

CREATE INDEX IF NOT EXISTS idx_housing_city_prices_city_period
  ON housing_city_prices(city, semester_label);

CREATE TABLE IF NOT EXISTS education_city_benchmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL,
  province TEXT,
  region TEXT,
  academic_year TEXT NOT NULL,
  benchmark_scope TEXT NOT NULL DEFAULT 'university_fees',
  representative_university TEXT NOT NULL,
  university_code TEXT,
  avg_fee_payers_eur REAL,
  avg_fee_all_students_eur REAL,
  annual_living_cost_low_eur REAL,
  annual_living_cost_mid_eur REAL,
  annual_living_cost_high_eur REAL,
  source_id TEXT NOT NULL,
  notes TEXT,
  FOREIGN KEY (source_id) REFERENCES source_catalog(source_id)
);

CREATE INDEX IF NOT EXISTS idx_education_city_benchmarks_city_year
  ON education_city_benchmarks(city, academic_year);

CREATE TABLE IF NOT EXISTS household_expense_benchmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  region TEXT NOT NULL,
  household_type TEXT NOT NULL,
  children_band TEXT,
  expense_type TEXT NOT NULL,
  period_label TEXT NOT NULL,
  monthly_amount_eur REAL NOT NULL,
  source_id TEXT NOT NULL,
  notes TEXT,
  FOREIGN KEY (source_id) REFERENCES source_catalog(source_id)
);

CREATE INDEX IF NOT EXISTS idx_household_expense_benchmarks_lookup
  ON household_expense_benchmarks(region, household_type, expense_type, period_label);

CREATE TABLE IF NOT EXISTS income_wealth_benchmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  region TEXT NOT NULL,
  age_band TEXT NOT NULL,
  household_type TEXT NOT NULL,
  period_label TEXT NOT NULL,
  income_median_eur REAL,
  wealth_median_eur REAL,
  liquid_assets_median_eur REAL,
  source_id TEXT NOT NULL,
  notes TEXT,
  FOREIGN KEY (source_id) REFERENCES source_catalog(source_id)
);

CREATE INDEX IF NOT EXISTS idx_income_wealth_benchmarks_lookup
  ON income_wealth_benchmarks(region, age_band, household_type, period_label);

CREATE TABLE IF NOT EXISTS occupational_risk_benchmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sector_code TEXT,
  sector_label TEXT NOT NULL,
  region TEXT,
  benchmark_period TEXT NOT NULL,
  injury_rate_index REAL,
  severe_injury_rate_index REAL,
  source_id TEXT NOT NULL,
  notes TEXT,
  FOREIGN KEY (source_id) REFERENCES source_catalog(source_id)
);

CREATE INDEX IF NOT EXISTS idx_occupational_risk_benchmarks_lookup
  ON occupational_risk_benchmarks(sector_label, region, benchmark_period);

CREATE TABLE IF NOT EXISTS benchmark_fallback_rules (
  rule_key TEXT PRIMARY KEY,
  benchmark_domain TEXT NOT NULL,
  fallback_order TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE VIEW IF NOT EXISTS v_city_goal_benchmarks AS
SELECT
  e.city,
  e.region,
  e.academic_year,
  e.representative_university,
  e.avg_fee_all_students_eur,
  e.avg_fee_payers_eur,
  h.semester_label,
  h.property_type,
  h.condition_label,
  h.min_eur_sqm,
  h.max_eur_sqm
FROM education_city_benchmarks e
LEFT JOIN housing_city_prices h
  ON h.city = e.city;
