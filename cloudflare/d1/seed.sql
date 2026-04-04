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
    'pending_manual_or_semiautomated_ingestion',
    NULL,
    'Fonte primaria per prezzi casa e affitti. Import ancora da completare.'
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
    'downloaded_raw',
    '2026-04-04',
    'Fonte per benchmark reddito, patrimonio e liquidita.'
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

-- Seed intenzionalmente prudente:
-- housing_city_prices, household_expense_benchmarks, income_wealth_benchmarks e occupational_risk_benchmarks
-- restano vuote finche non completiamo l'import ufficiale da OMI, ISTAT, Banca d'Italia e INAIL.
