PRAGMA foreign_keys = ON;

INSERT OR REPLACE INTO source_catalog (
  source_id,
  label,
  provider,
  category,
  official,
  landing_url,
  access_mode,
  local_status,
  last_ingested_on,
  notes
) VALUES
  (
    'ae_omi_quotes',
    'Quotazioni immobiliari OMI',
    'Agenzia delle Entrate - OMI',
    'housing',
    1,
    'https://www1.agenziaentrate.gov.it/servizi/Consultazione/ricerca.htm?level=0',
    'consultazione web e forniture da verificare',
    'subset_14_cities_ready',
    '2026-04-05',
    'Fonte primaria per prezzi casa e affitti. Primo subset urbano OMI pronto per 14 citta benchmark.'
  ),
  (
    'istat_ipab',
    'Prezzi delle abitazioni (IPAB)',
    'ISTAT',
    'housing',
    1,
    'https://dati-congiuntura.istat.it/Index.aspx?DataSetCode=DCSP_IPAB',
    'export CSV e SDMX',
    'cataloged_only',
    NULL,
    'Fonte macro utile per trend e rivalutazione.'
  ),
  (
    'mur_university_contribution',
    'Contribuzione e interventi atenei',
    'MUR',
    'education',
    1,
    'https://dati-ustat.mur.gov.it/dataset/2018-contribuzione-e-interventi-atenei',
    'download CSV',
    'downloaded_raw_and_first_subset_ready',
    '2026-04-04',
    'Usata per benchmark fondo studi figli.'
  ),
  (
    'istat_household_spending',
    'Indagine sulle spese delle famiglie',
    'ISTAT',
    'household_expenses',
    1,
    'https://www.istat.it/informazioni-sulla-rilevazione/spese/',
    'tabelle ISTAT da estrarre',
    'cataloged_only',
    NULL,
    'Target per benchmark costo vita e fondo emergenze.'
  ),
  (
    'bdi_shiw_microdata',
    'Indagine sui bilanci delle famiglie italiane',
    'Banca d''Italia',
    'income_wealth',
    1,
    'https://www.bancaditalia.it/statistiche/tematiche/indagini-famiglie-imprese/bilanci-famiglie/distribuzione-microdati/',
    'download ZIP microdati',
    'processed_benchmarks_ready',
    '2026-04-05',
    'Fonte per benchmark reddito, patrimonio, attivita finanziarie e spese familiari.'
  ),
  (
    'inail_work_injuries',
    'Infortuni sul lavoro',
    'INAIL',
    'risk',
    1,
    'https://dati.inail.it/portale/it/dataset/infortuni-sul-lavoro.html',
    'download ZIP open data',
    'downloaded_raw',
    '2026-04-04',
    'Fonte per affinare il rischio professionale.'
  );

INSERT OR REPLACE INTO benchmark_fallback_rules (
  rule_key,
  benchmark_domain,
  fallback_order,
  description
) VALUES
  (
    'education_city_lookup',
    'education',
    'city > region > national_default > simulator_formula',
    'Per il fondo studi si cerca prima la citta, poi il benchmark regionale, poi un default nazionale, poi la formula nativa del simulatore.'
  ),
  (
    'housing_city_lookup',
    'housing',
    'city > province > region > macro_index > simulator_formula',
    'Per l''obiettivo casa si usa prima il dato urbano OMI e solo in assenza di benchmark si torna alla formula interna.'
  ),
  (
    'income_wealth_lookup',
    'income_wealth',
    'region_age_household > region_household > national_household > simulator_formula',
    'Per benchmark patrimoniali si usa il dettaglio massimo disponibile senza bloccare il motore.'
  ),
  (
    'occupational_risk_lookup',
    'risk',
    'sector_region > sector_national > occupation_rules_js',
    'Il rischio professionale usa INAIL quando disponibile e il dizionario locale come fallback.'
  );

