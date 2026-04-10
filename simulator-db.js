(function (root) {
  const EXTRA_BENCHMARKS = root.FAMILY_ADVISOR_EXTRA_BENCHMARKS || {};
  const FAMILY_ADVISOR_DB = {
    meta: {
      appName: "FamilyAdvisor Pro",
      version: "1.0.0",
      storeKey: "family-advisor-profiles-v1",
      proposalStoreKey: "family-advisor-proposals-v1"
    },
    demoChatSeed:
      "Marco Ferretti, 42 anni, sposato con Giulia 38 anni, 2 figli (8 e 5 anni), ingegnere, RAL 65.000€, patrimonio 80.000€, risparmio mensile 800€, affittuario. Obiettivi: pensione integrativa da 65 anni, acquisto prima casa entro 5 anni budget 250k, fondo studi per i figli, protezione reddito familiare.",
    defaults: {
      trialCount: 180,
      eventYearByScenario: {
        rc: 1,
        morte: 1,
        ip: 2,
        ltc: 3,
        casa: 2
      },
      riskProfiles: {
        prudente: { label: "Prudente", annualReturn: 0.022, annualVolatility: 0.032 },
        bilanciato: { label: "Bilanciato", annualReturn: 0.034, annualVolatility: 0.058 },
        dinamico: { label: "Dinamico", annualReturn: 0.046, annualVolatility: 0.088 }
      }
    },
    benchmarkCatalog: {
      education: {
        sourceId: "mur_university_contribution",
        studyDurationYears: 5,
        booksAndMobilityAnnual: 1200,
        supportAnnualByCostBand: {
          high: 6500,
          medium: 4500,
          base: 3000
        },
        nationalDefault: {
          city: "Italia",
          region: "Italia",
          avgFeePayers: 1740.7,
          avgFeeAllStudents: 1322.56,
          costBand: "medium"
        },
        cityBenchmarks: [
          { city: "Torino", region: "Piemonte", university: "Torino", universityCode: "00101", avgFeePayers: 1502.08, avgFeeAllStudents: 1224.67, costBand: "medium" },
          { city: "Milano", region: "Lombardia", university: "Milano", universityCode: "01501", avgFeePayers: 1752.23, avgFeeAllStudents: 1426.12, costBand: "high" },
          { city: "Padova", region: "Veneto", university: "Padova", universityCode: "02801", avgFeePayers: 1574.08, avgFeeAllStudents: 1318.43, costBand: "medium" },
          { city: "Bologna", region: "Emilia-Romagna", university: "Bologna", universityCode: "03701", avgFeePayers: 1512.56, avgFeeAllStudents: 1128.61, costBand: "high" },
          { city: "Firenze", region: "Toscana", university: "Firenze", universityCode: "04801", avgFeePayers: 1070.25, avgFeeAllStudents: 868.99, costBand: "high" },
          { city: "Pisa", region: "Toscana", university: "Pisa", universityCode: "05001", avgFeePayers: 1184.6, avgFeeAllStudents: 926.77, costBand: "medium" },
          { city: "Roma", region: "Lazio", university: "Roma La Sapienza", universityCode: "05801", avgFeePayers: 1245.44, avgFeeAllStudents: 946.29, costBand: "high" },
          { city: "Napoli", region: "Campania", university: "Napoli Federico II", universityCode: "06301", avgFeePayers: 1354.56, avgFeeAllStudents: 879.16, costBand: "medium" },
          { city: "Bari", region: "Puglia", university: "Bari", universityCode: "07201", avgFeePayers: 1039.23, avgFeeAllStudents: 742.82, costBand: "base" },
          { city: "Palermo", region: "Sicilia", university: "Palermo", universityCode: "08201", avgFeePayers: 1155.97, avgFeeAllStudents: 787.8, costBand: "base" },
          { city: "Catania", region: "Sicilia", university: "Catania", universityCode: "08701", avgFeePayers: 770.19, avgFeeAllStudents: 559.05, costBand: "base" },
          { city: "Cagliari", region: "Sardegna", university: "Cagliari", universityCode: "09201", avgFeePayers: 900.99, avgFeeAllStudents: 592.36, costBand: "medium" },
          { city: "Verona", region: "Veneto", university: "Verona", universityCode: "02301", avgFeePayers: 1426.32, avgFeeAllStudents: 1195.19, costBand: "medium" },
          { city: "Venezia", region: "Veneto", university: "Venezia Ca Foscari", universityCode: "02701", avgFeePayers: 1553.9, avgFeeAllStudents: 1293.19, costBand: "high" }
        ]
      },
      home: {
        sourceId: "ae_omi_quotes",
        semester: "20252",
        downPaymentRate: 0.2,
        closingCostRate: 0.08,
        setupBufferBase: 7000,
        setupBufferPerChild: 2000,
        targetSqmByHousehold: {
          single: 60,
          couple: 75,
          family_1: 95,
          family_2: 110,
          family_3_plus: 125
        },
        nationalDefault: {
          city: "Italia",
          region: "Italia",
          buyMidEurSqm: 2062.5,
          rentMidEurSqmMonth: 7.8,
          buyMidP25EurSqm: 1625,
          buyMidP75EurSqm: 2800
        },
        cityBenchmarks: [
          { city: "Torino", province: "TO", region: "Piemonte", semester: "20252", sampleZoneCount: 47, buyMidEurSqm: 2025, buyMidP25EurSqm: 1625, buyMidP75EurSqm: 2375, rentMidEurSqmMonth: 7.5 },
          { city: "Milano", province: "MI", region: "Lombardia", semester: "20252", sampleZoneCount: 42, buyMidEurSqm: 4000, buyMidP25EurSqm: 3400, buyMidP75EurSqm: 6150, rentMidEurSqmMonth: 14 },
          { city: "Padova", province: "PD", region: "Veneto", semester: "20252", sampleZoneCount: 18, buyMidEurSqm: 1325, buyMidP25EurSqm: 1250, buyMidP75EurSqm: 1425, rentMidEurSqmMonth: 6.47 },
          { city: "Bologna", province: "BO", region: "Emilia-Romagna", semester: "20252", sampleZoneCount: 33, buyMidEurSqm: 2800, buyMidP25EurSqm: 2475, buyMidP75EurSqm: 3100, rentMidEurSqmMonth: 11.55 },
          { city: "Firenze", province: "FI", region: "Toscana", semester: "20252", sampleZoneCount: 33, buyMidEurSqm: 2850, buyMidP25EurSqm: 2675, buyMidP75EurSqm: 3350, rentMidEurSqmMonth: 10.2 },
          { city: "Pisa", province: "PI", region: "Toscana", semester: "20252", sampleZoneCount: 16, buyMidEurSqm: 1862.5, buyMidP25EurSqm: 1675, buyMidP75EurSqm: 2100, rentMidEurSqmMonth: 7.65 },
          { city: "Roma", province: "RM", region: "Lazio", semester: "20252", sampleZoneCount: 213, buyMidEurSqm: 2750, buyMidP25EurSqm: 2175, buyMidP75EurSqm: 3575, rentMidEurSqmMonth: 11.75 },
          { city: "Napoli", province: "NA", region: "Campania", semester: "20252", sampleZoneCount: 63, buyMidEurSqm: 2100, buyMidP25EurSqm: 1650, buyMidP75EurSqm: 2800, rentMidEurSqmMonth: 7.55 },
          { city: "Bari", province: "BA", region: "Puglia", semester: "20252", sampleZoneCount: 27, buyMidEurSqm: 1675, buyMidP25EurSqm: 1500, buyMidP75EurSqm: 1900, rentMidEurSqmMonth: 6.15 },
          { city: "Palermo", province: "PA", region: "Sicilia", semester: "20252", sampleZoneCount: 51, buyMidEurSqm: 1250, buyMidP25EurSqm: 1175, buyMidP75EurSqm: 1500, rentMidEurSqmMonth: 4.25 },
          { city: "Catania", province: "CT", region: "Sicilia", semester: "20252", sampleZoneCount: 26, buyMidEurSqm: 1225, buyMidP25EurSqm: 1085, buyMidP75EurSqm: 1350, rentMidEurSqmMonth: 4.32 },
          { city: "Cagliari", province: "CA", region: "Sardegna", semester: "20252", sampleZoneCount: 21, buyMidEurSqm: 2100, buyMidP25EurSqm: 1950, buyMidP75EurSqm: 2250, rentMidEurSqmMonth: 7.95 },
          { city: "Verona", province: "VR", region: "Veneto", semester: "20252", sampleZoneCount: 15, buyMidEurSqm: 1825, buyMidP25EurSqm: 1625, buyMidP75EurSqm: 2050, rentMidEurSqmMonth: 8.5 },
          { city: "Venezia", province: "VE", region: "Veneto", semester: "20252", sampleZoneCount: 33, buyMidEurSqm: 2100, buyMidP25EurSqm: 1300, buyMidP75EurSqm: 3500, rentMidEurSqmMonth: 10.62 }
        ]
      },
      householdExpense: {
        sourceId: "bdi_shiw_microdata",
        period: "2022",
        nationalDefault: {
          macroArea: "Italia",
          householdType: "couple",
          childrenBand: "0",
          monthlyConsumptionMedianEur: 1908.33,
          monthlySavingMedianEur: 863.86
        },
        regionMacroMap: {
          "Valle d'Aosta": "Nord Ovest",
          Piemonte: "Nord Ovest",
          Liguria: "Nord Ovest",
          Lombardia: "Nord Ovest",
          "Trentino-Alto Adige": "Nord Est",
          Veneto: "Nord Est",
          "Friuli-Venezia Giulia": "Nord Est",
          "Emilia-Romagna": "Nord Est",
          Toscana: "Centro",
          Umbria: "Centro",
          Marche: "Centro",
          Lazio: "Centro",
          Abruzzo: "Sud",
          Molise: "Sud",
          Campania: "Sud",
          Puglia: "Sud",
          Basilicata: "Sud",
          Calabria: "Sud",
          Sicilia: "Isole",
          Sardegna: "Isole"
        },
        rows: (EXTRA_BENCHMARKS.householdExpense && EXTRA_BENCHMARKS.householdExpense.rows) || []
      },
      incomeWealth: {
        sourceId: "bdi_shiw_microdata",
        period: "2022",
        minSampleSizeAgeBand: 10,
        nationalDefault: {
          macroArea: "Italia",
          ageBand: "all_ages",
          householdType: "couple",
          incomeMedianEur: 32000,
          wealthMedianEur: 140000,
          financialAssetsMedianEur: 10000
        },
        rows: (EXTRA_BENCHMARKS.incomeWealth && EXTRA_BENCHMARKS.incomeWealth.rows) || []
      }
    },
    occupationRules: [
      {
        risk: "basso",
        factor: 0.9,
        keywords: ["ingegn", "impieg", "amministra", "designer", "consulent", "insegn", "architett"]
      },
      {
        risk: "medio",
        factor: 1.05,
        keywords: ["manager", "commercial", "medic", "avvocat", "farmac", "imprendit"]
      },
      {
        risk: "alto",
        factor: 1.25,
        keywords: ["artigian", "murator", "autist", "opera", "agricol", "elettric", "idraulic"]
      }
    ],
    personaCatalog: [
      {
        id: "single_no_children",
        name: "Single senza figli",
        householdType: "single",
        childrenBand: "0",
        headline: "Autonomia e obiettivi personali",
        description: "Profilo concentrato su casa, accumulo ed equilibrio di cassa."
      },
      {
        id: "single_with_children",
        name: "Single con figli",
        householdType: "single",
        childrenBand: "1_plus",
        headline: "Bilancio familiare monoreddito",
        description: "Serve difendere la cassa mensile e mettere ordine tra priorita familiari."
      },
      {
        id: "couple_no_children",
        name: "Coppia senza figli",
        householdType: "couple",
        childrenBand: "0",
        headline: "Costruzione del progetto di coppia",
        description: "Casa, risparmio e protezione patrimonio guidano la trattativa."
      },
      {
        id: "family_one_child",
        name: "Famiglia con 1 figlio",
        householdType: "family_1",
        childrenBand: "1",
        headline: "Protezione del progetto familiare",
        description: "Reddito, studi e casa vanno letti insieme, con poche leve molto chiare."
      },
      {
        id: "family_two_plus",
        name: "Famiglia con 2+ figli",
        householdType: "family_2_plus",
        childrenBand: "2_plus",
        headline: "Famiglia numerosa e piano sotto pressione",
        description: "La robustezza del piano dipende dalla tenuta del reddito e dalla qualita del cuscinetto."
      },
      {
        id: "extended_household",
        name: "Nucleo esteso / maturo",
        householdType: "extended",
        childrenBand: "0",
        headline: "Patrimonio e stabilita da proteggere",
        description: "Profilo piu strutturato dove contano tenuta patrimoniale, LTC e continuita del piano."
      }
    ],
    segments: [
      {
        id: "family-builder",
        name: "Famiglia in crescita",
        description: "Protezione del reddito e obiettivi familiari sono il cuore della pianificazione.",
        priorities: ["income_protection", "education", "home"]
      },
      {
        id: "home-planner",
        name: "Casa come priorita",
        description: "Serve equilibrio tra anticipo casa, tutela del reddito e fondo imprevisti.",
        priorities: ["home", "emergency", "income_protection"]
      },
      {
        id: "wealth-accumulator",
        name: "Accumulo patrimoniale",
        description: "Il cliente ha gia capacita di risparmio: va protetta l'efficienza del piano.",
        priorities: ["wealth", "retirement", "ltc"]
      },
      {
        id: "pre-retirement",
        name: "Pre-pensionamento",
        description: "Gli obiettivi previdenziali e di tenuta patrimoniale diventano centrali.",
        priorities: ["retirement", "ltc", "wealth"]
      },
      {
        id: "independent-pro",
        name: "Professionista autonomo",
        description: "La stabilita del reddito dipende direttamente dalla persona e va difesa.",
        priorities: ["income_protection", "health", "retirement"]
      }
    ],
    solutionTierCatalog: [
      { id: "essential", name: "Essential", multiplier: 0.82, accent: "soft" },
      { id: "smart", name: "Smart", multiplier: 1, accent: "core" },
      { id: "plus", name: "Plus", multiplier: 1.24, accent: "plus" },
      { id: "elite", name: "Elite", multiplier: 1.52, accent: "top" }
    ],
    goalCatalog: [
      {
        id: "retirement",
        name: "Pensione integrativa",
        emoji: "👴",
        accentClass: "gp",
        targetLabel: "Capitale previdenziale"
      },
      {
        id: "home",
        name: "Acquisto casa",
        emoji: "🏠",
        accentClass: "gc",
        targetLabel: "Capitale iniziale"
      },
      {
        id: "education",
        name: "Fondo studi figli",
        emoji: "🎓",
        accentClass: "ge",
        targetLabel: "Capitale dedicato"
      },
      {
        id: "emergency",
        name: "Fondo emergenze",
        emoji: "🚨",
        accentClass: "gr",
        targetLabel: "Riserva di sicurezza"
      },
      {
        id: "wealth",
        name: "Risparmio obiettivo",
        emoji: "📈",
        accentClass: "gp",
        targetLabel: "Capitale target"
      }
    ],
    productCatalog: [
      {
        id: "tcm",
        name: "Temporanea Caso Morte (TCM)",
        areaId: "protection",
        icon: "💀",
        tint: "#e8f4fd",
        deductibleRate: 0.19,
        deductibleLabel: "Si - 19%",
        scenarioIds: ["morte"],
        shortDescription: "Capitale ai familiari in caso di decesso."
      },
      {
        id: "income_protection",
        name: "Invalidita & Protezione reddito",
        areaId: "health",
        icon: "🦽",
        tint: "#fff7e6",
        deductibleRate: 0.19,
        deductibleLabel: "Si - 19%",
        scenarioIds: ["ip"],
        shortDescription: "Tutela la capacita reddituale in caso di invalidita."
      },
      {
        id: "rc_family",
        name: "RC Famiglia & Casa",
        areaId: "home",
        icon: "🏡",
        tint: "#eaf7f0",
        deductibleRate: 0,
        deductibleLabel: "No",
        scenarioIds: ["rc", "casa"],
        shortDescription: "Protegge da danni a terzi e imprevisti domestici."
      },
      {
        id: "ltc",
        name: "Long Term Care (LTC)",
        areaId: "protection",
        icon: "🏥",
        tint: "#fdf0ef",
        deductibleRate: 0.19,
        deductibleLabel: "Si - 19%",
        scenarioIds: ["ltc"],
        shortDescription: "Rendita per non autosufficienza e assistenza."
      },
      {
        id: "health",
        name: "Salute ricoveri",
        areaId: "health",
        icon: "🩺",
        tint: "#eef5ff",
        deductibleRate: 0.19,
        deductibleLabel: "Si - 19%",
        scenarioIds: ["ip", "ltc"],
        shortDescription: "Copre spese mediche e ricoveri straordinari."
      },
      {
        id: "accident",
        name: "Infortuni quotidiani",
        areaId: "health",
        icon: "🦺",
        tint: "#eefbf4",
        deductibleRate: 0.19,
        deductibleLabel: "Si - 19%",
        scenarioIds: ["ip"],
        shortDescription: "Indennizzo per infortuni che impattano lavoro e autonomia."
      },
      {
        id: "mortgage",
        name: "Protezione mutuo",
        areaId: "home",
        icon: "🏠",
        tint: "#fff5ea",
        deductibleRate: 0.19,
        deductibleLabel: "Si - 19%",
        scenarioIds: ["morte", "ip"],
        shortDescription: "Riduce il rischio di blocco del piano casa con mutuo."
      }
    ],
    offerAreaCatalog: [
      {
        id: "home",
        name: "Casa",
        accent: "#0A5BC8",
        accentSoft: "#EAF2FF",
        visualLabel: "Patrimonio casa",
        mainVisual: "Protezione immobile e responsabilita",
        summary: "1 prodotto, 8 coperture attivabili, 4 livelli di soluzione.",
        productGroupName: "Casa Protetta",
        linkedProductIds: ["rc_family", "mortgage"],
        coverages: [
          { id: "home_rc", name: "RC vita privata", linkedProductIds: ["rc_family"], defaultMonthly: 14 },
          { id: "home_property_damage", name: "Danni abitazione", linkedProductIds: ["rc_family"], defaultMonthly: 18 },
          { id: "home_contents", name: "Contenuto e furto", linkedProductIds: ["rc_family"], defaultMonthly: 12 },
          { id: "home_legal", name: "Tutela legale", linkedProductIds: ["rc_family"], defaultMonthly: 9 },
          { id: "home_assistance", name: "Assistenza casa", linkedProductIds: ["rc_family"], defaultMonthly: 8 },
          { id: "home_systems", name: "Impianti e guasti", linkedProductIds: ["rc_family"], defaultMonthly: 7 },
          { id: "home_events", name: "Eventi naturali", linkedProductIds: ["rc_family"], defaultMonthly: 11 },
          { id: "home_mortgage", name: "Protezione mutuo", linkedProductIds: ["mortgage"], defaultMonthly: 16 }
        ]
      },
      {
        id: "health",
        name: "Salute",
        accent: "#00857C",
        accentSoft: "#E9F8F6",
        visualLabel: "Salute e continuita",
        mainVisual: "Spese mediche, infortuni e stop lavoro",
        summary: "1 prodotto, 5 coperture attivabili, 4 livelli di soluzione.",
        productGroupName: "Salute & Infortuni",
        linkedProductIds: ["health", "accident", "income_protection"],
        coverages: [
          { id: "health_hospital", name: "Ricoveri", linkedProductIds: ["health"], defaultMonthly: 18 },
          { id: "health_diagnostic", name: "Diagnostica", linkedProductIds: ["health"], defaultMonthly: 12 },
          { id: "health_specialist", name: "Specialistica", linkedProductIds: ["health"], defaultMonthly: 10 },
          { id: "health_accident", name: "Infortuni", linkedProductIds: ["accident"], defaultMonthly: 14 },
          { id: "health_income_stop", name: "Stop lavoro", linkedProductIds: ["income_protection"], defaultMonthly: 22 }
        ]
      },
      {
        id: "protection",
        name: "Protection",
        accent: "#7A3FF2",
        accentSoft: "#F1EBFF",
        visualLabel: "Vita e long care",
        mainVisual: "Protezione del nucleo e della non autosufficienza",
        summary: "2 prodotti, 2 coperture chiave, 4 livelli di soluzione.",
        products: [
          {
            id: "protection_life",
            name: "Protezione Vita",
            linkedProductIds: ["tcm"],
            coverages: [
              { id: "protection_tcm", name: "TCM", linkedProductIds: ["tcm"], defaultMonthly: 12 }
            ]
          },
          {
            id: "protection_ltc",
            name: "Long Term Care",
            linkedProductIds: ["ltc"],
            coverages: [
              { id: "protection_ltc", name: "LTC", linkedProductIds: ["ltc"], defaultMonthly: 18 }
            ]
          }
        ]
      },
    ],
    scenarioCatalog: [
      {
        id: "rc",
        name: "Sinistro RC",
        icon: "🚗",
        severityLabel: "Medio",
        severityClass: "sm",
        shortLabel: "Danno a terzi"
      },
      {
        id: "morte",
        name: "Decesso capofamiglia",
        icon: "💔",
        severityLabel: "Critico",
        severityClass: "sa",
        shortLabel: "Sostituzione reddito"
      },
      {
        id: "ip",
        name: "Invalidita grave",
        icon: "🦽",
        severityLabel: "Critico",
        severityClass: "sa",
        shortLabel: "Perdita reddito"
      },
      {
        id: "ltc",
        name: "Non autosufficienza",
        icon: "🏥",
        severityLabel: "Elevato",
        severityClass: "sm",
        shortLabel: "Costi assistenza"
      },
      {
        id: "casa",
        name: "Danno casa / furto",
        icon: "🏡",
        severityLabel: "Contenuto",
        severityClass: "sb",
        shortLabel: "Ripristino immobile"
      }
    ],
    scenarioBundleCatalog: {
      home: [
        {
          id: "home_income_lock",
          name: "Blocco reddito familiare",
          icon: "🌪️",
          severityLabel: "Critico",
          severityClass: "sa",
          shortLabel: "Reddito + famiglia",
          description: "Invalidita o decesso fermano l'accumulo proprio mentre il cliente prepara l'anticipo casa.",
          scenarioIds: ["ip", "morte"]
        },
        {
          id: "home_property_stress",
          name: "Casa sotto pressione",
          icon: "🏚️",
          severityLabel: "Elevato",
          severityClass: "sm",
          shortLabel: "Casa + RC",
          description: "Danno immobile e responsabilita civile erodono una parte del capitale destinato alla casa.",
          scenarioIds: ["casa", "rc"]
        },
        {
          id: "home_full_stress",
          name: "Stress completo acquisto casa",
          icon: "🧱",
          severityLabel: "Critico",
          severityClass: "sa",
          shortLabel: "Reddito + casa",
          description: "Scenario combinato con stop al reddito e spese straordinarie sulla casa nel momento piu delicato.",
          scenarioIds: ["ip", "casa", "rc"]
        }
      ],
      education: [
        {
          id: "education_income_stop",
          name: "Stop risparmio famiglia",
          icon: "📚",
          severityLabel: "Critico",
          severityClass: "sa",
          shortLabel: "Reddito + figli",
          description: "La famiglia perde capacita di accumulo proprio quando si avvicinano gli studi dei figli.",
          scenarioIds: ["ip", "morte"]
        },
        {
          id: "education_care_drag",
          name: "Carico assistenziale",
          icon: "🫶",
          severityLabel: "Elevato",
          severityClass: "sm",
          shortLabel: "Assistenza + reddito",
          description: "Costi assistenziali e minore reddito rallentano il fondo studi nel medio periodo.",
          scenarioIds: ["ltc", "ip"]
        },
        {
          id: "education_family_stress",
          name: "Stress famiglia completo",
          icon: "👨‍👩‍👧‍👦",
          severityLabel: "Critico",
          severityClass: "sa",
          shortLabel: "Famiglia + tutela",
          description: "Più imprevisti familiari insieme possono spostare in modo deciso l'obiettivo universitario.",
          scenarioIds: ["morte", "ip", "ltc"]
        }
      ],
      retirement: [
        {
          id: "retirement_longevity_stress",
          name: "Pressione previdenziale",
          icon: "⏳",
          severityLabel: "Elevato",
          severityClass: "sm",
          shortLabel: "Previdenza + salute",
          description: "La pensione integrativa soffre quando i costi di salute si sommano a un calo di reddito.",
          scenarioIds: ["ltc", "ip"]
        },
        {
          id: "retirement_capital_erosion",
          name: "Erosione del capitale",
          icon: "📉",
          severityLabel: "Elevato",
          severityClass: "sm",
          shortLabel: "Capitale + assistenza",
          description: "Assistenza di lungo periodo e spese straordinarie riducono il capitale disponibile per la pensione.",
          scenarioIds: ["ltc", "rc"]
        },
        {
          id: "retirement_total_stress",
          name: "Stress previdenziale completo",
          icon: "🛡️",
          severityLabel: "Critico",
          severityClass: "sa",
          shortLabel: "Salute + reddito",
          description: "Una combinazione di salute, assistenza e perdita di reddito mette sotto pressione la pensione futura.",
          scenarioIds: ["ip", "ltc", "rc"]
        }
      ],
      emergency: [
        {
          id: "emergency_quick_shock",
          name: "Shock di cassa",
          icon: "⚡",
          severityLabel: "Elevato",
          severityClass: "sm",
          shortLabel: "Cassa + imprevisti",
          description: "Un danno immediato e una spesa domestica assorbono la riserva di emergenza in poco tempo.",
          scenarioIds: ["rc", "casa"]
        },
        {
          id: "emergency_income_drag",
          name: "Cassa sotto stress",
          icon: "💧",
          severityLabel: "Critico",
          severityClass: "sa",
          shortLabel: "Reddito + cassa",
          description: "Il fondo emergenze viene consumato rapidamente quando si ferma il reddito e arrivano nuove spese.",
          scenarioIds: ["ip", "rc"]
        },
        {
          id: "emergency_full_stress",
          name: "Stress completo di liquidita",
          icon: "🚨",
          severityLabel: "Critico",
          severityClass: "sa",
          shortLabel: "Liquidita + famiglia",
          description: "Una serie di imprevisti concatenati puo azzerare il cuscinetto di sicurezza molto prima del previsto.",
          scenarioIds: ["ip", "casa", "rc"]
        }
      ],
      wealth: [
        {
          id: "wealth_income_drag",
          name: "Accumulo rallentato",
          icon: "📦",
          severityLabel: "Elevato",
          severityClass: "sm",
          shortLabel: "Reddito + accumulo",
          description: "La perdita di reddito riduce la velocita di accumulo e allontana il capitale obiettivo.",
          scenarioIds: ["ip", "rc"]
        },
        {
          id: "wealth_family_drag",
          name: "Drag patrimoniale famiglia",
          icon: "🫧",
          severityLabel: "Elevato",
          severityClass: "sm",
          shortLabel: "Famiglia + patrimonio",
          description: "Spese straordinarie familiari e assistenziali intaccano il capitale investibile.",
          scenarioIds: ["ltc", "rc"]
        },
        {
          id: "wealth_full_stress",
          name: "Stress completo accumulo",
          icon: "🧭",
          severityLabel: "Critico",
          severityClass: "sa",
          shortLabel: "Accumulo + protezione",
          description: "La combinazione di piu imprevisti puo erodere il patrimonio e rendere piu fragile il percorso di accumulo.",
          scenarioIds: ["ip", "ltc", "rc"]
        }
      ],
      default: [
        {
          id: "default_income_stress",
          name: "Stress reddito",
          icon: "🌩️",
          severityLabel: "Critico",
          severityClass: "sa",
          shortLabel: "Reddito",
          description: "Il rischio principale nasce da un calo improvviso di reddito e capacità di risparmio.",
          scenarioIds: ["ip", "morte"]
        },
        {
          id: "default_asset_stress",
          name: "Stress patrimonio",
          icon: "🧱",
          severityLabel: "Elevato",
          severityClass: "sm",
          shortLabel: "Patrimonio",
          description: "Spese straordinarie e responsabilita civile possono erodere il capitale disponibile.",
          scenarioIds: ["rc", "casa"]
        }
      ]
    },
    chatKeywordMap: {
      marital: {
        Sposato: ["sposato", "sposata", "coniuge", "moglie", "marito"],
        Convivente: ["convivente", "convive"],
        Single: ["single", "celibe", "nubile"],
        Divorziato: ["divorziato", "separato"],
        Vedovo: ["vedovo", "vedova"]
      },
      housing: {
        Affittuario: ["affitto", "affittuario", "in locazione"],
        "Con mutuo": ["mutuo", "rata mutuo"],
        Proprietario: ["proprietario", "proprietaria", "casa di proprieta", "casa di proprietà", "immobile di proprieta", "immobile di proprietà", "casa propria"]
      },
      goals: {
        retirement: ["pensione", "previdenza", "integrativa"],
        home: ["casa", "prima casa", "mutuo", "immobile"],
        education: ["universita", "studi", "figli", "figlio", "scuola"],
        emergency: ["emergenz", "cuscinetto", "sicurezza"],
        wealth: ["obiettivo", "accumulo"]
      },
      products: {
        tcm: ["tcm", "caso morte", "vita"],
        income_protection: ["invalidita", "protezione reddito", "infortuni"],
        rc_family: ["rc", "casa", "famiglia", "furto", "incendio"],
        ltc: ["ltc", "non autosufficienza", "assistenza"],
        health: ["salute", "ricoveri", "medica"],
        mortgage: ["mutuo", "cpi"]
      }
    }
  };

  root.FAMILY_ADVISOR_DB = FAMILY_ADVISOR_DB;
})(typeof window !== "undefined" ? window : globalThis);
