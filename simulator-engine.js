(function (root) {
  const DB = root.FAMILY_ADVISOR_DB;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function roundStep(value, step) {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value / step) * step;
  }

  function sum(values) {
    return values.reduce(function (acc, value) {
      return acc + (Number.isFinite(value) ? value : 0);
    }, 0);
  }

  function average(values) {
    return values.length ? sum(values) / values.length : 0;
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function titleCase(value) {
    return String(value || "")
      .split(/\s+/)
      .filter(Boolean)
      .map(function (part) {
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join(" ");
  }

  function safeNumber(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback || 0;
  }

  function parseMoneyToken(raw) {
    if (!raw) return 0;
    var value = normalizeText(raw).replace(/€/g, "").replace(/\s+/g, "");
    var multiplier = 1;

    if (/m(?!e)/.test(value)) multiplier = 1000000;
    if (/k/.test(value)) multiplier = 1000;

    value = value.replace(/[km]/g, "");
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(value)) {
      value = value.replace(/\./g, "").replace(",", ".");
    } else if (value.indexOf(",") >= 0 && value.indexOf(".") >= 0) {
      value = value.replace(/\./g, "").replace(",", ".");
    } else if (value.indexOf(",") >= 0) {
      value = value.replace(",", ".");
    }

    var number = parseFloat(value);
    return Number.isFinite(number) ? number * multiplier : 0;
  }

  function extractMonetaryMatches(text) {
    var matches = String(text || "").match(/(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?\s*[km]?)/gi) || [];
    return matches
      .map(parseMoneyToken)
      .filter(function (value) {
        return value > 0;
      });
  }

  function extractMonetaryMatchesWithIndex(text) {
    var source = String(text || "");
    var regex = /(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?\s*[km]?)/gi;
    var results = [];
    var match;

    while ((match = regex.exec(source))) {
      var value = parseMoneyToken(match[0]);
      if (value > 0) {
        results.push({
          raw: match[0],
          value: value,
          index: match.index
        });
      }
    }

    return results;
  }

  function splitNarrativeBlocks(text) {
    return String(text || "")
      .split(/(?:\n|;|\.(?=\s|$)|,\s+(?=[A-Za-zÀ-ÿ]))/)
      .map(function (entry) {
        return entry.trim();
      })
      .filter(Boolean);
  }

  function findFirstMoneyByKeywords(text, keywords, options) {
    options = options || {};
    var sentences = splitNarrativeBlocks(text);
    var sourceText = String(text || "");
    var loweredText = sourceText.toLowerCase();
    var minValue = safeNumber(options.min, 0);
    var maxValue = options.max == null ? Number.POSITIVE_INFINITY : safeNumber(options.max, Number.POSITIVE_INFINITY);
    var scanWindow = safeNumber(options.window, 90);
    var indexedMatches = extractMonetaryMatchesWithIndex(sourceText).filter(function (entry) {
      return entry.value >= minValue && entry.value <= maxValue;
    });
    var bestCandidate = null;

    function considerCandidate(candidate, distance) {
      if (!candidate) return;
      if (!bestCandidate || distance < bestCandidate.distance || (distance === bestCandidate.distance && candidate.value > bestCandidate.value)) {
        bestCandidate = {
          value: candidate.value,
          distance: distance
        };
      }
    }

    for (var keywordIndex = 0; keywordIndex < keywords.length; keywordIndex += 1) {
      var keyword = keywords[keywordIndex];
      var searchPosition = 0;
      while (searchPosition < loweredText.length) {
        var position = loweredText.indexOf(keyword, searchPosition);
        if (position < 0) break;
        for (var matchIndex = 0; matchIndex < indexedMatches.length; matchIndex += 1) {
          var candidate = indexedMatches[matchIndex];
          var distance = Math.abs(candidate.index - position);
          if (distance <= scanWindow) {
            considerCandidate(candidate, distance);
          }
        }
        searchPosition = position + keyword.length;
      }
    }

    if (bestCandidate) return bestCandidate.value;

    for (var i = 0; i < sentences.length; i += 1) {
      var normalizedSentence = normalizeText(sentences[i]);
      if (keywords.some(function (keyword) { return normalizedSentence.indexOf(keyword) >= 0; })) {
        var sentenceMatches = extractMonetaryMatches(sentences[i]).filter(function (value) {
          return value >= minValue && value <= maxValue;
        });
        if (sentenceMatches.length) return Math.max.apply(null, sentenceMatches);
      }
    }
    return 0;
  }

  function findFirstIntegerByKeywords(text, keywords, minValue, maxValue) {
    var sentences = splitNarrativeBlocks(text);
    var normalizedText = normalizeText(text);

    for (var keywordIndex = 0; keywordIndex < keywords.length; keywordIndex += 1) {
      var keyword = keywords[keywordIndex];
      var position = normalizedText.indexOf(keyword);
      if (position >= 0) {
        var windowText = String(text || "").slice(position, position + 80);
        var nearbyNumbers = windowText.match(/\d{1,2}/g) || [];
        for (var nearbyIndex = 0; nearbyIndex < nearbyNumbers.length; nearbyIndex += 1) {
          var nearbyValue = parseInt(nearbyNumbers[nearbyIndex], 10);
          if (nearbyValue >= minValue && nearbyValue <= maxValue) return nearbyValue;
        }
      }
    }

    for (var i = 0; i < sentences.length; i += 1) {
      var normalizedSentence = normalizeText(sentences[i]);
      if (keywords.some(function (keyword) { return normalizedSentence.indexOf(keyword) >= 0; })) {
        var numbers = sentences[i].match(/\d{1,2}/g) || [];
        for (var j = 0; j < numbers.length; j += 1) {
          var value = parseInt(numbers[j], 10);
          if (value >= minValue && value <= maxValue) return value;
        }
      }
    }
    return 0;
  }

  function formatCurrency(value) {
    return Math.round(safeNumber(value, 0)).toLocaleString("it-IT");
  }

  function educationCatalog() {
    return DB.benchmarkCatalog && DB.benchmarkCatalog.education ? DB.benchmarkCatalog.education : null;
  }

  function homeCatalog() {
    return DB.benchmarkCatalog && DB.benchmarkCatalog.home ? DB.benchmarkCatalog.home : null;
  }

  function findCityBenchmark(catalog, city) {
    if (!catalog || !city) return null;
    var normalizedCity = normalizeText(city).replace(/\s+/g, " ").trim();
    return (catalog.cityBenchmarks || []).find(function (entry) {
      return normalizeText(entry.city).replace(/\s+/g, " ").trim() === normalizedCity;
    }) || null;
  }

  function findEducationCityBenchmark(city) {
    return findCityBenchmark(educationCatalog(), city);
  }

  function findHomeCityBenchmark(city) {
    return findCityBenchmark(homeCatalog(), city);
  }

  function benchmarkCities() {
    var byCity = {};
    [educationCatalog(), homeCatalog()].forEach(function (catalog) {
      (catalog && catalog.cityBenchmarks ? catalog.cityBenchmarks : []).forEach(function (entry) {
        var key = normalizeText(entry.city).replace(/\s+/g, " ").trim();
        if (key && !byCity[key]) byCity[key] = { city: entry.city };
      });
    });
    return Object.keys(byCity).map(function (key) { return byCity[key]; });
  }

  function extractResidenceCity(text) {
    var cities = benchmarkCities();
    if (!cities.length) return "";
    var normalizedText = " " + normalizeText(text).replace(/[.,;:()]/g, " ") + " ";
    var cityMatch = cities
      .slice()
      .sort(function (left, right) {
        return right.city.length - left.city.length;
      })
      .find(function (entry) {
        var cityPattern = escapeRegExp(normalizeText(entry.city)).replace(/\s+/g, "\\s+");
        var regex = new RegExp("(^|\\W)" + cityPattern + "(?=\\W|$)");
        return regex.test(normalizedText);
      });
    return cityMatch ? cityMatch.city : "";
  }

  function resolveEducationBenchmark(profile, overrides) {
    var catalog = educationCatalog();
    if (!catalog) return null;

    var cityCandidate =
      (overrides && overrides.benchmarkCity) ||
      profile.residenceCity ||
      extractResidenceCity(profile.notes || "");
    var cityBenchmark = findEducationCityBenchmark(cityCandidate);
    var benchmark = cityBenchmark || catalog.nationalDefault;
    if (!benchmark) return null;

    var costBand = benchmark.costBand || catalog.nationalDefault.costBand || "medium";
    var supportAnnual =
      safeNumber(catalog.supportAnnualByCostBand[costBand], 0) ||
      safeNumber(catalog.supportAnnualByCostBand.medium, 4500);
    var ancillaryAnnual = safeNumber(catalog.booksAndMobilityAnnual, 0);
    var tuitionAnnual =
      safeNumber(benchmark.avgFeeAllStudents, 0) ||
      safeNumber(catalog.nationalDefault.avgFeeAllStudents, 1322.56);
    var studyDurationYears = safeNumber(catalog.studyDurationYears, 5);
    var childCount = Math.max(1, safeNumber(profile.childrenCount, 1));
    var annualTotalPerChild = tuitionAnnual + supportAnnual + ancillaryAnnual;
    var totalPerChild = annualTotalPerChild * studyDurationYears;

    return {
      sourceId: catalog.sourceId || "mur_university_contribution",
      scope: cityBenchmark ? "city" : "national",
      city: cityBenchmark ? cityBenchmark.city : (cityCandidate || catalog.nationalDefault.city || "Italia"),
      region: benchmark.region || catalog.nationalDefault.region || "",
      university: benchmark.university || "",
      universityCode: benchmark.universityCode || "",
      costBand: costBand,
      annualFee: tuitionAnnual,
      annualSupport: supportAnnual,
      annualAncillary: ancillaryAnnual,
      annualTotalPerChild: annualTotalPerChild,
      studyDurationYears: studyDurationYears,
      totalPerChild: totalPerChild,
      totalTarget: totalPerChild * childCount
    };
  }

  function householdHomeKey(profile) {
    var hasPartner = !!(profile.spouseName || profile.maritalStatus === "Sposato" || profile.maritalStatus === "Convivente");
    if (profile.childrenCount >= 3) return "family_3_plus";
    if (profile.childrenCount >= 2) return "family_2";
    if (profile.childrenCount === 1) return "family_1";
    return hasPartner ? "couple" : "single";
  }

  function resolveHomeBenchmark(profile, overrides) {
    var catalog = homeCatalog();
    if (!catalog) return null;

    var cityCandidate =
      (overrides && overrides.benchmarkCity) ||
      profile.residenceCity ||
      extractResidenceCity(profile.notes || "");
    var cityBenchmark = findHomeCityBenchmark(cityCandidate);
    var benchmark = cityBenchmark || catalog.nationalDefault;
    if (!benchmark) return null;

    var householdKey = householdHomeKey(profile);
    var targetSqm =
      safeNumber(overrides && overrides.targetSqm, 0) ||
      safeNumber(catalog.targetSqmByHousehold[householdKey], 0) ||
      safeNumber(catalog.targetSqmByHousehold.single, 60);
    var buyMidEurSqm =
      safeNumber(benchmark.buyMidEurSqm, 0) ||
      safeNumber(catalog.nationalDefault.buyMidEurSqm, 2062.5);
    var propertyValue =
      safeNumber(overrides && overrides.propertyValue, 0) ||
      roundStep(targetSqm * buyMidEurSqm, 5000);
    var downPaymentRate = safeNumber(catalog.downPaymentRate, 0.2);
    var closingCostRate = safeNumber(catalog.closingCostRate, 0.08);
    var setupBuffer =
      safeNumber(catalog.setupBufferBase, 7000) +
      safeNumber(catalog.setupBufferPerChild, 0) * safeNumber(profile.childrenCount, 0);
    var totalTarget = roundStep(propertyValue * (downPaymentRate + closingCostRate) + setupBuffer, 5000);

    return {
      sourceId: catalog.sourceId || "ae_omi_quotes",
      scope: cityBenchmark ? "city" : "national",
      city: cityBenchmark ? cityBenchmark.city : (cityCandidate || catalog.nationalDefault.city || "Italia"),
      province: benchmark.province || "",
      region: benchmark.region || catalog.nationalDefault.region || "",
      semester: benchmark.semester || catalog.semester || "",
      householdKey: householdKey,
      targetSqm: targetSqm,
      buyMidEurSqm: buyMidEurSqm,
      buyMidP25EurSqm: safeNumber(benchmark.buyMidP25EurSqm, 0),
      buyMidP75EurSqm: safeNumber(benchmark.buyMidP75EurSqm, 0),
      rentMidEurSqmMonth: safeNumber(benchmark.rentMidEurSqmMonth, 0),
      propertyValue: propertyValue,
      downPaymentRate: downPaymentRate,
      closingCostRate: closingCostRate,
      setupBuffer: setupBuffer,
      totalTarget: totalTarget
    };
  }

  function householdExpenseCatalog() {
    return DB.benchmarkCatalog && DB.benchmarkCatalog.householdExpense ? DB.benchmarkCatalog.householdExpense : null;
  }

  function incomeWealthCatalog() {
    return DB.benchmarkCatalog && DB.benchmarkCatalog.incomeWealth ? DB.benchmarkCatalog.incomeWealth : null;
  }

  function resolveProfileRegion(profile) {
    var city = profile.residenceCity || extractResidenceCity(profile.notes || "");
    if (!city) return "";
    var home = findHomeCityBenchmark(city);
    if (home && home.region) return home.region;
    var education = findEducationCityBenchmark(city);
    if (education && education.region) return education.region;
    return "";
  }

  function resolveProfileMacroArea(profile) {
    var catalog = householdExpenseCatalog();
    var region = resolveProfileRegion(profile);
    if (catalog && catalog.regionMacroMap && region && catalog.regionMacroMap[region]) {
      return catalog.regionMacroMap[region];
    }
    return "Italia";
  }

  function householdChildrenBand(profile) {
    if (profile.childrenCount >= 2) return "2_plus";
    return String(Math.max(0, profile.childrenCount || 0));
  }

  function householdBenchmarkType(profile) {
    var homeKey = householdHomeKey(profile);
    if (homeKey === "family_2" || homeKey === "family_3_plus") return "family_2_plus";
    return homeKey;
  }

  function nationalHouseholdRows() {
    var catalog = householdExpenseCatalog();
    if (!catalog) return [];
    return (catalog.rows || []).filter(function (entry) {
      return entry.macro_area === "Italia";
    });
  }

  function nationalIncomeRows() {
    var catalog = incomeWealthCatalog();
    if (!catalog) return [];
    return (catalog.rows || []).filter(function (entry) {
      return entry.macro_area === "Italia" && entry.age_band === "all_ages";
    });
  }

  function aggregateSampleSize(rows) {
    return Math.round(sum((rows || []).map(function (entry) {
      return safeNumber(entry.sample_size, 0);
    })));
  }

  function weightedAverage(rows, field) {
    var totalWeight = aggregateSampleSize(rows);
    if (!totalWeight) return 0;
    return rows.reduce(function (acc, entry) {
      return acc + safeNumber(entry[field], 0) * safeNumber(entry.sample_size, 0);
    }, 0) / totalWeight;
  }

  function personaRowsById() {
    var rows = nationalHouseholdRows();
    return {
      single_no_children: rows.filter(function (entry) { return entry.household_type === "single" && entry.children_band === "0"; }),
      single_with_children: rows.filter(function (entry) { return entry.household_type === "single" && entry.children_band !== "0"; }),
      couple_no_children: rows.filter(function (entry) { return entry.household_type === "couple" && entry.children_band === "0"; }),
      family_one_child: rows.filter(function (entry) { return entry.household_type === "family_1"; }),
      family_two_plus: rows.filter(function (entry) { return entry.household_type === "family_2_plus"; }),
      extended_household: rows.filter(function (entry) { return entry.household_type === "extended"; })
    };
  }

  function incomeBenchmarkForHouseholdType(householdType) {
    return nationalIncomeRows().find(function (entry) {
      return entry.household_type === householdType;
    }) || null;
  }

  function personaBenchmarks() {
    var rowMap = personaRowsById();
    var catalog = DB.personaCatalog || [];
    var totalSample = aggregateSampleSize([].concat.apply([], Object.keys(rowMap).map(function (key) { return rowMap[key]; }))) || 1;

    return catalog.map(function (persona) {
      var rows = rowMap[persona.id] || [];
      var sampleSize = aggregateSampleSize(rows);
      var expenseMedian = weightedAverage(rows, "monthly_consumption_median_eur");
      var savingMedian = weightedAverage(rows, "monthly_saving_median_eur");
      var incomeRow = incomeBenchmarkForHouseholdType(persona.householdType);
      var annualIncome = incomeRow ? safeNumber(incomeRow.income_median_eur, 0) : roundStep((expenseMedian + savingMedian) * 12, 500);
      var wealthMedian = incomeRow ? safeNumber(incomeRow.wealth_median_eur, 0) : roundStep(expenseMedian * 48, 1000);
      var financialAssetsMedian = incomeRow ? safeNumber(incomeRow.financial_assets_median_eur, 0) : roundStep(Math.max(savingMedian * 10, 2000), 500);
      var share = sampleSize / totalSample;

      if (persona.id === "single_with_children") {
        annualIncome = roundStep(Math.max(annualIncome, (expenseMedian + savingMedian) * 12), 500);
      }

      return Object.assign({}, persona, {
        sampleSize: sampleSize,
        share: share,
        sharePct: Math.round(share * 1000) / 10,
        typicalAnnualIncome: roundStep(annualIncome, 500),
        typicalWealth: roundStep(wealthMedian, 1000),
        typicalFinancialAssets: roundStep(financialAssetsMedian, 500),
        typicalMonthlyConsumption: roundStep(expenseMedian, 10),
        typicalMonthlySaving: roundStep(savingMedian, 10)
      });
    }).sort(function (left, right) {
      return right.share - left.share;
    });
  }

  function detectPersona(profile) {
    var catalog = personaBenchmarks();
    var hasPartner = !!(profile.spouseName || profile.maritalStatus === "Sposato" || profile.maritalStatus === "Convivente");
    var personaId = "single_no_children";

    if (!hasPartner && profile.childrenCount > 0) personaId = "single_with_children";
    else if (profile.childrenCount >= 2) personaId = "family_two_plus";
    else if (profile.childrenCount === 1 && hasPartner) personaId = "family_one_child";
    else if (profile.age >= 58 && (hasPartner || profile.totalAssets >= 180000 || profile.housingStatus !== "Affittuario")) personaId = "extended_household";
    else if (hasPartner) personaId = "couple_no_children";

    var current = catalog.find(function (persona) { return persona.id === personaId; }) || catalog[0] || null;
    return {
      current: current,
      distribution: catalog
    };
  }

  function incomeAgeBand(age) {
    if (age <= 34) return "under_35";
    if (age <= 44) return "35_44";
    if (age <= 54) return "45_54";
    if (age <= 64) return "55_64";
    return "65_plus";
  }

  function resolveHouseholdExpenseBenchmark(profile) {
    var catalog = householdExpenseCatalog();
    if (!catalog) return null;
    var macroArea = resolveProfileMacroArea(profile);
    var hhType = householdBenchmarkType(profile);
    var childBand = householdChildrenBand(profile);
    var rows = catalog.rows || [];

    function lookup(area, type, band) {
      return rows.find(function (entry) {
        return entry.macro_area === area && entry.household_type === type && entry.children_band === band;
      }) || null;
    }

    var benchmark =
      lookup(macroArea, hhType, childBand) ||
      lookup("Italia", hhType, childBand) ||
      lookup(macroArea, hhType, "0") ||
      lookup("Italia", hhType, "0");
    if (!benchmark && catalog.nationalDefault) {
      benchmark = {
        macro_area: catalog.nationalDefault.macroArea,
        household_type: catalog.nationalDefault.householdType,
        children_band: catalog.nationalDefault.childrenBand,
        monthly_consumption_median_eur: catalog.nationalDefault.monthlyConsumptionMedianEur,
        monthly_saving_median_eur: catalog.nationalDefault.monthlySavingMedianEur,
        source_id: catalog.sourceId || "bdi_shiw_microdata",
        benchmark_period: catalog.period || "2022",
        sample_size: 0
      };
    }
    return benchmark;
  }

  function resolveIncomeWealthBenchmark(profile) {
    var catalog = incomeWealthCatalog();
    if (!catalog) return null;
    var macroArea = resolveProfileMacroArea(profile);
    var hhType = householdBenchmarkType(profile);
    var ageBand = incomeAgeBand(profile.age || 45);
    var minSample = safeNumber(catalog.minSampleSizeAgeBand, 10);
    var rows = catalog.rows || [];

    function lookup(area, band, type, enforceSample) {
      return rows.find(function (entry) {
        if (entry.macro_area !== area || entry.age_band !== band || entry.household_type !== type) return false;
        return !enforceSample || safeNumber(entry.sample_size, 0) >= minSample;
      }) || null;
    }

    var benchmark =
      lookup(macroArea, ageBand, hhType, true) ||
      lookup(macroArea, "all_ages", hhType, false) ||
      lookup("Italia", ageBand, hhType, true) ||
      lookup("Italia", "all_ages", hhType, false);

    if (!benchmark && catalog.nationalDefault) {
      benchmark = {
        macro_area: catalog.nationalDefault.macroArea,
        age_band: catalog.nationalDefault.ageBand,
        household_type: catalog.nationalDefault.householdType,
        income_median_eur: catalog.nationalDefault.incomeMedianEur,
        wealth_median_eur: catalog.nationalDefault.wealthMedianEur,
        financial_assets_median_eur: catalog.nationalDefault.financialAssetsMedianEur,
        source_id: catalog.sourceId || "bdi_shiw_microdata",
        benchmark_period: catalog.period || "2022",
        sample_size: 0
      };
    }
    return benchmark;
  }

  function estimateNetMonthlyFromGross(grossAnnualIncome) {
    var gross = safeNumber(grossAnnualIncome, 0);
    if (!gross) return 0;
    var ratio = gross <= 28000 ? 0.67 : gross <= 55000 ? 0.62 : gross <= 90000 ? 0.58 : 0.54;
    return Math.round((gross * ratio) / 12);
  }

  function estimateGrossAnnualFromNet(netMonthlyIncome) {
    var net = safeNumber(netMonthlyIncome, 0);
    if (!net) return 0;
    var annualNet = net * 12;
    var ratio = annualNet <= 22000 ? 0.67 : annualNet <= 36000 ? 0.62 : annualNet <= 55000 ? 0.58 : 0.54;
    return Math.round(annualNet / ratio);
  }

  function householdFloor(profile) {
    return 850 + (profile.spouseName || profile.maritalStatus === "Sposato" || profile.maritalStatus === "Convivente" ? 320 : 0) + profile.childrenCount * 240;
  }

  function occupationRiskFor(profession) {
    var normalizedProfession = normalizeText(profession);
    for (var i = 0; i < DB.occupationRules.length; i += 1) {
      var rule = DB.occupationRules[i];
      if (rule.keywords.some(function (keyword) { return normalizedProfession.indexOf(keyword) >= 0; })) {
        return { risk: rule.risk, factor: rule.factor };
      }
    }
    return { risk: "medio", factor: 1 };
  }

  function deriveRiskProfile(profile) {
    if (profile.age >= 55) return "prudente";
    if (profile.monthlySavings >= 1200 && profile.age <= 45) return "dinamico";
    return "bilanciato";
  }

  function cleanNameCandidate(value) {
    var candidate = String(value || "")
      .replace(/^(?:nome(?:\s+e\s+cognome)?|cliente|profilo completo|mi chiamo|si chiama|sono)\s*[:\-]?\s*/i, "")
      .replace(/[,:;.\-]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!candidate || /\d/.test(candidate)) return "";

    var normalizedCandidate = normalizeText(candidate);
    var blockedSingles = [
      "single", "sposato", "convivente", "divorziato", "vedovo",
      "affittuario", "proprietario", "mutuo", "reddito", "patrimonio",
      "obiettivi", "obiettivo", "pensione", "casa", "salute", "emergenze",
      "medico", "ingegnere", "impiegato", "consulente", "avvocato",
      "imprenditore", "artigiano", "docente", "operaio", "pensionato",
      "studente", "manager", "dirigente", "commercialista", "architetto"
    ];
    if (blockedSingles.indexOf(normalizedCandidate) >= 0) return "";

    var tokens = candidate.split(/\s+/).filter(Boolean);
    if (!tokens.length || tokens.length > 3) return "";
    if (!tokens.every(function (token) { return /^[A-Za-zÀ-ÿ'’\-]+$/.test(token); })) return "";

    return titleCase(candidate);
  }

  function extractName(text) {
    var original = String(text || "").trim();
    var patterns = [
      /profilo completo:\s*([^,.\n]+)/i,
      /(?:nome(?:\s+e\s+cognome)?|cliente)\s*[:\s]+([A-Za-zÀ-ÿ'’\-]+(?:\s+[A-Za-zÀ-ÿ'’\-]+){0,2})/i,
      /(?:mi\s+chiamo|si\s+chiama|sono)\s+([A-Za-zÀ-ÿ'’\-]+(?:\s+[A-Za-zÀ-ÿ'’\-]+){0,2})/i,
      /^([A-Za-zÀ-ÿ'’\-]+(?:\s+[A-Za-zÀ-ÿ'’\-]+){0,2})$/,
      /^([A-Za-zÀ-ÿ'’\-]+(?:\s+[A-Za-zÀ-ÿ'’\-]+){0,2})(?=,|\s+\d{1,2}\s+anni|\s+(?:sposat|single|convivent|divorziat|vedov)|$)/i
    ];
    for (var i = 0; i < patterns.length; i += 1) {
      var match = original.match(patterns[i]);
      if (match && match[1]) {
        var candidate = cleanNameCandidate(match[1]);
        if (candidate) return candidate;
      }
    }
    return "";
  }

  function extractAge(text) {
    var match = String(text || "").match(/(\d{2})\s*anni/i);
    return match ? parseInt(match[1], 10) : 0;
  }

  function inferStandaloneReplyFields(text, profile) {
    var trimmed = String(text || "").trim();
    var normalized = normalizeText(trimmed);
    var inferred = {
      age: 0,
      grossAnnualIncome: 0,
      netMonthlyIncome: 0
    };

    if (!trimmed || trimmed.length > 48) return inferred;

    if (!profile.age) {
      var agePatterns = [
        /^(?:ho\s+)?(\d{1,2})\s*anni?$/i,
        /^(?:eta|età)\s*[:\-]?\s*(\d{1,2})$/i,
        /^(\d{1,2})$/
      ];

      for (var ageIndex = 0; ageIndex < agePatterns.length; ageIndex += 1) {
        var ageMatch = trimmed.match(agePatterns[ageIndex]);
        if (ageMatch) {
          inferred.age = parseInt(ageMatch[1], 10);
          break;
        }
      }
    }

    if (!profile.grossAnnualIncome && !profile.netMonthlyIncome) {
      var incomePatterns = [
        /^(?:ho\s+)?(\d{3,6}(?:[.,]\d+)?)\s*(?:€|euro)?(?:\s*(?:di\s+)?(?:reddito|stipendio|ral))?(?:\s*(?:annui?|annuo|mensili?|mensile|netti?|netto|lordi?|lordo|al mese))?$/i,
        /^(?:reddito|stipendio|ral)\s*[:\-]?\s*(\d{3,6}(?:[.,]\d+)?)\s*(?:€|euro)?(?:\s*(?:annui?|annuo|mensili?|mensile|netti?|netto|lordi?|lordo))?$/i
      ];

      for (var incomeIndex = 0; incomeIndex < incomePatterns.length; incomeIndex += 1) {
        var incomeMatch = trimmed.match(incomePatterns[incomeIndex]);
        if (incomeMatch) {
          var inferredIncome = parseMoneyToken(incomeMatch[1]);
          if (inferredIncome >= 10000) inferred.grossAnnualIncome = inferredIncome;
          else if (inferredIncome >= 500) inferred.netMonthlyIncome = inferredIncome;
          break;
        }
      }

      if (!inferred.grossAnnualIncome && !inferred.netMonthlyIncome) {
        var numericMatches = normalized.match(/\d+(?:[.,]\d+)?/g) || [];
        if (numericMatches.length === 1) {
          var compactIncome = parseMoneyToken(numericMatches[0]);
          if (compactIncome >= 10000) inferred.grossAnnualIncome = compactIncome;
          else if (compactIncome >= 500) inferred.netMonthlyIncome = compactIncome;
        }
      }
    }

    return inferred;
  }

  function extractBirthDate(text) {
    var match = String(text || "").match(/(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : "";
  }

  function extractMaritalStatus(text) {
    var normalized = normalizeText(text);
    var entries = Object.entries(DB.chatKeywordMap.marital);
    for (var i = 0; i < entries.length; i += 1) {
      if (entries[i][1].some(function (keyword) { return normalized.indexOf(keyword) >= 0; })) {
        return entries[i][0];
      }
    }
    return "";
  }

  function extractSpouse(text) {
    var original = String(text || "");
    var spouseName = "";
    var spouseAge = 0;
    var nameMatch = original.match(/(?:con|moglie|marito)\s+([A-Za-zÀ-ÿ'’]+)/i);
    if (nameMatch) spouseName = titleCase(nameMatch[1]);
    var ageMatch = original.match(/(?:moglie|marito|con)\s+[A-Za-zÀ-ÿ'’]+\s+(\d{2})\s+anni/i);
    if (ageMatch) spouseAge = parseInt(ageMatch[1], 10);
    return { spouseName: spouseName, spouseAge: spouseAge };
  }

  function extractChildren(text) {
    var original = String(text || "");
    var countMatch = original.match(/(\d+)\s+figl/i);
    var childrenCount = countMatch ? parseInt(countMatch[1], 10) : 0;
    var agesMatch = original.match(/figli?\s*\(([^)]+)\)/i);
    var childrenAges = [];

    if (agesMatch && agesMatch[1]) {
      childrenAges = (agesMatch[1].match(/\d{1,2}/g) || []).map(function (value) {
        return parseInt(value, 10);
      });
    }

    if (!childrenCount && childrenAges.length) childrenCount = childrenAges.length;
    return {
      childrenCount: childrenCount,
      childrenAges: childrenAges
    };
  }

  function extractProfession(text) {
    var original = String(text || "");
    var patterns = [
      /^([A-Za-zÀ-ÿ'’\s]{3,30})(?=,\s*(?:ral|reddito|stipendio|patrimonio))/i,
      /(?:professione|lavora come|fa il|fa la|e un|e una|è un|è una)\s+([A-Za-zÀ-ÿ'’\s]{3,40})(?=,|\.|\n)/i,
      /,\s*([A-Za-zÀ-ÿ'’\s]{3,30})\s*,\s*(?:ral|reddito|stipendio|patrimonio)/i
    ];

    for (var i = 0; i < patterns.length; i += 1) {
      var match = original.match(patterns[i]);
      if (match && match[1]) {
        return titleCase(match[1].trim());
      }
    }
    return "";
  }

  function extractHousingStatus(text) {
    var normalized = normalizeText(text);
    var entries = Object.entries(DB.chatKeywordMap.housing);
    for (var i = 0; i < entries.length; i += 1) {
      if (entries[i][1].some(function (keyword) { return normalized.indexOf(keyword) >= 0; })) {
        return entries[i][0];
      }
    }
    return "";
  }

  function extractCoverages(text) {
    var normalized = normalizeText(text);
    return Object.entries(DB.chatKeywordMap.products)
      .filter(function (entry) {
        return entry[1].some(function (keyword) {
          return normalized.indexOf(keyword) >= 0;
        });
      })
      .map(function (entry) {
        return entry[0];
      });
  }

  function goalFromSentence(goalId, sentence, profile) {
    var normalizedSentence = normalizeText(sentence);
    var monetaryMatches = extractMonetaryMatches(sentence);
    var years = 0;
    var targetAge = 0;
    var amount = 0;
    var propertyValue = 0;

    if (goalId === "retirement") {
      targetAge = findFirstIntegerByKeywords(sentence, ["pensione", "previdenza", "integrativa", "eta"], 55, 75);
      amount = findFirstMoneyByKeywords(sentence, ["pensione", "rendita", "previdenza"]) || 0;
      if (!amount) amount = roundStep(Math.max(90000, estimateNetMonthlyFromGross(profile.grossAnnualIncome || 0) * 12 * 14), 5000);
      return {
        id: goalId,
        targetAmount: roundStep(amount, 5000),
        years: targetAge && profile.age ? clamp(targetAge - profile.age, 3, 30) : 20,
        targetAge: targetAge || 65,
        source: "chat"
      };
    }

    if (goalId === "home") {
      years = findFirstIntegerByKeywords(sentence, ["casa", "mutuo", "immobile", "entro"], 2, 20);
      var homeAmounts = monetaryMatches.filter(function (value) { return value >= 50000; });
      propertyValue = homeAmounts.length ? Math.max.apply(null, homeAmounts) : 0;
      if (propertyValue && propertyValue <= 90000) propertyValue = propertyValue * 3;
      var sentenceHomeBenchmark = resolveHomeBenchmark(profile, { propertyValue: propertyValue || 0 });
      if (!propertyValue) {
        propertyValue = sentenceHomeBenchmark
          ? sentenceHomeBenchmark.propertyValue
          : roundStep(Math.max(200000, (profile.grossAnnualIncome || 45000) * 3.6), 10000);
      }
      amount = roundStep(
        sentenceHomeBenchmark
          ? sentenceHomeBenchmark.totalTarget
          : propertyValue * 0.28 + 15000,
        5000
      );
      return {
        id: goalId,
        propertyValue: roundStep(propertyValue, 10000),
        targetAmount: amount,
        years: years || 5,
        benchmarkMeta: sentenceHomeBenchmark || null,
        source: "chat"
      };
    }

    if (goalId === "education") {
      years = findFirstIntegerByKeywords(sentence, ["figli", "studi", "universita", "entro"], 3, 20);
      amount = findFirstMoneyByKeywords(sentence, ["studi", "universita", "scuola", "fondo", "figli"], { min: 10000, max: 300000 }) || 0;
      if (!amount) {
        var sentenceBenchmark = resolveEducationBenchmark(profile, {});
        amount = sentenceBenchmark ? sentenceBenchmark.totalTarget : 40000 * Math.max(1, profile.childrenCount || 1);
      }
      return {
        id: goalId,
        targetAmount: roundStep(amount, 5000),
        years: years || clamp(18 - (profile.childrenAges[profile.childrenAges.length - 1] || 6), 4, 18),
        source: "chat"
      };
    }

    if (goalId === "emergency") {
      years = findFirstIntegerByKeywords(sentence, ["emergenz", "sicurezza"], 1, 5);
      amount = monetaryMatches.length ? monetaryMatches[0] : 0;
      return {
        id: goalId,
        targetAmount: roundStep(amount || 0, 1000),
        years: years || 2,
        source: "chat"
      };
    }

    if (goalId === "wealth") {
      years = findFirstIntegerByKeywords(sentence, ["obiettivo", "risparmio", "accumulo", "capitale"], 2, 25);
      var wealthAmounts = monetaryMatches.filter(function (value) { return value >= 10000; });
      amount = wealthAmounts.length ? wealthAmounts[wealthAmounts.length - 1] : 0;
      return {
        id: goalId,
        targetAmount: roundStep(amount || 0, 5000),
        years: years || 7,
        source: "chat"
      };
    }

    return null;
  }

  function extractGoals(text, profile) {
    var sentences = splitNarrativeBlocks(text);
    var detectedGoals = [];
    var goalEntries = Object.entries(DB.chatKeywordMap.goals);

    function sentenceHasGoalIntent(goalId, normalizedSentence) {
      if (goalId === "home") {
        if (/proprietar|casa di proprieta|immobile di proprieta|abita in casa|vive in casa/.test(normalizedSentence)) return false;
        return /obiettiv|entro|acquist|compra|prima casa|mutuo|anticipo|cambiare casa|nuova casa/.test(normalizedSentence);
      }
      if (goalId === "education") {
        if (/figli/.test(normalizedSentence) && !/studi|universita|scuola|fondo|obiettiv/.test(normalizedSentence)) return false;
        return /studi|universita|scuola|fondo|obiettiv/.test(normalizedSentence);
      }
      if (goalId === "wealth") {
        return /obiettiv|accumulo|capitale|risparmio/.test(normalizedSentence);
      }
      if (goalId === "emergency") {
        return /emergenz|cuscinetto|sicurezza|riserva/.test(normalizedSentence);
      }
      return true;
    }

    sentences.forEach(function (sentence) {
      var normalizedSentence = normalizeText(sentence);
      goalEntries.forEach(function (entry) {
        if (entry[1].some(function (keyword) { return normalizedSentence.indexOf(keyword) >= 0; }) && sentenceHasGoalIntent(entry[0], normalizedSentence)) {
          var goal = goalFromSentence(entry[0], sentence, profile);
          if (goal) detectedGoals.push(goal);
        }
      });
    });

    return detectedGoals;
  }

  function inferBirthDateFromAge(age) {
    if (!age) return "";
    var year = new Date().getFullYear() - age;
    return String(year) + "-06-15";
  }

  function dedupeGoals(goals) {
    var map = new Map();
    goals.forEach(function (goal) {
      if (!goal || !goal.id) return;
      var existing = map.get(goal.id) || {};
      map.set(goal.id, Object.assign({}, existing, goal));
    });
    return Array.from(map.values());
  }

  function createEmptyProfile() {
    return {
      name: "",
      birthDate: "",
      age: 0,
      maritalStatus: "",
      spouseName: "",
      spouseAge: 0,
      childrenCount: 0,
      childrenAges: [],
      profession: "",
      occupationRisk: "medio",
      occupationFactor: 1,
      grossAnnualIncome: 0,
      netMonthlyIncome: 0,
      monthlySavings: 0,
      totalAssets: 0,
      liquidAssets: 0,
      investedAssets: 0,
      residenceCity: "",
      housingStatus: "",
      housingCost: 0,
      fixedExpenses: 0,
      goals: [],
      existingCoverageIds: [],
      notes: "",
      riskProfileId: "bilanciato"
    };
  }

  function mergeChatInput(draftProfile, text, options) {
    options = options || {};
    var profile = Object.assign(createEmptyProfile(), draftProfile || {});
    var extractedChildren = extractChildren(text);
    var spouse = extractSpouse(text);
    var inferredResidenceCity = extractResidenceCity(text);
    var standaloneInference = inferStandaloneReplyFields(text, profile);
    var grossAnnualIncome =
      findFirstMoneyByKeywords(text, ["ral", "reddito annuo lordo", "reddito lordo", "reddito annuo", "stipendio annuo"], { min: 10000, max: 500000 }) ||
      0;
    var netMonthlyIncome =
      findFirstMoneyByKeywords(text, ["netto mensile", "stipendio netto", "reddito netto", "reddito mensile", "stipendio mensile"], { min: 500, max: 20000 }) ||
      0;
    var monthlySavings =
      findFirstMoneyByKeywords(text, ["risparmio mensile", "risparmia", "accantona", "mette via"], { min: 50, max: 20000 }) ||
      0;
    var totalAssets =
      findFirstMoneyByKeywords(text, ["patrimonio", "risparmi", "capitale"], { min: 1000, max: 5000000 }) ||
      0;
    var liquidAssets =
      findFirstMoneyByKeywords(text, ["liquidita", "conto", "cash"], { min: 500, max: 5000000 }) ||
      0;
    var investedAssets =
      findFirstMoneyByKeywords(text, ["investito", "investimenti", "portafoglio"], { min: 500, max: 5000000 }) ||
      0;
    var housingCost =
      findFirstMoneyByKeywords(text, ["affitto", "rata mutuo", "canone", "mutuo"], { min: 100, max: 20000 }) ||
      0;
    var fixedExpenses =
      findFirstMoneyByKeywords(text, ["uscite fisse", "spese fisse", "altre uscite"], { min: 50, max: 50000 }) ||
      0;
    var genericIncome = 0;

    if (!grossAnnualIncome && !netMonthlyIncome) {
      genericIncome = findFirstMoneyByKeywords(text, ["reddito", "stipendio", "guadagna", "guadagno"], { min: 500, max: 500000 });
      if (genericIncome >= 10000) grossAnnualIncome = genericIncome;
      else if (genericIncome >= 500) netMonthlyIncome = genericIncome;
    }
    var goalProfileContext = Object.assign({}, profile, {
      childrenCount: extractedChildren.childrenCount || profile.childrenCount,
      childrenAges: extractedChildren.childrenAges.length ? extractedChildren.childrenAges : profile.childrenAges || [],
      residenceCity: inferredResidenceCity || profile.residenceCity
    });
    var mergedGoals = dedupeGoals((profile.goals || []).concat(extractGoals(text, goalProfileContext)));
    var existingCoverages = Array.from(
      new Set((profile.existingCoverageIds || []).concat(extractCoverages(text)))
    );

    profile.name = extractName(text) || profile.name;
    profile.birthDate = extractBirthDate(text) || profile.birthDate;
    profile.age = extractAge(text) || standaloneInference.age || profile.age;
    profile.maritalStatus = extractMaritalStatus(text) || profile.maritalStatus;
    profile.spouseName = spouse.spouseName || profile.spouseName;
    profile.spouseAge = spouse.spouseAge || profile.spouseAge;
    profile.childrenCount = extractedChildren.childrenCount || profile.childrenCount;
    profile.childrenAges = extractedChildren.childrenAges.length ? extractedChildren.childrenAges : profile.childrenAges || [];
    profile.profession = extractProfession(text) || profile.profession;
    profile.grossAnnualIncome = grossAnnualIncome || standaloneInference.grossAnnualIncome || profile.grossAnnualIncome;
    profile.netMonthlyIncome = netMonthlyIncome || standaloneInference.netMonthlyIncome || profile.netMonthlyIncome;
    profile.monthlySavings = monthlySavings || profile.monthlySavings;
    profile.totalAssets = totalAssets || profile.totalAssets;
    profile.liquidAssets = liquidAssets || profile.liquidAssets;
    profile.investedAssets = investedAssets || profile.investedAssets;
    profile.residenceCity = inferredResidenceCity || profile.residenceCity;
    profile.housingStatus = extractHousingStatus(text) || profile.housingStatus;
    profile.housingCost = housingCost || profile.housingCost;
    profile.fixedExpenses = fixedExpenses || profile.fixedExpenses;
    profile.goals = mergedGoals;
    profile.existingCoverageIds = existingCoverages;
    if (options.appendNotes !== false) {
      profile.notes = [profile.notes, text].filter(Boolean).join("\n").trim();
    }

    return finalizeProfile(profile, { applyDefaults: false });
  }

  function finalizeProfile(profileInput, options) {
    options = options || {};
    var applyDefaults = options.applyDefaults !== false;
    var profile = Object.assign(createEmptyProfile(), profileInput || {});

    if (!profile.age && profile.birthDate) {
      profile.age = new Date().getFullYear() - parseInt(profile.birthDate.slice(0, 4), 10);
    }
    if (!profile.birthDate && profile.age) profile.birthDate = inferBirthDateFromAge(profile.age);
    if (!profile.name && applyDefaults) profile.name = "Cliente";
    if (!profile.maritalStatus && profile.spouseName) profile.maritalStatus = "Sposato";
    if (!profile.maritalStatus && applyDefaults) profile.maritalStatus = "Single";
    if (!profile.profession && applyDefaults) profile.profession = "Impiegato";

    var occupation = occupationRiskFor(profile.profession || "");
    profile.occupationRisk = occupation.risk;
    profile.occupationFactor = occupation.factor;

    if (!profile.grossAnnualIncome && profile.netMonthlyIncome) {
      profile.grossAnnualIncome = estimateGrossAnnualFromNet(profile.netMonthlyIncome);
    }
    if (!profile.netMonthlyIncome && profile.grossAnnualIncome) {
      profile.netMonthlyIncome = estimateNetMonthlyFromGross(profile.grossAnnualIncome);
    }

    if (profile.residenceCity) profile.residenceCity = titleCase(profile.residenceCity);
    if (!profile.housingStatus && applyDefaults) profile.housingStatus = "Affittuario";
    if (!profile.housingCost && applyDefaults && profile.housingStatus) {
      profile.housingCost = profile.housingStatus === "Con mutuo" ? 950 : profile.housingStatus === "Proprietario" ? 250 : 950;
    }
    if (!profile.fixedExpenses && applyDefaults && (profile.netMonthlyIncome || profile.housingCost || profile.childrenCount)) {
      profile.fixedExpenses = 350 + profile.childrenCount * 120;
    }

    if (!profile.totalAssets && (profile.liquidAssets || profile.investedAssets)) {
      profile.totalAssets = profile.liquidAssets + profile.investedAssets;
    }
    if (profile.totalAssets && !profile.liquidAssets && !profile.investedAssets) {
      var liquidShare = profile.age >= 50 ? 0.35 : profile.childrenCount > 0 ? 0.3 : 0.25;
      profile.liquidAssets = roundStep(profile.totalAssets * liquidShare, 1000);
      profile.investedAssets = Math.max(0, profile.totalAssets - profile.liquidAssets);
    }
    if (!profile.totalAssets && profile.monthlySavings && applyDefaults) {
      profile.totalAssets = roundStep(profile.monthlySavings * 30, 5000);
      profile.liquidAssets = roundStep(profile.totalAssets * 0.3, 1000);
      profile.investedAssets = Math.max(0, profile.totalAssets - profile.liquidAssets);
    }

    if (!profile.monthlySavings && profile.netMonthlyIncome && applyDefaults && profile.housingCost) {
      var estimatedSavings = profile.netMonthlyIncome - profile.housingCost - profile.fixedExpenses - householdFloor(profile);
      profile.monthlySavings = clamp(roundStep(estimatedSavings, 50), 150, Math.round(profile.netMonthlyIncome * 0.4));
    }

    if (!profile.totalAssets && applyDefaults && (profile.monthlySavings || profile.netMonthlyIncome || profile.grossAnnualIncome)) {
      profile.totalAssets = roundStep(Math.max(profile.monthlySavings * 24, 30000), 5000);
      if (!profile.liquidAssets) profile.liquidAssets = roundStep(profile.totalAssets * 0.3, 1000);
      if (!profile.investedAssets) profile.investedAssets = Math.max(0, profile.totalAssets - profile.liquidAssets);
    }

    if (!profile.childrenAges.length && profile.childrenCount && applyDefaults) {
      profile.childrenAges = Array.from({ length: profile.childrenCount }, function (_, index) {
        return clamp(9 - index * 3, 2, 18);
      });
    }

    profile.riskProfileId = profile.riskProfileId || deriveRiskProfile(profile);
    return profile;
  }

  function buildGoal(goalId, profile, overrides) {
    var goalMeta = DB.goalCatalog.find(function (goal) { return goal.id === goalId; });
    var years = safeNumber(overrides.years, 0);
    var targetAmount = safeNumber(overrides.targetAmount, 0);
    var propertyValue = safeNumber(overrides.propertyValue, 0);
    var targetAge = safeNumber(overrides.targetAge, 0);
    var youngestChildAge = profile.childrenAges.length ? Math.min.apply(null, profile.childrenAges) : 6;
    var targetLabel = goalMeta ? goalMeta.targetLabel : "Capitale target";
    var goal = {
      id: goalId,
      name: goalMeta ? goalMeta.name : goalId,
      emoji: goalMeta ? goalMeta.emoji : "🎯",
      accentClass: goalMeta ? goalMeta.accentClass : "gp",
      targetLabel: targetLabel,
      targetAmount: 0,
      years: 0,
      enabled: overrides.enabled !== false,
      source: overrides.source || "inferred",
      priority: 2
    };

    if (goalId === "retirement") {
      var retirementAge = targetAge || 65;
      goal.years = years || clamp(retirementAge - profile.age, 3, 30);
      goal.targetAge = retirementAge;
      goal.targetAmount = targetAmount || roundStep(Math.max(120000, profile.netMonthlyIncome * 12 * 17 * 0.4), 5000);
      goal.priority = profile.age >= 50 ? 3 : 2;
    } else if (goalId === "home") {
      var homeBenchmark = resolveHomeBenchmark(profile, overrides);
      goal.years = years || 5;
      goal.propertyValue = propertyValue || (homeBenchmark ? homeBenchmark.propertyValue : roundStep(Math.max(220000, profile.grossAnnualIncome * 3.6), 10000));
      goal.targetAmount = targetAmount || (homeBenchmark ? homeBenchmark.totalTarget : roundStep(goal.propertyValue * 0.28 + 15000, 5000));
      if (homeBenchmark) goal.benchmarkMeta = homeBenchmark;
      goal.priority = 3;
    } else if (goalId === "education") {
      var educationBenchmark = resolveEducationBenchmark(profile, overrides);
      goal.years = years || clamp(19 - youngestChildAge, 4, 18);
      goal.targetAmount = targetAmount || roundStep(
        educationBenchmark ? educationBenchmark.totalTarget : 40000 * Math.max(1, profile.childrenCount),
        5000
      );
      if (educationBenchmark) goal.benchmarkMeta = educationBenchmark;
      goal.priority = 3;
    } else if (goalId === "emergency") {
      var emergencyBenchmark = resolveHouseholdExpenseBenchmark(profile);
      var actualMonthlyNeed = profile.housingCost + profile.fixedExpenses + householdFloor(profile);
      var benchmarkMonthlyNeed = emergencyBenchmark ? safeNumber(emergencyBenchmark.monthly_consumption_median_eur, 0) : 0;
      goal.years = years || 2;
      goal.targetAmount = targetAmount || roundStep(Math.max(actualMonthlyNeed * 6, benchmarkMonthlyNeed * 6), 1000);
      if (emergencyBenchmark) goal.benchmarkMeta = emergencyBenchmark;
      goal.priority = 2;
    } else if (goalId === "wealth") {
      goal.years = years || 7;
      goal.targetAmount = targetAmount || roundStep(Math.max(45000, profile.totalAssets * 0.75), 5000);
      goal.priority = 2;
    }

    goal.targetAmount = roundStep(goal.targetAmount, goalId === "emergency" ? 1000 : 5000);
    goal.years = clamp(goal.years, 1, 30);
    return goal;
  }

  function buildGoals(profile) {
    var explicitGoals = dedupeGoals(profile.goals || []);
    var goalIds = explicitGoals.map(function (goal) { return goal.id; });
    var goals = explicitGoals.map(function (goal) {
      return buildGoal(goal.id, profile, goal);
    });

    function ensureGoal(goalId, condition, overrides) {
      if (condition && goalIds.indexOf(goalId) === -1) {
        goals.push(buildGoal(goalId, profile, Object.assign({ source: "inferred" }, overrides || {})));
        goalIds.push(goalId);
      }
    }

    ensureGoal("education", profile.childrenCount > 0);
    ensureGoal("home", profile.housingStatus === "Affittuario" && profile.age >= 27 && profile.age <= 50 && (profile.netMonthlyIncome || profile.grossAnnualIncome));
    ensureGoal("retirement", profile.age >= 35 && (profile.netMonthlyIncome || profile.grossAnnualIncome));
    ensureGoal("emergency", !!(profile.totalAssets || profile.monthlySavings || profile.netMonthlyIncome));
    ensureGoal("wealth", profile.totalAssets >= 80000 || profile.monthlySavings >= 1000 || (goals.length === 0 && !!(profile.totalAssets || profile.monthlySavings)));

    return goals
      .map(function (goal) {
        goal.displayValue = "€ " + formatCurrency(goal.targetAmount);
        goal.displayYears = goal.id === "retirement" && goal.targetAge ? "a " + goal.targetAge + " anni" : "entro " + goal.years + " anni";
        return goal;
      })
      .sort(function (left, right) {
        return left.years - right.years || right.priority - left.priority;
      });
  }

  function detectSegment(profile, goals) {
    var scores = {
      "family-builder": 0,
      "home-planner": 0,
      "wealth-accumulator": 0,
      "pre-retirement": 0,
      "independent-pro": 0
    };

    var goalIds = goals.map(function (goal) { return goal.id; });
    var professionNormalized = normalizeText(profile.profession);

    if (profile.childrenCount > 0) scores["family-builder"] += 45;
    if (profile.spouseName || profile.maritalStatus === "Sposato") scores["family-builder"] += 20;
    if (goalIds.indexOf("education") >= 0) scores["family-builder"] += 20;
    if (goalIds.indexOf("home") >= 0) scores["home-planner"] += 35;
    if (profile.housingStatus === "Affittuario" || profile.housingStatus === "Con mutuo") scores["home-planner"] += 25;
    if (profile.totalAssets >= 100000 || profile.monthlySavings >= 1200) scores["wealth-accumulator"] += 35;
    if (goalIds.indexOf("wealth") >= 0) scores["wealth-accumulator"] += 20;
    if (profile.age >= 52) scores["pre-retirement"] += 40;
    if (goalIds.indexOf("retirement") >= 0) scores["pre-retirement"] += 25;
    if (professionNormalized.indexOf("imprendit") >= 0 || professionNormalized.indexOf("libero") >= 0 || professionNormalized.indexOf("autonom") >= 0) {
      scores["independent-pro"] += 50;
    }
    if (profile.occupationRisk === "alto") scores["independent-pro"] += 20;

    var sorted = Object.entries(scores).sort(function (left, right) {
      return right[1] - left[1];
    });
    var segmentMeta = DB.segments.find(function (segment) { return segment.id === sorted[0][0]; }) || DB.segments[0];
    return {
      id: segmentMeta.id,
      name: segmentMeta.name,
      description: segmentMeta.description,
      priorities: segmentMeta.priorities,
      score: sorted[0][1]
    };
  }

  function computeNeeds(profile, goals) {
    var nearTermGoals = goals.filter(function (goal) { return goal.years <= 10; });
    var protectedGoalReserve = sum(nearTermGoals.map(function (goal) { return goal.targetAmount * 0.3; }));
    var familySupportYears = profile.childrenCount > 0 ? 6 : profile.spouseName ? 5 : 3;
    var monthlyOutflows = profile.housingCost + profile.fixedExpenses + householdFloor(profile);
    var deathCapital = roundStep(
      Math.max(
        profile.netMonthlyIncome * 12 * familySupportYears + protectedGoalReserve - profile.liquidAssets * 0.4,
        profile.childrenCount || profile.spouseName ? 150000 : 70000
      ),
      25000
    );
    var invalidityCapital = roundStep(
      Math.max(
        profile.netMonthlyIncome * 12 * 4 + protectedGoalReserve * 0.25 - profile.liquidAssets * 0.25,
        profile.netMonthlyIncome * 12 * 2
      ),
      25000
    );
    var incomeProtectionMonthly = roundStep(clamp(profile.netMonthlyIncome * 0.55, 800, 3000), 50);
    var ltcMonthly = roundStep(clamp(1400 + Math.max(0, profile.age - 45) * 20 + profile.childrenCount * 50, 1200, 2600), 50);
    var ltcCapital = roundStep(ltcMonthly * 12 * 5, 10000);
    var rcClaimLoss = roundStep(25000 + profile.childrenCount * 4000 + (profile.housingStatus !== "Affittuario" ? 3000 : 0), 1000);
    var rcLimit = profile.childrenCount || profile.housingStatus !== "Affittuario" ? 1000000 : 500000;
    var homeDamageLoss = roundStep(
      profile.housingStatus === "Affittuario"
        ? 12000 + profile.childrenCount * 1000
        : Math.min(45000, Math.max(15000, profile.totalAssets * 0.08)),
      1000
    );
    var healthCapital = roundStep(Math.max(18000, profile.netMonthlyIncome * 8), 5000);
    var mortgageBalance = profile.housingStatus === "Con mutuo" ? roundStep(profile.housingCost * 12 * 11, 10000) : 0;

    return {
      monthlyOutflows: monthlyOutflows,
      deathCapital: deathCapital,
      invalidityCapital: invalidityCapital,
      incomeProtectionMonthly: incomeProtectionMonthly,
      ltcMonthly: ltcMonthly,
      ltcCapital: ltcCapital,
      rcClaimLoss: rcClaimLoss,
      rcLimit: rcLimit,
      homeDamageLoss: homeDamageLoss,
      healthCapital: healthCapital,
      mortgageBalance: mortgageBalance
    };
  }

  function selfFundEquivalent(productId, needs) {
    if (productId === "tcm") return roundStep(needs.deathCapital / 240, 10);
    if (productId === "income_protection") return roundStep(needs.invalidityCapital / 120, 10);
    if (productId === "rc_family") return roundStep(needs.rcClaimLoss / 60, 10);
    if (productId === "ltc") return roundStep(needs.ltcCapital / 72, 10);
    if (productId === "health") return roundStep(needs.healthCapital / 72, 10);
    if (productId === "accident") return roundStep(needs.invalidityCapital / 180, 10);
    if (productId === "mortgage") return roundStep(needs.mortgageBalance / 180, 10);
    return 0;
  }

  function productScore(productId, profile, goals, needs, segment) {
    var goalIds = goals.map(function (goal) { return goal.id; });
    if (productId === "tcm") {
      return 20 + (profile.childrenCount > 0 ? 28 : 0) + (profile.spouseName ? 12 : 0) + (goalIds.indexOf("home") >= 0 ? 8 : 0) + (goalIds.indexOf("education") >= 0 ? 10 : 0);
    }
    if (productId === "income_protection") {
      return 24 + (profile.netMonthlyIncome > 0 ? 18 : 0) + (profile.occupationRisk === "alto" ? 15 : profile.occupationRisk === "medio" ? 8 : 4) + (profile.childrenCount > 0 ? 10 : 0);
    }
    if (productId === "rc_family") {
      return 20 + (profile.housingStatus === "Affittuario" ? 6 : profile.housingStatus === "Con mutuo" ? 24 : 28) + (profile.childrenCount > 0 ? 12 : 0) + (profile.totalAssets > 60000 ? 8 : 0);
    }
    if (productId === "ltc") {
      return 10 + (profile.age >= 50 ? 24 : profile.age >= 42 ? 12 : 4) + (goalIds.indexOf("retirement") >= 0 ? 12 : 0) + (segment.id === "pre-retirement" ? 10 : 0);
    }
    if (productId === "health") {
      return 10 + (profile.age >= 45 ? 15 : 5) + (segment.id === "independent-pro" ? 14 : 0) + (needs.healthCapital >= 25000 ? 8 : 0);
    }
    if (productId === "accident") {
      return 12 + (profile.netMonthlyIncome > 0 ? 12 : 0) + (profile.occupationRisk === "alto" ? 18 : profile.occupationRisk === "medio" ? 11 : 5) + (profile.age >= 35 ? 7 : 2);
    }
    if (productId === "mortgage") {
      return profile.housingStatus === "Con mutuo" ? 55 : 0;
    }
    return 0;
  }

  function buildRecommendation(productMeta, profile, needs, score, premiumOverride) {
    var amount = 0;
    var premium = 0;
    var detail = "";
    var secondaryDetail = "";

    if (productMeta.id === "tcm") {
      amount = needs.deathCapital;
      premium = roundStep(Math.max(12, (amount / 10000) * (0.34 + profile.age / 100 + profile.occupationFactor * 0.15)), 1);
      detail = "Capitale € " + formatCurrency(amount) + " · tutela " + (profile.childrenCount ? "nucleo familiare" : "stabilita del piano");
      secondaryDetail = "Copre circa " + (profile.childrenCount > 0 ? 6 : 4) + " anni di reddito";
    } else if (productMeta.id === "income_protection") {
      amount = needs.incomeProtectionMonthly;
      premium = roundStep(Math.max(22, (amount / 250) * (4.8 + profile.age / 18) * profile.occupationFactor), 1);
      detail = "Rendita € " + formatCurrency(amount) + "/mese · durata 10 anni";
      secondaryDetail = "Gap protetto € " + formatCurrency(needs.invalidityCapital);
    } else if (productMeta.id === "rc_family") {
      amount = needs.rcLimit;
      premium = roundStep(18 + profile.childrenCount * 3 + (profile.housingStatus !== "Affittuario" ? 8 : 4) + (profile.totalAssets > 100000 ? 5 : 0), 1);
      detail = "Massimale € " + formatCurrency(amount) + " · vita privata e casa";
      secondaryDetail = profile.housingStatus === "Affittuario" ? "Tutela danni a terzi e imprevisti domestici" : "Protezione casa, terzi e tutela legale";
    } else if (productMeta.id === "ltc") {
      amount = needs.ltcMonthly;
      premium = roundStep(Math.max(18, (amount / 250) * (3.5 + Math.max(profile.age - 35, 0) / 15)), 1);
      detail = "Rendita € " + formatCurrency(amount) + "/mese · assistenza continuativa";
      secondaryDetail = "Esposizione stimata € " + formatCurrency(needs.ltcCapital);
    } else if (productMeta.id === "health") {
      amount = needs.healthCapital;
      premium = roundStep(24 + profile.age * 0.35 + profile.occupationFactor * 6, 1);
      detail = "Spese mediche coperte fino a € " + formatCurrency(amount);
      secondaryDetail = "Supporto ricoveri, terapie e diagnostica";
    } else if (productMeta.id === "accident") {
      amount = roundStep(Math.max(25000, needs.invalidityCapital * 0.35), 5000);
      premium = roundStep(Math.max(14, 12 + profile.age * 0.18 + profile.occupationFactor * 10), 1);
      detail = "Indennizzo fino a € " + formatCurrency(amount) + " per infortuni e stop temporanei";
      secondaryDetail = "Protezione utile se il lavoro si blocca per eventi accidentali";
    } else if (productMeta.id === "mortgage") {
      amount = needs.mortgageBalance;
      premium = roundStep(Math.max(16, profile.housingCost / 45 + profile.age * 0.15), 1);
      detail = "Debito residuo stimato € " + formatCurrency(amount);
      secondaryDetail = "Utile per proteggere la continuita del mutuo";
    }

    var suggestedPremium = premium;
    if (safeNumber(premiumOverride, 0) > 0) premium = roundStep(premiumOverride, 1);

    return {
      id: productMeta.id,
      name: productMeta.name,
      areaId: productMeta.areaId || "protection",
      icon: productMeta.icon,
      tint: productMeta.tint,
      shortDescription: productMeta.shortDescription,
      deductibleRate: productMeta.deductibleRate,
      deductibleLabel: productMeta.deductibleLabel,
      scenarioIds: productMeta.scenarioIds,
      score: score,
      coverAmount: amount,
      suggestedMonthlyPremium: suggestedPremium,
      monthlyPremium: premium,
      deductibleMonthly: premium,
      annualTaxSaving: Math.round(premium * 12 * productMeta.deductibleRate),
      detail: detail,
      secondaryDetail: secondaryDetail,
      selfFundMonthlyEquivalent: selfFundEquivalent(productMeta.id, needs),
      selectedByDefault: false,
      selectedByDefaultReason: ""
    };
  }

  function recommendationById(recommendations, id) {
    return recommendations.find(function (recommendation) {
      return recommendation.id === id;
    }) || null;
  }

  function bundleScenarioWeights(goals) {
    return goals.reduce(function (weights, goal) {
      bundleCatalogForGoal(goal.id).forEach(function (bundle) {
        bundle.scenarioIds.forEach(function (scenarioId) {
          weights[scenarioId] = (weights[scenarioId] || 0) + 1;
        });
      });
      return weights;
    }, {});
  }

  function defaultCoverageTargetCount(profile, goals) {
    var strategicGoals = goals.filter(function (goal) { return goal.id !== "emergency"; }).length;
    var base = 2 + strategicGoals;
    if (profile.housingStatus === "Con mutuo") base += 1;
    return clamp(base, 2, 5);
  }

  function addDefaultSelection(selectionMap, recommendations, id, reason) {
    var recommendation = recommendationById(recommendations, id);
    if (!recommendation) return;
    if (!selectionMap[id]) selectionMap[id] = reason;
  }

  function scenarioShortLabel(scenarioId) {
    var meta = scenarioMetaById(scenarioId);
    return meta ? meta.shortLabel.toLowerCase() : scenarioId;
  }

  function pushUnique(list, value) {
    if (list.indexOf(value) < 0) list.push(value);
  }

  function computeDefaultSelectionMap(profile, goals, recommendations) {
    var selectionMap = {};
    var scenarioWeights = bundleScenarioWeights(goals);
    var targetCount = Math.min(defaultCoverageTargetCount(profile, goals), recommendations.length);

    if (profile.netMonthlyIncome > 0) {
      addDefaultSelection(selectionMap, recommendations, "income_protection", "protegge la continuita del reddito");
    }
    if (profile.childrenCount > 0 || profile.spouseName) {
      addDefaultSelection(selectionMap, recommendations, "tcm", "difende il nucleo familiare in caso di decesso");
    }
    if (profile.housingStatus !== "Affittuario") {
      addDefaultSelection(selectionMap, recommendations, "rc_family", "protegge casa, responsabilita civile e patrimonio");
    }
    if (profile.housingStatus === "Con mutuo") {
      addDefaultSelection(selectionMap, recommendations, "mortgage", "mantiene in piedi il progetto casa con mutuo");
    }

    var uncovered = Object.assign({}, scenarioWeights);
    Object.keys(selectionMap).forEach(function (productId) {
      var recommendation = recommendationById(recommendations, productId);
      if (!recommendation) return;
      recommendation.scenarioIds.forEach(function (scenarioId) {
        uncovered[scenarioId] = 0;
      });
    });

    while (Object.keys(selectionMap).length < targetCount) {
      var best = recommendations
        .filter(function (recommendation) { return !selectionMap[recommendation.id]; })
        .map(function (recommendation) {
          var uncoveredWeight = recommendation.scenarioIds.reduce(function (total, scenarioId) {
            return total + (uncovered[scenarioId] || 0);
          }, 0);
          return {
            recommendation: recommendation,
            uncoveredWeight: uncoveredWeight
          };
        })
        .filter(function (entry) {
          return entry.uncoveredWeight > 0 || entry.recommendation.score >= 58;
        })
        .sort(function (left, right) {
          if (right.uncoveredWeight !== left.uncoveredWeight) return right.uncoveredWeight - left.uncoveredWeight;
          if (right.recommendation.score !== left.recommendation.score) return right.recommendation.score - left.recommendation.score;
          return (right.recommendation.selfFundMonthlyEquivalent || 0) - (left.recommendation.selfFundMonthlyEquivalent || 0);
        })[0];

      if (!best) break;

      var matchedScenarios = best.recommendation.scenarioIds.filter(function (scenarioId) {
        return uncovered[scenarioId] > 0;
      });
      var reason = matchedScenarios.length
        ? "copre il bundle critico su " + matchedScenarios.map(scenarioShortLabel).join(", ")
        : "rafforza la protezione sul profilo";

      selectionMap[best.recommendation.id] = reason;
      best.recommendation.scenarioIds.forEach(function (scenarioId) {
        uncovered[scenarioId] = 0;
      });
    }

    var minimumSelections = Math.min(recommendations.length, goals.length >= 2 ? 2 : 1);
    if (Object.keys(selectionMap).length < minimumSelections) {
      recommendations
        .filter(function (recommendation) { return !selectionMap[recommendation.id]; })
        .sort(function (left, right) { return right.score - left.score; })
        .slice(0, minimumSelections - Object.keys(selectionMap).length)
        .forEach(function (recommendation) {
          selectionMap[recommendation.id] = "rafforza il set base di protezione";
        });
    }

    if (!Object.keys(selectionMap).length && recommendations.length) {
      selectionMap[recommendations[0].id] = "copertura con priorita piu alta sul profilo";
    }

    return selectionMap;
  }

  function forcedOfferProductIds(offerSelections) {
    var forcedIds = [];

    (DB.offerAreaCatalog || []).forEach(function (areaMeta) {
      var areaSelection = offerSelections && offerSelections[areaMeta.id];
      if (!areaSelection || !areaSelection.products) return;

      function collectCoverageIds(coverageMetas, coverageSelections) {
        (coverageMetas || []).forEach(function (coverageMeta) {
          var coverageSelection = coverageSelections && coverageSelections[coverageMeta.id];
          if (!coverageSelection || coverageSelection.selected === false) return;
          (coverageMeta.linkedProductIds || []).forEach(function (productId) {
            pushUnique(forcedIds, productId);
          });
        });
      }

      if (areaMeta.products && areaMeta.products.length) {
        areaMeta.products.forEach(function (productMeta) {
          var productSelection = areaSelection.products[productMeta.id];
          if (!productSelection) return;
          if (productSelection.selected !== false && Object.prototype.hasOwnProperty.call(productSelection, "selected")) {
            (productMeta.linkedProductIds || []).forEach(function (productId) {
              pushUnique(forcedIds, productId);
            });
          }
          collectCoverageIds(productMeta.coverages || [], productSelection.coverages || {});
        });
        return;
      }

      collectCoverageIds(areaMeta.coverages || [], (areaSelection.products[areaMeta.id + "_core"] || {}).coverages || {});
    });

    return forcedIds;
  }

  function recommendProducts(profile, goals, needs, segment, premiumOverrides, forcedProductIds) {
    forcedProductIds = forcedProductIds || [];
    var recommendations = DB.productCatalog
      .map(function (productMeta) {
        var score = productScore(productMeta.id, profile, goals, needs, segment);
        if (!score) return null;
        return buildRecommendation(productMeta, profile, needs, score, premiumOverrides && premiumOverrides[productMeta.id]);
      })
      .filter(Boolean)
      .filter(function (recommendation) {
        return recommendation.score >= 32 || forcedProductIds.indexOf(recommendation.id) >= 0;
      })
      .sort(function (left, right) {
        return right.score - left.score;
      });
    if (recommendations.length > 6) {
      var forcedRecommendations = recommendations.filter(function (recommendation) {
        return forcedProductIds.indexOf(recommendation.id) >= 0;
      });
      var regularRecommendations = recommendations.filter(function (recommendation) {
        return forcedProductIds.indexOf(recommendation.id) < 0;
      });
      recommendations = forcedRecommendations.concat(regularRecommendations).slice(0, Math.max(6, forcedRecommendations.length));
    }

    var selectionMap = computeDefaultSelectionMap(profile, goals, recommendations);
    recommendations = recommendations.map(function (recommendation) {
      return Object.assign({}, recommendation, {
        selectedByDefault: !!selectionMap[recommendation.id],
        selectedByDefaultReason: selectionMap[recommendation.id] || ""
      });
    });

    return recommendations;
  }

  function solutionTierForScore(score, profile) {
    if (score >= 74 || (profile.netMonthlyIncome >= 4200 && score >= 60)) return "top";
    if (score >= 60) return "premium";
    if (score >= 42) return "plus";
    return "essential";
  }

  function solutionTierById(tierId) {
    return (DB.solutionTierCatalog || []).find(function (tier) {
      return tier.id === tierId;
    }) || null;
  }

  function buildSolutionSet(baseMonthly, score, profile) {
    return (DB.solutionTierCatalog || []).map(function (tier) {
      return {
        id: tier.id,
        name: tier.name,
        accent: tier.accent,
        available: true,
        shortLabel: tier.name,
        limitLabel: "",
        description: "",
        monthlyPremium: roundStep(Math.max(0, baseMonthly) * safeNumber(tier.multiplier, 1), 1),
        suggested: tier.id === solutionTierForScore(score, profile)
      };
    });
  }

  function linkedRecommendations(recommendations, linkedProductIds) {
    return recommendations.filter(function (recommendation) {
      return (linkedProductIds || []).indexOf(recommendation.id) >= 0;
    });
  }

  function textContainsAny(text, keywords) {
    var normalized = normalizeText(text);
    return keywords.some(function (keyword) {
      return normalized.indexOf(normalizeText(keyword)) >= 0;
    });
  }

  function notesMentionPet(text) {
    var normalized = normalizeText(text);
    if (!normalized) return false;
    if (/(nessun|nessuna|senza|no)\s+(animale|animali|cane|cani|gatto|gatti|pet)/.test(normalized)) return false;
    return /(animale|animali|cane|cani|gatto|gatti|pet)/.test(normalized);
  }

  function coveragePriorityScore(coverageId, profile, goals) {
    var hasHomeGoal = goals.some(function (goal) { return goal.id === "home"; });
    var hasDependants = !!(profile.childrenCount || profile.spouseName);
    var ownsHome = profile.housingStatus !== "Affittuario";
    var hasMortgage = profile.housingStatus === "Con mutuo";
    var petFlag = notesMentionPet(profile.notes || "");
    var incomeBand = profile.netMonthlyIncome >= 3500 ? 12 : profile.netMonthlyIncome >= 2200 ? 8 : 3;
    var wealthBand = profile.totalAssets >= 100000 ? 12 : profile.totalAssets >= 50000 ? 8 : profile.totalAssets >= 20000 ? 4 : 0;
    var ageBand = profile.age >= 55 ? 16 : profile.age >= 45 ? 12 : profile.age >= 35 ? 8 : 4;
    var expenseBand = profile.housingCost + profile.fixedExpenses >= 2400 ? 12 : profile.housingCost + profile.fixedExpenses >= 1600 ? 8 : 4;

    if (coverageId === "home_building") {
      return clamp(22 + (ownsHome ? 26 : 0) + (hasHomeGoal ? 14 : 0) + (hasMortgage ? 10 : 0) + wealthBand, 18, 94);
    }
    if (coverageId === "home_contents") {
      return clamp(18 + (ownsHome ? 18 : 4) + wealthBand + (hasDependants ? 8 : 2), 18, 92);
    }
    if (coverageId === "home_theft") {
      return clamp(16 + (ownsHome ? 14 : 2) + (profile.liquidAssets >= 30000 ? 10 : 4) + (hasDependants ? 6 : 0), 18, 90);
    }
    if (coverageId === "home_catastrophe") {
      return clamp(14 + (ownsHome ? 18 : 0) + (hasHomeGoal ? 12 : 0) + (hasMortgage ? 14 : 0) + wealthBand, 18, 90);
    }
    if (coverageId === "home_rc_house") {
      return clamp(12 + (ownsHome ? 30 : 0) + (hasMortgage ? 8 : 0), 18, 92);
    }
    if (coverageId === "home_rc_family") {
      return clamp(20 + (hasDependants ? 18 : 8) + (ownsHome ? 8 : 0) + incomeBand, 20, 94);
    }
    if (coverageId === "home_legal") {
      return clamp(18 + (ownsHome ? 12 : 4) + (hasDependants ? 6 : 0) + wealthBand, 18, 90);
    }
    if (coverageId === "home_pets") {
      return clamp((petFlag ? 58 : 10) + (hasDependants ? 6 : 0), 10, 88);
    }
    if (coverageId === "health_severe_events") {
      return clamp(18 + ageBand + incomeBand + wealthBand + (hasDependants ? 6 : 0), 18, 94);
    }
    if (coverageId === "health_medical") {
      return clamp(26 + ageBand + (profile.occupationRisk === "alto" ? 10 : profile.occupationRisk === "medio" ? 6 : 2) + (hasDependants ? 6 : 0), 22, 94);
    }
    if (coverageId === "health_daily_allowance") {
      return clamp(18 + expenseBand + (profile.occupationRisk === "alto" ? 10 : profile.occupationRisk === "medio" ? 6 : 2), 18, 92);
    }
    if (coverageId === "health_disability_accident") {
      return clamp(20 + (profile.occupationRisk === "alto" ? 24 : profile.occupationRisk === "medio" ? 14 : 6) + incomeBand + ageBand * 0.5, 20, 96);
    }
    if (coverageId === "health_disability_illness") {
      return clamp(18 + ageBand + incomeBand + (hasDependants ? 8 : 2) + (profile.profession ? 4 : 0), 18, 94);
    }

    return 0;
  }

  function offerCoverageScore(coverageMeta, recommendations, goals, profile) {
    if ((coverageMeta.linkedGoalIds || []).length) {
      var matchedGoals = goals.filter(function (goal) { return coverageMeta.linkedGoalIds.indexOf(goal.id) >= 0; });
      var savingsStrength = profile.monthlySavings >= 500 ? 18 : profile.monthlySavings >= 250 ? 10 : 4;
      return clamp((matchedGoals.length ? 46 + matchedGoals.length * 14 : 28) + savingsStrength, 24, 92);
    }

    var specificScore = coveragePriorityScore(coverageMeta.id, profile, goals);
    if (specificScore) return specificScore;

    var linked = linkedRecommendations(recommendations, coverageMeta.linkedProductIds || []);
    if (!linked.length) return 26;
    return clamp(Math.round(average(linked.map(function (recommendation) { return recommendation.score; }))), 24, 96);
  }

  function offerCoverageBaseMonthly(coverageMeta, recommendations) {
    if (safeNumber(coverageMeta.defaultMonthly, 0) > 0) {
      return roundStep(Math.max(0, coverageMeta.defaultMonthly), 1);
    }
    var linked = linkedRecommendations(recommendations, coverageMeta.linkedProductIds || []);
    if (linked.length) {
      return roundStep(Math.max(0, average(linked.map(function (recommendation) { return recommendation.monthlyPremium; }))), 1);
    }
    return 0;
  }

  function availableSolutionId(solutions, preferredId) {
    var available = (solutions || []).filter(function (solution) { return solution.available !== false; });
    if (!available.length) return "";
    var direct = available.find(function (solution) { return solution.id === preferredId; });
    if (direct) return direct.id;

    var orderedIds = (DB.solutionTierCatalog || []).map(function (tier) { return tier.id; });
    var preferredIndex = orderedIds.indexOf(preferredId);
    if (preferredIndex < 0) return available[0].id;

    for (var up = preferredIndex + 1; up < orderedIds.length; up += 1) {
      direct = available.find(function (solution) { return solution.id === orderedIds[up]; });
      if (direct) return direct.id;
    }
    for (var down = preferredIndex - 1; down >= 0; down -= 1) {
      direct = available.find(function (solution) { return solution.id === orderedIds[down]; });
      if (direct) return direct.id;
    }
    return available[0].id;
  }

  function buildCoverageSolutions(coverageMeta, baseMonthly, score, profile) {
    var preferredId = solutionTierForScore(score, profile);
    var rawSolutions = (coverageMeta.solutions || []).length
      ? coverageMeta.solutions.map(function (solutionMeta) {
          var tierMeta = solutionTierById(solutionMeta.id) || {};
          return {
            id: solutionMeta.id,
            name: solutionMeta.name || tierMeta.name || titleCase(solutionMeta.id),
            accent: tierMeta.accent || "core",
            available: solutionMeta.available !== false,
            shortLabel: solutionMeta.shortLabel || solutionMeta.limitLabel || tierMeta.name || "",
            limitLabel: solutionMeta.limitLabel || "",
            description: solutionMeta.description || "",
            monthlyPremium: roundStep(Math.max(0, safeNumber(solutionMeta.monthlyPremium, baseMonthly * safeNumber(solutionMeta.multiplier, tierMeta.multiplier || 1))), 1),
            suggested: false
          };
        })
      : buildSolutionSet(baseMonthly, score, profile);
    var suggestedId = availableSolutionId(rawSolutions, preferredId);
    return rawSolutions.map(function (solution) {
      return Object.assign({}, solution, {
        suggested: solution.id === suggestedId
      });
    });
  }

  function coverageSelectionFallback(coverageMeta, score, selectedCoverageIds, profile) {
    var linkedSelected = (coverageMeta.linkedProductIds || []).some(function (productId) {
      return selectedCoverageIds.indexOf(productId) >= 0;
    });
    var threshold = linkedSelected ? 50 : 60;
    if (coverageMeta.id === "home_pets" && !notesMentionPet(profile.notes || "")) {
      return false;
    }
    if (coverageMeta.id === "home_rc_house" && profile.housingStatus === "Affittuario") {
      return false;
    }
    if (coverageMeta.id === "health_severe_events" && profile.age < 35 && profile.netMonthlyIncome < 2200 && profile.totalAssets < 30000) {
      return false;
    }
    if (coverageMeta.id === "health_medical") threshold = linkedSelected ? 44 : 50;
    if (coverageMeta.id === "health_disability_accident") threshold = profile.occupationRisk === "alto" ? (linkedSelected ? 44 : 50) : (linkedSelected ? 48 : 56);
    if (coverageMeta.id === "health_disability_illness") threshold = profile.age >= 45 ? (linkedSelected ? 46 : 54) : (linkedSelected ? 50 : 60);
    if (coverageMeta.id === "home_rc_family" && profile.childrenCount > 0) threshold = linkedSelected ? 48 : 56;
    return score >= threshold;
  }

  function buildOfferCoverage(coverageMeta, profile, goals, recommendations, selectedCoverageIds, rawSelection) {
    var score = offerCoverageScore(coverageMeta, recommendations, goals, profile);
    var linked = linkedRecommendations(recommendations, coverageMeta.linkedProductIds || []);
    var baseMonthly = offerCoverageBaseMonthly(coverageMeta, recommendations);
    var matchedGoals = goals.filter(function (goal) { return (coverageMeta.linkedGoalIds || []).indexOf(goal.id) >= 0; });
    var solutions = buildCoverageSolutions(coverageMeta, baseMonthly, score, profile);
    var suggestedSolutionId = availableSolutionId(solutions, solutionTierForScore(score, profile));
    var hasExplicitSelection = !!(rawSelection && Object.prototype.hasOwnProperty.call(rawSelection, "selected"));
    var selected = hasExplicitSelection
      ? rawSelection.selected !== false
      : coverageSelectionFallback(coverageMeta, score, selectedCoverageIds, profile);
    var selectedSolutionId = availableSolutionId(
      solutions,
      rawSelection && rawSelection.solutionId ? rawSelection.solutionId : suggestedSolutionId
    );
    var selectedSolution = solutions.find(function (solution) { return solution.id === selectedSolutionId; }) || null;

    if (!selectedSolution) selected = false;

    return {
      id: coverageMeta.id,
      name: coverageMeta.name,
      description: coverageMeta.description || "",
      linkedProductIds: coverageMeta.linkedProductIds || [],
      linkedGoalIds: coverageMeta.linkedGoalIds || [],
      linkedRecommendationIds: linked.map(function (entry) { return entry.id; }),
      linkedGoalLabels: matchedGoals.map(function (goal) { return goal.name; }),
      fitScore: score,
      selected: selected,
      baseMonthlyPremium: baseMonthly,
      selectedMonthlyPremium: selected && selectedSolution ? selectedSolution.monthlyPremium : 0,
      selectedSolutionId: selectedSolutionId,
      selectedSolutionLabel: selectedSolution ? selectedSolution.limitLabel : "",
      solutions: solutions,
      suggestedSolutionId: suggestedSolutionId
    };
  }

  function buildOfferProduct(productMeta, profile, goals, recommendations, selectedCoverageIds, rawProductSelection) {
    var hasCoverageMap = !!(rawProductSelection && rawProductSelection.coverages && Object.keys(rawProductSelection.coverages).length);
    var coverages = (productMeta.coverages || []).map(function (coverageMeta) {
      var rawCoverageSelection = rawProductSelection && rawProductSelection.coverages
        ? rawProductSelection.coverages[coverageMeta.id]
        : null;
      return buildOfferCoverage(
        coverageMeta,
        profile,
        goals,
        recommendations,
        selectedCoverageIds,
        rawCoverageSelection || rawProductSelection || null
      );
    });
    var linked = linkedRecommendations(recommendations, productMeta.linkedProductIds || []);
    var fitScore = clamp(Math.round(Math.max(
      linked.length ? average(linked.map(function (recommendation) { return recommendation.score; })) : 0,
      coverages.length ? average(coverages.map(function (coverage) { return coverage.fitScore; })) : 0
    )), 24, 96);

    if (coverages.length && !hasCoverageMap && !coverages.some(function (coverage) { return coverage.selected; }) && fitScore >= 58) {
      var fallbackCoverage = coverages.slice().sort(function (left, right) {
        return right.fitScore - left.fitScore;
      })[0];
      if (fallbackCoverage && fallbackCoverage.selectedSolutionId) {
        coverages = coverages.map(function (coverage) {
          if (coverage.id !== fallbackCoverage.id) return coverage;
          return Object.assign({}, coverage, {
            selected: true,
            selectedMonthlyPremium: (coverage.solutions.find(function (solution) {
              return solution.id === coverage.selectedSolutionId;
            }) || {}).monthlyPremium || 0
          });
        });
      }
    }

    var baseMonthly = roundStep(sum(coverages.map(function (coverage) { return coverage.baseMonthlyPremium; })), 1);
    var productSolutions = buildSolutionSet(Math.max(baseMonthly, safeNumber(productMeta.defaultMonthly, 0)), fitScore, profile);
    var suggestedSolutionId = availableSolutionId(productSolutions, solutionTierForScore(fitScore, profile));
    var selectedSolutionId = availableSolutionId(
      productSolutions,
      rawProductSelection && rawProductSelection.solutionId ? rawProductSelection.solutionId : suggestedSolutionId
    );
    var selectedSolution = productSolutions.find(function (solution) { return solution.id === selectedSolutionId; }) || null;
    var selected = coverages.length
      ? coverages.some(function (coverage) { return coverage.selected; })
      : linked.some(function (recommendation) { return selectedCoverageIds.indexOf(recommendation.id) >= 0; });

    return {
      id: productMeta.id,
      name: productMeta.name,
      linkedProductIds: productMeta.linkedProductIds || [],
      fitScore: fitScore,
      baseMonthlyPremium: baseMonthly,
      selectedMonthlyPremium: coverages.length
        ? roundStep(sum(coverages.map(function (coverage) { return coverage.selectedMonthlyPremium || 0; })), 1)
        : selected && selectedSolution
        ? selectedSolution.monthlyPremium
        : 0,
      selected: selected,
      coverages: coverages,
      suggestedSolutionId: suggestedSolutionId,
      selectedSolutionId: selectedSolutionId,
      selectedSolutionLabel: selectedSolution ? selectedSolution.limitLabel : "",
      solutions: productSolutions,
      presentation: coverages.length > 1 ? "coverage-matrix" : "single-product"
    };
  }

  function offerAreaMatchScore(areaMeta, profile, goals, recommendations) {
    if (areaMeta.id === "home") {
      return clamp(
        (profile.housingStatus !== "Affittuario" ? 26 : 10) +
        (goals.some(function (goal) { return goal.id === "home"; }) ? 26 : 0) +
        (recommendationById(recommendations, "rc_family") ? recommendationById(recommendations, "rc_family").score * 0.45 : 0),
        18, 96
      );
    }
    if (areaMeta.id === "health") {
      return clamp(
        18 +
        (profile.age >= 45 ? 16 : 8) +
        (profile.occupationRisk === "alto" ? 18 : profile.occupationRisk === "medio" ? 10 : 4) +
        (recommendationById(recommendations, "health") ? recommendationById(recommendations, "health").score * 0.28 : 0) +
        (recommendationById(recommendations, "income_protection") ? recommendationById(recommendations, "income_protection").score * 0.25 : 0),
        20, 96
      );
    }
    if (areaMeta.id === "protection") {
      return clamp(
        16 +
        (profile.childrenCount > 0 ? 18 : 0) +
        (profile.spouseName ? 12 : 0) +
        (profile.age >= 50 ? 10 : 0) +
        (recommendationById(recommendations, "tcm") ? recommendationById(recommendations, "tcm").score * 0.28 : 0) +
        (recommendationById(recommendations, "ltc") ? recommendationById(recommendations, "ltc").score * 0.28 : 0),
        18, 96
      );
    }
    return clamp(
      18 +
      goals.length * 12 +
      (profile.monthlySavings >= 500 ? 14 : profile.monthlySavings >= 250 ? 8 : 4) +
      (profile.totalAssets >= 50000 ? 12 : 6),
      18, 94
    );
  }

  function areaReason(areaId, profile, goals, persona) {
    if (areaId === "home") {
      if (profile.housingStatus === "Con mutuo") return "Casa e mutuo sono gia centrali sul profilo.";
      if (goals.some(function (goal) { return goal.id === "home"; })) return "C'e un obiettivo casa da proteggere e finanziare bene.";
      return "Serve proteggere patrimonio, vita privata e spese domestiche.";
    }
    if (areaId === "health") {
      if (profile.occupationRisk === "alto") return "Il lavoro rende sensibile il rischio infortunio e stop operativo.";
      return "Salute, ricoveri e stop lavoro possono erodere il piano piu del previsto.";
    }
    if (areaId === "protection") {
      if (profile.childrenCount || profile.spouseName) return "Qui si difende il nucleo familiare e la continuita del piano.";
      return "Qui si trasferiscono i rischi vita e non autosufficienza.";
    }
    return "Area da configurare in funzione del caso cliente.";
  }

  function buildOfferAreas(profile, goals, recommendations, selectedCoverageIds, persona, rawOfferSelections) {
    return (DB.offerAreaCatalog || []).map(function (areaMeta) {
      var products = areaMeta.products && areaMeta.products.length
        ? areaMeta.products.map(function (productMeta) {
            var productSelection = rawOfferSelections && rawOfferSelections[areaMeta.id] && rawOfferSelections[areaMeta.id].products
              ? rawOfferSelections[areaMeta.id].products[productMeta.id]
              : null;
            return buildOfferProduct(productMeta, profile, goals, recommendations, selectedCoverageIds, productSelection);
          })
        : [
            buildOfferProduct({
              id: areaMeta.id + "_core",
              name: areaMeta.productGroupName || areaMeta.name,
              linkedProductIds: areaMeta.linkedProductIds || [],
              coverages: areaMeta.coverages || []
            }, profile, goals, recommendations, selectedCoverageIds,
            rawOfferSelections && rawOfferSelections[areaMeta.id] && rawOfferSelections[areaMeta.id].products
              ? rawOfferSelections[areaMeta.id].products[areaMeta.id + "_core"]
              : null)
          ];

      var fitScore = roundStep(Math.max(
        offerAreaMatchScore(areaMeta, profile, goals, recommendations),
        average(products.map(function (product) { return product.fitScore; }))
      ), 1);
      var coverageCount = sum(products.map(function (product) { return product.coverages.length; }));
      var selectedCount = sum(products.map(function (product) {
        return product.coverages.filter(function (coverage) { return coverage.selected; }).length;
      }));

      return {
        id: areaMeta.id,
        name: areaMeta.name,
        accent: areaMeta.accent,
        accentSoft: areaMeta.accentSoft,
        visualLabel: areaMeta.visualLabel,
        mainVisual: areaMeta.mainVisual,
        summary: areaMeta.summary,
        fitScore: clamp(Math.round(fitScore), 18, 96),
        status: fitScore >= 58 ? "Suggerita" : "Da valutare",
        reason: areaReason(areaMeta.id, profile, goals, persona),
        productCount: products.length,
        coverageCount: coverageCount,
        selectedCoverageCount: selectedCount,
        products: products
      };
    });
  }

  function serializeOfferSelections(offerAreas) {
    var payload = {};
    (offerAreas || []).forEach(function (area) {
      payload[area.id] = { products: {} };
      (area.products || []).forEach(function (product) {
        payload[area.id].products[product.id] = {
          selected: !!product.selected,
          solutionId: product.selectedSolutionId || product.suggestedSolutionId,
          coverages: {}
        };
        (product.coverages || []).forEach(function (coverage) {
          payload[area.id].products[product.id].coverages[coverage.id] = {
            selected: !!coverage.selected,
            solutionId: coverage.selectedSolutionId || coverage.suggestedSolutionId
          };
        });
      });
    });
    return payload;
  }

  function deriveOfferSelectionInputs(offerAreas, recommendations) {
    var nextSelectedIds = [];
    var nextPremiumOverrides = {};

    (offerAreas || []).forEach(function (area) {
      (area.products || []).forEach(function (product) {
        (product.coverages || []).forEach(function (coverage) {
          if (!coverage.selected) return;
          (coverage.linkedProductIds || []).forEach(function (productId) {
            if (!recommendations.some(function (recommendation) { return recommendation.id === productId; })) return;
            if (nextSelectedIds.indexOf(productId) < 0) nextSelectedIds.push(productId);
            nextPremiumOverrides[productId] = roundStep((nextPremiumOverrides[productId] || 0) + safeNumber(coverage.selectedMonthlyPremium, 0), 1);
          });
        });
      });
    });

    return {
      selectedCoverageIds: nextSelectedIds,
      premiumOverrides: nextPremiumOverrides
    };
  }

  function buildSnapshot(profile, recommendations, selectedCoverageIds) {
    var selected = recommendations.filter(function (recommendation) {
      return selectedCoverageIds.indexOf(recommendation.id) >= 0;
    });
    var totalPremium = roundStep(sum(selected.map(function (item) { return item.monthlyPremium; })), 1);
    var selfFundMonthly = Math.round(sum(selected.map(function (item) { return item.selfFundMonthlyEquivalent || 0; })));
    var deductibleBase = sum(selected.map(function (item) {
      return item.monthlyPremium * item.deductibleRate;
    }));
    var annualTaxSaving = Math.round(deductibleBase * 12);
    var liquidityFreed = Math.round(sum(selected.map(function (item) {
      return Math.max(0, item.selfFundMonthlyEquivalent - item.monthlyPremium);
    })));

    return {
      selectedCount: selected.length,
      totalPremium: totalPremium,
      selfFundMonthly: selfFundMonthly,
      deductibleMonthly: Math.round(deductibleBase),
      annualTaxSaving: annualTaxSaving,
      liquidityFreed: liquidityFreed,
      transferRatio: totalPremium ? Math.round(selfFundMonthly / totalPremium) : 0
    };
  }

  function scenarioImpact(scenarioId, profile, needs) {
    if (scenarioId === "rc") {
      return {
        upfrontLoss: needs.rcClaimLoss,
        monthlyLoss: 0,
        durationMonths: 0
      };
    }
    if (scenarioId === "morte") {
      return {
        upfrontLoss: needs.deathCapital,
        monthlyLoss: 0,
        durationMonths: 0
      };
    }
    if (scenarioId === "ip") {
      return {
        upfrontLoss: roundStep(needs.invalidityCapital * 0.25, 5000),
        monthlyLoss: roundStep(profile.netMonthlyIncome * 0.55, 50),
        durationMonths: 120
      };
    }
    if (scenarioId === "ltc") {
      return {
        upfrontLoss: roundStep(needs.ltcCapital * 0.18, 5000),
        monthlyLoss: needs.ltcMonthly,
        durationMonths: 60
      };
    }
    if (scenarioId === "casa") {
      return {
        upfrontLoss: needs.homeDamageLoss,
        monthlyLoss: 0,
        durationMonths: 0
      };
    }
    return {
      upfrontLoss: 0,
      monthlyLoss: 0,
      durationMonths: 0
    };
  }

  function productSupport(productId, scenarioId, needs) {
    if (productId === "tcm" && scenarioId === "morte") {
      return { upfront: needs.deathCapital, monthly: 0, durationMonths: 0 };
    }
    if (productId === "income_protection" && scenarioId === "ip") {
      return {
        upfront: roundStep(needs.invalidityCapital * 0.18, 5000),
        monthly: needs.incomeProtectionMonthly,
        durationMonths: 120
      };
    }
    if (productId === "rc_family" && scenarioId === "rc") {
      return { upfront: needs.rcClaimLoss, monthly: 0, durationMonths: 0 };
    }
    if (productId === "rc_family" && scenarioId === "casa") {
      return { upfront: roundStep(needs.homeDamageLoss * 0.85, 1000), monthly: 0, durationMonths: 0 };
    }
    if (productId === "ltc" && scenarioId === "ltc") {
      return { upfront: roundStep(needs.ltcCapital * 0.12, 5000), monthly: needs.ltcMonthly, durationMonths: 60 };
    }
    if (productId === "health" && (scenarioId === "ip" || scenarioId === "ltc")) {
      return { upfront: roundStep(needs.healthCapital * (scenarioId === "ip" ? 0.35 : 0.45), 5000), monthly: 0, durationMonths: 0 };
    }
    if (productId === "accident" && scenarioId === "ip") {
      return { upfront: roundStep(needs.invalidityCapital * 0.22, 5000), monthly: 0, durationMonths: 0 };
    }
    if (productId === "mortgage" && (scenarioId === "morte" || scenarioId === "ip")) {
      return { upfront: roundStep(needs.mortgageBalance * 0.8, 10000), monthly: 0, durationMonths: 0 };
    }
    return { upfront: 0, monthly: 0, durationMonths: 0 };
  }

  function scenarioLikelihoodFactor(scenarioId, profile, goalId) {
    if (scenarioId === "ip") {
      if (!profile.netMonthlyIncome) return 0.35;
      return profile.occupationRisk === "alto" ? 1 : profile.occupationRisk === "medio" ? 0.92 : 0.84;
    }
    if (scenarioId === "morte") {
      if (profile.childrenCount > 0 || profile.spouseName) return 1;
      if (profile.housingStatus === "Con mutuo") return 0.8;
      return 0.45;
    }
    if (scenarioId === "ltc") {
      if (profile.age >= 58) return 1;
      if (profile.age >= 50) return 0.8;
      if (profile.age >= 42) return goalId === "retirement" ? 0.55 : 0.42;
      if (profile.age >= 35) return goalId === "retirement" ? 0.35 : 0.22;
      return 0.12;
    }
    if (scenarioId === "rc") {
      var base = 0.3;
      if (profile.housingStatus !== "Affittuario") base += 0.25;
      if (profile.childrenCount > 0) base += 0.2;
      if (profile.totalAssets > 60000) base += 0.1;
      return clamp(base, 0.25, 0.9);
    }
    if (scenarioId === "casa") {
      if (profile.housingStatus === "Con mutuo") return 1;
      if (profile.housingStatus === "Proprietario") return 0.85;
      return 0.18;
    }
    return 0.5;
  }

  function scenarioRelevance(summary, profile, goalId) {
    var scenarioIds = summary.scenarioIds && summary.scenarioIds.length ? summary.scenarioIds : [summary.id];
    var averageLikelihood = average(scenarioIds.map(function (scenarioId) {
      return scenarioLikelihoodFactor(scenarioId, profile, goalId);
    })) || 0.5;
    return averageLikelihood * (summary.type === "bundle" ? 0.94 : 1);
  }

  function scenarioPriorityValue(summary, profile, goalId) {
    var rawPriority = summary.noCoverage.goalGap + Math.round(summary.noCoverage.delayYears * 9000) + (summary.totalLossValue || 0) * 0.03;
    return rawPriority * scenarioRelevance(summary, profile, goalId);
  }

  function goalAssetQuota(goal, context) {
    var profile = context.profile;
    var goalCount = Math.max((context.goals || []).length, 1);
    var sharedLiquid = profile.liquidAssets / goalCount;
    var sharedInvested = profile.investedAssets / goalCount;

    if (goal.id === "emergency") return profile.liquidAssets;
    if (goal.id === "retirement") return sharedLiquid * 0.9 + sharedInvested * 0.85;
    if (goal.id === "home") return sharedLiquid * 0.8 + sharedInvested * 0.2;
    if (goal.id === "education") return sharedLiquid * 0.75 + sharedInvested * 0.12;
    return sharedLiquid * 0.7 + sharedInvested * 0.18;
  }

  function goalSavingsPotential(goal, context) {
    var profile = context.profile;
    var needs = context.needs;
    var freeCash = Math.max(0, profile.netMonthlyIncome - needs.monthlyOutflows);
    var sustainableSavings = Math.max(profile.monthlySavings, freeCash * 0.35);
    var horizonYears = Math.min(goal.years, goal.id === "retirement" ? 5 : 3);
    var factor = goal.id === "retirement" ? 0.45 : goal.id === "home" ? 0.5 : goal.id === "education" ? 0.38 : 0.42;
    return sustainableSavings * horizonYears * 12 * factor;
  }

  function goalFoundation(goal, context) {
    var profile = context.profile;
    var needs = context.needs;
    var target = Math.max(goal.targetAmount, 1);
    var capitalCoverage = clamp(goalAssetQuota(goal, context) / target, 0, 1);
    var savingsCoverage = clamp(goalSavingsPotential(goal, context) / target, 0, 1);
    var liquidityCoverage =
      goal.id === "emergency"
        ? clamp(profile.liquidAssets / target, 0, 1)
        : clamp(profile.liquidAssets / Math.max(needs.monthlyOutflows * 8, 1), 0, 1);

    var foundation = {
      capitalCoverage: capitalCoverage,
      savingsCoverage: savingsCoverage,
      liquidityCoverage: liquidityCoverage,
      score: 0.45 * capitalCoverage + 0.35 * savingsCoverage + 0.2 * liquidityCoverage
    };

    var benchmark = resolveIncomeWealthBenchmark(profile);
    if (benchmark) {
      var peerSignals = [];
      var annualIncome = profile.grossAnnualIncome || estimateGrossAnnualFromNet(profile.netMonthlyIncome);
      if (annualIncome > 0 && safeNumber(benchmark.income_median_eur, 0) > 0) {
        peerSignals.push({
          weight: 0.4,
          value: clamp(annualIncome / benchmark.income_median_eur / 1.1, 0, 1.15)
        });
      }
      if (profile.totalAssets > 0 && safeNumber(benchmark.wealth_median_eur, 0) > 0) {
        peerSignals.push({
          weight: 0.35,
          value: clamp(profile.totalAssets / benchmark.wealth_median_eur / 1.1, 0, 1.15)
        });
      }
      if (profile.liquidAssets > 0 && safeNumber(benchmark.financial_assets_median_eur, 0) > 0) {
        peerSignals.push({
          weight: 0.25,
          value: clamp(profile.liquidAssets / benchmark.financial_assets_median_eur / 1.1, 0, 1.15)
        });
      }

      if (peerSignals.length) {
        var peerWeight = sum(peerSignals.map(function (item) { return item.weight; })) || 1;
        var peerScore = sum(peerSignals.map(function (item) { return item.weight * item.value; })) / peerWeight;
        foundation.peerScore = peerScore;
        foundation.score = foundation.score * 0.78 + peerScore * 0.22;
        foundation.benchmarkMeta = benchmark;
      }
    }

    return foundation;
  }

  function goalResilienceScore(goal, profile, summary, foundationScore, branchKey) {
    var branch = summary[branchKey];
    var achievementRatio = clamp(branch.achievement / 100, 0, 1);
    var targetCoverage = clamp(1 - branch.goalGap / Math.max(goal.targetAmount, 1), 0, 1);
    var capitalRetention = clamp(branch.postEventCapital / Math.max(profile.totalAssets, 1), 0, 1);
    var delayScore = clamp(1 - branch.delayYears / Math.max(goal.years + 3, 1), 0, 1);
    var resilienceScore = 0.4 * targetCoverage + 0.25 * achievementRatio + 0.2 * capitalRetention + 0.15 * delayScore;
    var composite = foundationScore * 0.45 + resilienceScore * 0.55;
    var floorScore = foundationScore > 0 ? foundationScore * 0.3 : 0;
    return clamp(Math.round(Math.max(composite, floorScore) * 100), 0, 100);
  }

  function buildGoalGaugeCard(goal, context) {
    var bundleCatalog = bundleCatalogForGoal(goal.id);
    var candidates = bundleCatalog.length
      ? bundleCatalog.map(function (bundleMeta) {
          return buildScenarioSummary(
            Object.assign({ type: "bundle" }, bundleMeta),
            bundleMeta.scenarioIds,
            Object.assign({}, context, { focusGoal: goal })
          );
        })
      : DB.scenarioCatalog.map(function (scenarioMeta) {
          return buildScenarioSummary(
            Object.assign({ type: "single" }, scenarioMeta),
            [scenarioMeta.id],
            Object.assign({}, context, { focusGoal: goal })
          );
        });

    candidates.sort(function (left, right) {
      return scenarioPriorityValue(right, context.profile, goal.id) - scenarioPriorityValue(left, context.profile, goal.id);
    });

    var pivot = candidates[0];
    var foundation = goalFoundation(goal, context);
    var noScore = goalResilienceScore(goal, context.profile, pivot, foundation.score, "noCoverage");
    var yesScore = goalResilienceScore(goal, context.profile, pivot, foundation.score, "withCoverage");
    return {
      goalId: goal.id,
      goalName: goal.name,
      goalEmoji: goal.emoji,
      years: goal.years,
      displayYears: goal.displayYears,
      targetAmount: goal.targetAmount,
      noCoverageAchievement: noScore,
      activeAchievement: yesScore,
      improvement: Math.max(0, yesScore - noScore),
      foundationScore: Math.round(foundation.score * 100),
      scenarioLabel: pivot.label,
      severityLabel: pivot.severityLabel,
      scenarioType: pivot.type
    };
  }

  function aggregateSupport(selectedProducts, scenarioId, needs) {
    return selectedProducts.reduce(function (accumulator, product) {
      var support = productSupport(product.id, scenarioId, needs);
      accumulator.upfront += support.upfront;
      accumulator.monthly += support.monthly;
      accumulator.durationMonths = Math.max(accumulator.durationMonths, support.durationMonths);
      return accumulator;
    }, { upfront: 0, monthly: 0, durationMonths: 0 });
  }

  function scenarioMetaById(scenarioId) {
    return DB.scenarioCatalog.find(function (scenario) { return scenario.id === scenarioId; }) || null;
  }

  function bundleCatalogForGoal(goalId) {
    return DB.scenarioBundleCatalog[goalId] || DB.scenarioBundleCatalog.default || [];
  }

  function combineScenarioImpact(scenarioIds, profile, needs) {
    return scenarioIds.reduce(function (accumulator, scenarioId) {
      var impact = scenarioImpact(scenarioId, profile, needs);
      accumulator.upfrontLoss += impact.upfrontLoss;
      accumulator.monthlyLoss += impact.monthlyLoss;
      accumulator.durationMonths = Math.max(accumulator.durationMonths, impact.durationMonths);
      return accumulator;
    }, { upfrontLoss: 0, monthlyLoss: 0, durationMonths: 0 });
  }

  function aggregateSupportForScenarioIds(selectedProducts, scenarioIds, needs) {
    return scenarioIds.reduce(function (accumulator, scenarioId) {
      var support = aggregateSupport(selectedProducts, scenarioId, needs);
      accumulator.upfront += support.upfront;
      accumulator.monthly += support.monthly;
      accumulator.durationMonths = Math.max(accumulator.durationMonths, support.durationMonths);
      return accumulator;
    }, { upfront: 0, monthly: 0, durationMonths: 0 });
  }

  function scenarioYearForIds(scenarioIds) {
    return scenarioIds.reduce(function (currentMin, scenarioId) {
      var year = DB.defaults.eventYearByScenario[scenarioId] || 2;
      return Math.min(currentMin, year);
    }, 99);
  }

  function hashString(value) {
    var hash = 2166136261;
    for (var i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createRng(seed) {
    var state = seed || 123456789;
    return function () {
      state = Math.imul(1664525, state) + 1013904223;
      return ((state >>> 0) % 4294967296) / 4294967296;
    };
  }

  function randomNormal(rng) {
    var u = 0;
    var v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function buildGoalSchedule(goals, horizonMonths) {
    var schedule = new Map();
    goals.forEach(function (goal) {
      var month = clamp(goal.years * 12, 12, horizonMonths);
      if (!schedule.has(month)) schedule.set(month, []);
      schedule.get(month).push(goal);
    });
    return schedule;
  }

  function runProjection(config) {
    var profile = config.profile;
    var goals = config.goals;
    var riskProfile = DB.defaults.riskProfiles[profile.riskProfileId] || DB.defaults.riskProfiles.bilanciato;
    var trials = DB.defaults.trialCount;
    var consumeCapitalOnGoal = config.consumeCapitalOnGoal !== false;
    var horizonMonths = config.horizonYears * 12;
    var eventYear = safeNumber(config.eventYear, DB.defaults.eventYearByScenario[config.scenarioId] || 2);
    var eventMonth = clamp(eventYear * 12, 6, horizonMonths - 1);
    var goalSchedule = buildGoalSchedule(goals, horizonMonths);
    var baseContribution = Math.max(0, config.monthlySavings - config.premiumDrag);
    var totalWeight = sum(goals.map(function (goal) { return goal.priority; })) || 1;
    var monthlyMean = riskProfile.annualReturn / 12;
    var monthlyVolatility = riskProfile.annualVolatility / Math.sqrt(12);
    var averagePath = Array.from({ length: horizonMonths + 1 }, function () { return 0; });
    var targetPath = Array.from({ length: horizonMonths + 1 }, function () { return 0; });
    var successAccumulator = 0;
    var fullSuccessAccumulator = 0;
    var endingCapitalAccumulator = 0;
    var baseSeed = hashString([profile.name, config.scenarioId, config.seedLabel, config.horizonYears].join("|"));

    for (var targetMonth = 0; targetMonth <= horizonMonths; targetMonth += 1) {
      var cumulativeTarget = goals
        .filter(function (goal) { return goal.years * 12 <= targetMonth; })
        .reduce(function (accumulator, goal) {
          return accumulator + goal.targetAmount;
        }, 0);
      targetPath[targetMonth] = cumulativeTarget;
    }

    for (var trial = 0; trial < trials; trial += 1) {
      var rng = createRng(baseSeed + trial * 97);
      var capital = config.initialCapital;
      var achievedWeight = 0;

      averagePath[0] += capital;

      for (var month = 1; month <= horizonMonths; month += 1) {
        if (month === eventMonth) capital = Math.max(0, capital - config.netImpact.upfrontLoss);

        var contribution = baseContribution;
        if (month >= eventMonth && month < eventMonth + config.netImpact.durationMonths) {
          contribution -= config.netImpact.monthlyLoss;
        }

        capital = Math.max(0, capital * (1 + monthlyMean + monthlyVolatility * randomNormal(rng)) + contribution);

        if (goalSchedule.has(month)) {
          goalSchedule.get(month).forEach(function (goal) {
            var achievementRatio = goal.targetAmount > 0 ? clamp(capital / goal.targetAmount, 0, 1) : 1;
            achievedWeight += goal.priority * achievementRatio;
            if (consumeCapitalOnGoal) {
              capital = Math.max(0, capital - Math.min(capital, goal.targetAmount));
            }
          });
        }

        averagePath[month] += capital;
      }

      var weightedAchievement = achievedWeight / totalWeight;
      successAccumulator += weightedAchievement;
      fullSuccessAccumulator += weightedAchievement >= 0.85 ? 1 : 0;
      endingCapitalAccumulator += capital;
    }

    return {
      weightedAchievement: successAccumulator / trials,
      fullSuccessRate: fullSuccessAccumulator / trials,
      averageEndingCapital: endingCapitalAccumulator / trials,
      averagePath: averagePath.map(function (value) { return Math.round(value / trials); }),
      targetPath: targetPath
    };
  }

  function formatDelay(delayYears) {
    if (!delayYears) return "nessun ritardo";
    if (delayYears < 1) return "meno di 1 anno";
    return delayYears.toFixed(1).replace(".", ",") + " anni";
  }

  function estimateDelayYears(goalGap, monthlyCapacity) {
    if (!goalGap) return 0;
    var annualCapacity = Math.max(50, monthlyCapacity) * 12;
    return clamp(goalGap / annualCapacity, 0, 25);
  }

  function buildGoalImpact(focusGoal, projection, monthlyCapacity, horizonYears) {
    var goalMonth = clamp(focusGoal.years * 12, 12, horizonYears * 12);
    var availableCapital = projection.averagePath[goalMonth] || 0;
    var goalGap = Math.max(0, focusGoal.targetAmount - availableCapital);
    return {
      availableCapital: Math.round(availableCapital),
      goalGap: Math.round(goalGap),
      delayYears: estimateDelayYears(goalGap, monthlyCapacity)
    };
  }

  function describeScenario(profile, scenarioMeta, summary, focusGoal) {
    var lossShare = summary.baseCapital ? Math.round((summary.noCoverage.postEventLoss / summary.baseCapital) * 100) : 0;
    var gapText = summary.noCoverage.goalGap ? "gap di €" + formatCurrency(summary.noCoverage.goalGap) : "target ancora raggiungibile";
    var withGapText = summary.withCoverage.goalGap ? "gap residuo di €" + formatCurrency(summary.withCoverage.goalGap) : "target sostanzialmente protetto";
    return {
      title: "Senza copertura, " + scenarioMeta.name.toLowerCase() + " mette sotto pressione \"" + focusGoal.name + "\" con " + gapText,
      body:
        profile.name +
        " rischia di spostare l'obiettivo \"" +
        focusGoal.name +
        "\" di " +
        formatDelay(summary.noCoverage.delayYears) +
        ". Con le coperture attive il piano torna piu stabile, con " +
        withGapText +
        " e probabilita che sale dal " +
        summary.noAchievement +
        "% al " +
        summary.yesAchievement +
        "%."
    };
  }

  function buildScenarioSummary(meta, scenarioIds, context) {
    var profile = context.profile;
    var needs = context.needs;
    var focusGoal = context.focusGoal;
    var horizonYears = context.horizonYears;
    var selectedProducts = context.selectedProducts;
    var premiumDrag = context.premiumDrag;
    var rawImpact = combineScenarioImpact(scenarioIds, profile, needs);
    var withSupport = aggregateSupportForScenarioIds(selectedProducts, scenarioIds, needs);
    var noCoverageImpact = {
      upfrontLoss: rawImpact.upfrontLoss,
      monthlyLoss: rawImpact.monthlyLoss,
      durationMonths: rawImpact.durationMonths
    };
    var withCoverageImpact = {
      upfrontLoss: Math.max(0, rawImpact.upfrontLoss - withSupport.upfront),
      monthlyLoss: Math.max(0, rawImpact.monthlyLoss - withSupport.monthly),
      durationMonths: rawImpact.durationMonths
    };
    var eventYear = scenarioYearForIds(scenarioIds);
    var noProjection = runProjection({
      profile: profile,
      goals: [focusGoal],
      scenarioId: scenarioIds[0],
      eventYear: eventYear,
      horizonYears: horizonYears,
      initialCapital: profile.totalAssets,
      monthlySavings: profile.monthlySavings,
      premiumDrag: 0,
      netImpact: noCoverageImpact,
      seedLabel: "no|" + focusGoal.id + "|" + meta.id,
      consumeCapitalOnGoal: false
    });
    var yesProjection = runProjection({
      profile: profile,
      goals: [focusGoal],
      scenarioId: scenarioIds[0],
      eventYear: eventYear,
      horizonYears: horizonYears,
      initialCapital: profile.totalAssets,
      monthlySavings: profile.monthlySavings,
      premiumDrag: premiumDrag,
      netImpact: withCoverageImpact,
      seedLabel: "yes|" + focusGoal.id + "|" + meta.id,
      consumeCapitalOnGoal: false
    });
    var totalLossValue = rawImpact.upfrontLoss + rawImpact.monthlyLoss * rawImpact.durationMonths;
    var noCoverageProtected = totalLossValue ? 0 : 100;
    var yesCoverageProtected = totalLossValue
      ? clamp(Math.round(((withSupport.upfront + withSupport.monthly * rawImpact.durationMonths) / totalLossValue) * 100), 0, 100)
      : 100;
    var noRetention = profile.totalAssets ? Math.round((Math.max(0, profile.totalAssets - noCoverageImpact.upfrontLoss) / profile.totalAssets) * 100) : 0;
    var yesRetention = profile.totalAssets ? Math.round((Math.max(0, profile.totalAssets - withCoverageImpact.upfrontLoss) / profile.totalAssets) * 100) : 0;
    var noAchievement = Math.round(noProjection.weightedAchievement * 100);
    var yesAchievement = Math.round(yesProjection.weightedAchievement * 100);
    var noGoalImpact = buildGoalImpact(
      focusGoal,
      noProjection,
      Math.max(0, profile.monthlySavings - noCoverageImpact.monthlyLoss),
      horizonYears
    );
    var yesGoalImpact = buildGoalImpact(
      focusGoal,
      yesProjection,
      Math.max(0, profile.monthlySavings - premiumDrag - withCoverageImpact.monthlyLoss),
      horizonYears
    );
    var noSustainability = Math.round(noAchievement * 0.6 + noRetention * 0.4);
    var yesSustainability = Math.round(yesAchievement * 0.6 + yesRetention * 0.4);
    var achievementDelta = Math.max(0, yesAchievement - noAchievement);
    var eventLabels = scenarioIds.map(function (scenarioId) {
      var scenarioMeta = scenarioMetaById(scenarioId);
      return scenarioMeta ? scenarioMeta.shortLabel : scenarioId;
    });
    var narrative = describeScenario(profile, meta, {
      baseCapital: profile.totalAssets,
      noCoverage: Object.assign({ postEventLoss: noCoverageImpact.upfrontLoss }, noGoalImpact),
      withCoverage: yesGoalImpact,
      noAchievement: noAchievement,
      yesAchievement: yesAchievement
    }, focusGoal);

    return {
      id: meta.id,
      type: meta.type || "single",
      label: meta.name,
      icon: meta.icon,
      severityLabel: meta.severityLabel,
      severityClass: meta.severityClass,
      shortLabel: meta.shortLabel || meta.name,
      description: meta.description || "",
      scenarioIds: scenarioIds.slice(),
      eventLabels: eventLabels,
      amountLabel: noGoalImpact.goalGap
        ? "Gap target: € " + formatCurrency(noGoalImpact.goalGap)
        : achievementDelta
        ? "+" + achievementDelta + " pt obiettivo"
        : "Target protetto",
      alertTitle: narrative.title,
      alertBody: narrative.body,
      noCoverage: {
        postEventCapital: Math.max(0, profile.totalAssets - noCoverageImpact.upfrontLoss),
        goalAvailableCapital: noGoalImpact.availableCapital,
        goalGap: noGoalImpact.goalGap,
        delayYears: noGoalImpact.delayYears,
        achievement: noAchievement,
        sustainability: noSustainability,
        protection: noCoverageProtected,
        path: noProjection.averagePath
      },
      withCoverage: {
        postEventCapital: Math.max(0, profile.totalAssets - withCoverageImpact.upfrontLoss),
        goalAvailableCapital: yesGoalImpact.availableCapital,
        goalGap: yesGoalImpact.goalGap,
        delayYears: yesGoalImpact.delayYears,
        achievement: yesAchievement,
        sustainability: yesSustainability,
        protection: yesCoverageProtected,
        path: yesProjection.averagePath
      },
      targetPath: yesProjection.targetPath,
      loss: rawImpact,
      totalLossValue: totalLossValue || rawImpact.upfrontLoss
    };
  }

  function analyzeScenarios(plan, overrides) {
    var profile = finalizeProfile(Object.assign({}, plan.profile, {
      totalAssets: safeNumber(overrides.totalAssets, plan.profile.totalAssets),
      liquidAssets: Math.min(plan.profile.liquidAssets, safeNumber(overrides.totalAssets, plan.profile.totalAssets)),
      investedAssets: Math.max(0, safeNumber(overrides.totalAssets, plan.profile.totalAssets) - Math.min(plan.profile.liquidAssets, safeNumber(overrides.totalAssets, plan.profile.totalAssets))),
      monthlySavings: safeNumber(overrides.monthlySavings, plan.profile.monthlySavings)
    }));
    var horizonYears = clamp(safeNumber(overrides.horizonYears, 10), 2, 25);
    var goals = plan.goals.map(function (goal) { return Object.assign({}, goal); });
    var selectedProducts = plan.recommendations.filter(function (recommendation) {
      return plan.selectedCoverageIds.indexOf(recommendation.id) >= 0;
    });
    var premiumDrag = sum(selectedProducts.map(function (product) { return product.monthlyPremium; }));
    var scenarioSummaries = {};
    var bundleSummaries = {};
    var focusGoal =
      goals.find(function (goal) { return goal.id === overrides.goalId; }) ||
      goals.find(function (goal) { return goal.id !== "emergency"; }) ||
      goals[0] ||
      buildGoal("wealth", profile, {});
    var bundleCatalog = bundleCatalogForGoal(focusGoal.id);
    var scenarioContext = {
      profile: profile,
      needs: plan.needs,
      focusGoal: focusGoal,
      horizonYears: horizonYears,
      selectedProducts: selectedProducts,
      premiumDrag: premiumDrag
    };

    DB.scenarioCatalog.forEach(function (scenarioMeta) {
      scenarioSummaries[scenarioMeta.id] = buildScenarioSummary(
        Object.assign({ type: "single" }, scenarioMeta),
        [scenarioMeta.id],
        scenarioContext
      );
    });

    bundleCatalog.forEach(function (bundleMeta) {
      bundleSummaries[bundleMeta.id] = buildScenarioSummary(
        Object.assign({ type: "bundle" }, bundleMeta),
        bundleMeta.scenarioIds,
        scenarioContext
      );
    });

    return {
      profile: profile,
      horizonYears: horizonYears,
      primaryGoal: focusGoal,
      focusGoal: focusGoal,
      goalOptions: goals,
      goalGaugeCards: goals.map(function (goal) {
        return buildGoalGaugeCard(goal, scenarioContext);
      }),
      scenarioOrder: DB.scenarioCatalog.map(function (scenario) { return scenario.id; }),
      bundleOrder: bundleCatalog.map(function (bundle) { return bundle.id; }),
      scenarios: scenarioSummaries,
      bundles: bundleSummaries
    };
  }

  function buildPlan(profileInput, options) {
    var profile = finalizeProfile(profileInput);
    var manualPremiumOverrides = Object.assign({}, options && options.premiumOverrides ? options.premiumOverrides : {});
    var forcedProductIds = forcedOfferProductIds(options && options.offerSelections ? options.offerSelections : null);
    var goalSuggestions = buildGoals(profile);
    var profileGoalSelection = dedupeGoals(profile.goals || [])
      .filter(function (goal) { return goal.enabled !== false; })
      .map(function (goal) { return goal.id; });
    var hasExplicitGoalSelection = !!(options && Object.prototype.hasOwnProperty.call(options, "selectedGoalIds"));
    var selectedGoalIds = (hasExplicitGoalSelection ? options.selectedGoalIds : profileGoalSelection.length ? profileGoalSelection : goalSuggestions.map(function (goal) { return goal.id; }))
      .filter(function (id) {
        return goalSuggestions.some(function (goal) { return goal.id === id; });
      });

    if (!selectedGoalIds.length && goalSuggestions.length) {
      var fallbackGoal = goalSuggestions.find(function (goal) { return goal.id !== "emergency"; }) || goalSuggestions[0];
      selectedGoalIds = [fallbackGoal.id];
    }

    var goals = goalSuggestions.filter(function (goal) {
      return selectedGoalIds.indexOf(goal.id) >= 0;
    });
    var segment = detectSegment(profile, goals);
    var needs = computeNeeds(profile, goals);
    var persona = detectPersona(profile);
    var seedRecommendations = recommendProducts(profile, goals, needs, segment, manualPremiumOverrides, forcedProductIds);
    var defaultSelectedCoverageIds = seedRecommendations
      .filter(function (recommendation) { return recommendation.selectedByDefault; })
      .map(function (recommendation) { return recommendation.id; });
    var hasExplicitSelection = !!(options && Object.prototype.hasOwnProperty.call(options, "selectedCoverageIds"));
    var seedSelectedCoverageIds = (hasExplicitSelection ? options.selectedCoverageIds : defaultSelectedCoverageIds).filter(function (id) {
      return seedRecommendations.some(function (recommendation) { return recommendation.id === id; });
    });
    var previewOfferAreas = buildOfferAreas(
      profile,
      goals,
      seedRecommendations,
      seedSelectedCoverageIds,
      persona.current,
      options && options.offerSelections ? options.offerSelections : null
    );
    var offerSelections = serializeOfferSelections(previewOfferAreas);
    var derivedSelectionInputs = deriveOfferSelectionInputs(previewOfferAreas, seedRecommendations);
    var premiumOverrides = Object.assign({}, manualPremiumOverrides, derivedSelectionInputs.premiumOverrides);
    var recommendations = recommendProducts(
      profile,
      goals,
      needs,
      segment,
      premiumOverrides,
      forcedProductIds.concat(derivedSelectionInputs.selectedCoverageIds)
    );
    var selectedCoverageIds = derivedSelectionInputs.selectedCoverageIds.filter(function (id) {
      return recommendations.some(function (recommendation) { return recommendation.id === id; });
    });

    if (!selectedCoverageIds.length && recommendations.length && !hasExplicitSelection) {
      selectedCoverageIds = [recommendations[0].id];
    }

    var offerAreas = buildOfferAreas(profile, goals, recommendations, selectedCoverageIds, persona.current, offerSelections);
    offerSelections = serializeOfferSelections(offerAreas);
    derivedSelectionInputs = deriveOfferSelectionInputs(offerAreas, recommendations);
    selectedCoverageIds = derivedSelectionInputs.selectedCoverageIds.filter(function (id) {
      return recommendations.some(function (recommendation) { return recommendation.id === id; });
    });
    premiumOverrides = Object.assign({}, manualPremiumOverrides, derivedSelectionInputs.premiumOverrides);
    var snapshot = buildSnapshot(profile, recommendations, selectedCoverageIds);

    return {
      profile: profile,
      goals: goals,
      goalSuggestions: goalSuggestions,
      selectedGoalIds: selectedGoalIds,
      segment: segment,
      persona: persona.current,
      personaDistribution: persona.distribution,
      needs: needs,
      recommendations: recommendations,
      selectedCoverageIds: selectedCoverageIds,
      premiumOverrides: premiumOverrides,
      offerSelections: offerSelections,
      snapshot: snapshot,
      offerAreas: offerAreas
    };
  }

  function buildAdvisorReply(profile) {
    var normalizedProfile = finalizeProfile(profile, { applyDefaults: false });
    var goals = buildGoals(normalizedProfile);
    var explicitGoals = dedupeGoals(profile.goals || []);
    var missing = [];
    if (!normalizedProfile.age) missing.push("eta del cliente");
    if (!normalizedProfile.grossAnnualIncome && !normalizedProfile.netMonthlyIncome) missing.push("reddito");
    if (!normalizedProfile.monthlySavings && !normalizedProfile.totalAssets) missing.push("capacita di risparmio o patrimonio");
    if (!normalizedProfile.profession) missing.push("professione");
    if (!normalizedProfile.housingStatus) missing.push("situazione abitativa");

    var recap = [];
    recap.push((normalizedProfile.name || "Il cliente") + (normalizedProfile.age ? ", " + normalizedProfile.age + " anni" : ""));
    if (normalizedProfile.maritalStatus) recap.push(normalizedProfile.maritalStatus.toLowerCase());
    if (normalizedProfile.childrenCount) recap.push(normalizedProfile.childrenCount + " figli");
    if (normalizedProfile.profession) recap.push(normalizedProfile.profession.toLowerCase());
    if (normalizedProfile.netMonthlyIncome) recap.push("reddito mensile € " + formatCurrency(normalizedProfile.netMonthlyIncome));
    else if (normalizedProfile.grossAnnualIncome) recap.push("reddito annuo € " + formatCurrency(normalizedProfile.grossAnnualIncome));
    if (normalizedProfile.totalAssets) recap.push("patrimonio € " + formatCurrency(normalizedProfile.totalAssets));
    if (normalizedProfile.monthlySavings) recap.push("risparmio € " + formatCurrency(normalizedProfile.monthlySavings) + "/mese");
    if (explicitGoals.length) {
      recap.push("obiettivi: " + explicitGoals.slice(0, 2).map(function (goal) {
        var goalMeta = DB.goalCatalog.find(function (entry) { return entry.id === goal.id; });
        return goalMeta ? goalMeta.name.toLowerCase() : goal.id;
      }).join(", "));
    } else if (goals.length) {
      recap.push("obiettivi: " + goals.slice(0, 2).map(function (goal) { return goal.name.toLowerCase(); }).join(", "));
    }

    var ready = !missing.length || (normalizedProfile.age && normalizedProfile.grossAnnualIncome && (normalizedProfile.totalAssets || normalizedProfile.monthlySavings));
    var message = "Ho strutturato il profilo: " + recap.filter(Boolean).join(" · ") + ".";

    if (ready) {
      message += " Ho dati sufficienti per costruire scheda cliente, obiettivi e coperture coerenti.";
    } else {
      message += " Per rifinire bene il piano mi servono ancora " + missing.slice(0, 2).join(" e ") + ".";
    }

    return {
      ready: ready,
      message: message
    };
  }

  function saveProfile(profile) {
    try {
      if (typeof localStorage === "undefined") return;
      var storeKey = DB.meta.storeKey;
      var current = JSON.parse(localStorage.getItem(storeKey) || "[]");
      var payload = Object.assign({}, finalizeProfile(profile), {
        savedAt: new Date().toISOString()
      });
      var filtered = current.filter(function (entry) {
        return entry.name !== payload.name || entry.age !== payload.age;
      });
      filtered.unshift(payload);
      localStorage.setItem(storeKey, JSON.stringify(filtered.slice(0, 20)));
    } catch (error) {
      return;
    }
  }

  function saveProposal(proposal) {
    try {
      if (typeof localStorage === "undefined") return null;
      var storeKey = DB.meta.proposalStoreKey;
      var current = JSON.parse(localStorage.getItem(storeKey) || "[]");
      var payload = {
        id: "proposal_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
        savedAt: new Date().toISOString(),
        profile: finalizeProfile((proposal && proposal.profile) || {}, { applyDefaults: false }),
        selectedGoalIds: ((proposal && proposal.selectedGoalIds) || []).slice(0, 8),
        selectedCoverageIds: ((proposal && proposal.selectedCoverageIds) || []).slice(0, 12),
        premiumOverrides: Object.assign({}, (proposal && proposal.premiumOverrides) || {}),
        offerSelections: Object.assign({}, (proposal && proposal.offerSelections) || {}),
        snapshot: Object.assign({}, (proposal && proposal.snapshot) || {}),
        personaId: proposal && proposal.persona ? proposal.persona.id : "",
        title: proposal && proposal.title ? proposal.title : ""
      };
      current.unshift(payload);
      localStorage.setItem(storeKey, JSON.stringify(current.slice(0, 25)));
      return payload;
    } catch (error) {
      return null;
    }
  }

  function listStoredProfiles() {
    try {
      if (typeof localStorage === "undefined") return [];
      return JSON.parse(localStorage.getItem(DB.meta.storeKey) || "[]");
    } catch (error) {
      return [];
    }
  }

  function listStoredProposals() {
    try {
      if (typeof localStorage === "undefined") return [];
      return JSON.parse(localStorage.getItem(DB.meta.proposalStoreKey) || "[]");
    } catch (error) {
      return [];
    }
  }

  root.FamilyAdvisorEngine = {
    createEmptyProfile: createEmptyProfile,
    mergeChatInput: mergeChatInput,
    finalizeProfile: finalizeProfile,
    buildPlan: buildPlan,
    analyzeScenarios: analyzeScenarios,
    buildAdvisorReply: buildAdvisorReply,
    saveProfile: saveProfile,
    listStoredProfiles: listStoredProfiles,
    saveProposal: saveProposal,
    listStoredProposals: listStoredProposals,
    formatCurrency: formatCurrency
  };
})(typeof window !== "undefined" ? window : globalThis);