INSERT INTO education_city_benchmarks (
  city,
  province,
  region,
  academic_year,
  benchmark_scope,
  representative_university,
  university_code,
  avg_fee_payers_eur,
  avg_fee_all_students_eur,
  annual_living_cost_low_eur,
  annual_living_cost_mid_eur,
  annual_living_cost_high_eur,
  source_id,
  notes
) VALUES
  ('Torino', 'TO', 'Piemonte', '2017-2018', 'university_fees', 'Torino', '00101', 1502.08, 1224.67, NULL, NULL, NULL, 'mur_university_contribution', 'Valore MUR dal subset locale.'),
  ('Milano', 'MI', 'Lombardia', '2017-2018', 'university_fees', 'Milano', '01501', 1752.23, 1426.12, NULL, NULL, NULL, 'mur_university_contribution', 'Valore MUR dal subset locale.'),
  ('Padova', 'PD', 'Veneto', '2017-2018', 'university_fees', 'Padova', '02801', 1574.08, 1318.43, NULL, NULL, NULL, 'mur_university_contribution', 'Valore MUR dal subset locale.'),
  ('Bologna', 'BO', 'Emilia-Romagna', '2017-2018', 'university_fees', 'Bologna', '03701', 1512.56, 1128.61, NULL, NULL, NULL, 'mur_university_contribution', 'Valore MUR dal subset locale.'),
  ('Firenze', 'FI', 'Toscana', '2017-2018', 'university_fees', 'Firenze', '04801', 1070.25, 868.99, NULL, NULL, NULL, 'mur_university_contribution', 'Valore MUR dal subset locale.'),
  ('Pisa', 'PI', 'Toscana', '2017-2018', 'university_fees', 'Pisa', '05001', 1184.60, 926.77, NULL, NULL, NULL, 'mur_university_contribution', 'Valore MUR dal subset locale.'),
  ('Roma', 'RM', 'Lazio', '2017-2018', 'university_fees', 'Roma La Sapienza', '05801', 1245.44, 946.29, NULL, NULL, NULL, 'mur_university_contribution', 'Valore MUR dal subset locale.'),
  ('Napoli', 'NA', 'Campania', '2017-2018', 'university_fees', 'Napoli Federico II', '06301', 1354.56, 879.16, NULL, NULL, NULL, 'mur_university_contribution', 'Valore MUR dal subset locale.'),
  ('Bari', 'BA', 'Puglia', '2017-2018', 'university_fees', 'Bari', '07201', 1039.23, 742.82, NULL, NULL, NULL, 'mur_university_contribution', 'Valore MUR dal subset locale.'),
  ('Palermo', 'PA', 'Sicilia', '2017-2018', 'university_fees', 'Palermo', '08201', 1155.97, 787.80, NULL, NULL, NULL, 'mur_university_contribution', 'Valore MUR dal subset locale.'),
  ('Catania', 'CT', 'Sicilia', '2017-2018', 'university_fees', 'Catania', '08701', 770.19, 559.05, NULL, NULL, NULL, 'mur_university_contribution', 'Valore MUR dal subset locale.'),
  ('Cagliari', 'CA', 'Sardegna', '2017-2018', 'university_fees', 'Cagliari', '09201', 900.99, 592.36, NULL, NULL, NULL, 'mur_university_contribution', 'Valore MUR dal subset locale.'),
  ('Verona', 'VR', 'Veneto', '2017-2018', 'university_fees', 'Verona', '02301', 1426.32, 1195.19, NULL, NULL, NULL, 'mur_university_contribution', 'Valore MUR dal subset locale.'),
  ('Venezia', 'VE', 'Veneto', '2017-2018', 'university_fees', 'Venezia Ca Foscari', '02701', 1553.90, 1293.19, NULL, NULL, NULL, 'mur_university_contribution', 'Valore MUR dal subset locale.');

INSERT INTO housing_city_prices (
  city,
  province,
  region,
  semester_label,
  property_type,
  condition_label,
  min_eur_sqm,
  max_eur_sqm,
  rent_min_eur_sqm_month,
  rent_max_eur_sqm_month,
  source_id,
  confidence_label,
  notes
) VALUES
  ('Torino', 'TO', 'Piemonte', '20252', 'residenziale_median', 'mediana_zone_residenziali', 1650.00, 2400.00, 6.00, 9.00, 'ae_omi_quotes', 'official_subset', 'Subset OMI 20252, 47 zone residenziali campionate.'),
  ('Milano', 'MI', 'Lombardia', '20252', 'residenziale_median', 'mediana_zone_residenziali', 3600.00, 4450.00, 12.00, 15.85, 'ae_omi_quotes', 'official_subset', 'Subset OMI 20252, 42 zone residenziali campionate.'),
  ('Padova', 'PD', 'Veneto', '20252', 'residenziale_median', 'mediana_zone_residenziali', 1125.00, 1500.00, 5.65, 7.55, 'ae_omi_quotes', 'official_subset', 'Subset OMI 20252, 18 zone residenziali campionate.'),
  ('Bologna', 'BO', 'Emilia-Romagna', '20252', 'residenziale_median', 'mediana_zone_residenziali', 2400.00, 3200.00, 9.50, 14.00, 'ae_omi_quotes', 'official_subset', 'Subset OMI 20252, 33 zone residenziali campionate.'),
  ('Firenze', 'FI', 'Toscana', '20252', 'residenziale_median', 'mediana_zone_residenziali', 2550.00, 3300.00, 8.70, 11.50, 'ae_omi_quotes', 'official_subset', 'Subset OMI 20252, 33 zone residenziali campionate.'),
  ('Pisa', 'PI', 'Toscana', '20252', 'residenziale_median', 'mediana_zone_residenziali', 1475.00, 2225.00, 6.20, 9.20, 'ae_omi_quotes', 'official_subset', 'Subset OMI 20252, 16 zone residenziali campionate.'),
  ('Roma', 'RM', 'Lazio', '20252', 'residenziale_median', 'mediana_zone_residenziali', 2250.00, 3200.00, 9.80, 13.80, 'ae_omi_quotes', 'official_subset', 'Subset OMI 20252, 213 zone residenziali campionate.'),
  ('Napoli', 'NA', 'Campania', '20252', 'residenziale_median', 'mediana_zone_residenziali', 1650.00, 2550.00, 6.00, 9.10, 'ae_omi_quotes', 'official_subset', 'Subset OMI 20252, 63 zone residenziali campionate.'),
  ('Bari', 'BA', 'Puglia', '20252', 'residenziale_median', 'mediana_zone_residenziali', 1500.00, 1900.00, 5.50, 6.70, 'ae_omi_quotes', 'official_subset', 'Subset OMI 20252, 27 zone residenziali campionate.'),
  ('Palermo', 'PA', 'Sicilia', '20252', 'residenziale_median', 'mediana_zone_residenziali', 1100.00, 1450.00, 3.50, 5.00, 'ae_omi_quotes', 'official_subset', 'Subset OMI 20252, 51 zone residenziali campionate.'),
  ('Catania', 'CT', 'Sicilia', '20252', 'residenziale_median', 'mediana_zone_residenziali', 1000.00, 1450.00, 3.50, 5.15, 'ae_omi_quotes', 'official_subset', 'Subset OMI 20252, 26 zone residenziali campionate.'),
  ('Cagliari', 'CA', 'Sardegna', '20252', 'residenziale_median', 'mediana_zone_residenziali', 1800.00, 2400.00, 6.70, 9.20, 'ae_omi_quotes', 'official_subset', 'Subset OMI 20252, 21 zone residenziali campionate.'),
  ('Verona', 'VR', 'Veneto', '20252', 'residenziale_median', 'mediana_zone_residenziali', 1600.00, 2050.00, 7.50, 9.50, 'ae_omi_quotes', 'official_subset', 'Subset OMI 20252, 15 zone residenziali campionate.'),
  ('Venezia', 'VE', 'Veneto', '20252', 'residenziale_median', 'mediana_zone_residenziali', 1800.00, 2400.00, 8.50, 13.00, 'ae_omi_quotes', 'official_subset', 'Subset OMI 20252, 33 zone residenziali campionate.');

INSERT INTO household_expense_benchmarks (
  region,
  household_type,
  children_band,
  expense_type,
  period_label,
  monthly_amount_eur,
  source_id,
  notes
) VALUES
  ('Italia', 'single', '0', 'consumption_median', '2022', 1472.00, 'bdi_shiw_microdata', 'Mediana nazionale ponderata SHIW 2022.'),
  ('Italia', 'single', '1', 'consumption_median', '2022', 1437.50, 'bdi_shiw_microdata', 'Mediana nazionale ponderata SHIW 2022.'),
  ('Italia', 'single', '2_plus', 'consumption_median', '2022', 1231.67, 'bdi_shiw_microdata', 'Mediana nazionale ponderata SHIW 2022.'),
  ('Italia', 'couple', '0', 'consumption_median', '2022', 1908.33, 'bdi_shiw_microdata', 'Mediana nazionale ponderata SHIW 2022.'),
  ('Italia', 'family_1', '1', 'consumption_median', '2022', 1951.67, 'bdi_shiw_microdata', 'Mediana nazionale ponderata SHIW 2022.'),
  ('Italia', 'family_2_plus', '2_plus', 'consumption_median', '2022', 1870.00, 'bdi_shiw_microdata', 'Mediana nazionale ponderata SHIW 2022.'),
  ('Italia', 'extended', '0', 'consumption_median', '2022', 2310.00, 'bdi_shiw_microdata', 'Mediana nazionale ponderata SHIW 2022.');

INSERT INTO income_wealth_benchmarks (
  region,
  age_band,
  household_type,
  period_label,
  income_median_eur,
  wealth_median_eur,
  liquid_assets_median_eur,
  source_id,
  notes
) VALUES
  ('Italia', 'all_ages', 'single', '2022', 20407.84, 107500.00, 7582.16, 'bdi_shiw_microdata', 'Benchmark nazionale SHIW 2022; attivita finanziarie usate come proxy di liquidita.'),
  ('Italia', 'all_ages', 'couple', '2022', 35230.87, 163418.55, 10000.00, 'bdi_shiw_microdata', 'Benchmark nazionale SHIW 2022; attivita finanziarie usate come proxy di liquidita.'),
  ('Italia', 'all_ages', 'family_1', '2022', 37516.62, 178675.19, 11000.00, 'bdi_shiw_microdata', 'Benchmark nazionale SHIW 2022; attivita finanziarie usate come proxy di liquidita.'),
  ('Italia', 'all_ages', 'family_2_plus', '2022', 32697.04, 184000.00, 10000.00, 'bdi_shiw_microdata', 'Benchmark nazionale SHIW 2022; attivita finanziarie usate come proxy di liquidita.'),
  ('Italia', 'all_ages', 'extended', '2022', 41202.51, 170000.00, 10000.00, 'bdi_shiw_microdata', 'Benchmark nazionale SHIW 2022; attivita finanziarie usate come proxy di liquidita.');

-- Occupational risk resta da alimentare nel prossimo step con benchmark INAIL.
