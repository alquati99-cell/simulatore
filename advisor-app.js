(function (root) {
  var S = {
    page: 1,
    rec: null,
    list: false,
    ch: {},
    draftProfile: null,
    plan: null,
    analysis: null,
    page2AnalysisVisible: false,
    activeScenarioId: "rc",
    activeScenarioMode: "bundle",
    activeGoalId: null,
    coverageTouched: false,
    isRendering: false,
    pendingTurnId: 0,
    ragTurnId: 0,
    ragInsight: null,
    chatRagInsight: null
  };
  var INITIAL_ASSISTANT_MESSAGE = "Ciao! Scrivi quello che sai del cliente: nome, eta, famiglia, reddito mensile, casa, obiettivi. Anche due righe o appunti veloci vanno bene.";
  var AI_STORAGE_KEYS = {
    apiKey: "familyadvisor.groqApiKey",
    model: "familyadvisor.groqModel"
  };
  var DEFAULT_GROQ_MODEL = "llama-3.1-8b-instant";
  var GROQ_CHAT_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
  var AI_TIMEOUT_MS = 6500;
  var RAG_QUERY_ENDPOINT = "https://simulatore-rag-api.alquati99.workers.dev/api/rag/query";
  var RAG_INTAKE_ENDPOINT = "https://simulatore-rag-api.alquati99.workers.dev/api/rag/intake";
  var RAG_TIMEOUT_MS = 9000;
  var RAG_INTAKE_TIMEOUT_MS = 4200;

  function byId(id) {
    return document.getElementById(id);
  }

  function loadAiConfig() {
    try {
      if (typeof localStorage === "undefined") return { apiKey: "", model: DEFAULT_GROQ_MODEL };
      return {
        apiKey: String(localStorage.getItem(AI_STORAGE_KEYS.apiKey) || "").trim(),
        model: String(localStorage.getItem(AI_STORAGE_KEYS.model) || DEFAULT_GROQ_MODEL).trim() || DEFAULT_GROQ_MODEL
      };
    } catch (error) {
      return { apiKey: "", model: DEFAULT_GROQ_MODEL };
    }
  }

  function saveAiConfig(apiKey, model) {
    try {
      if (typeof localStorage === "undefined") return false;
      localStorage.setItem(AI_STORAGE_KEYS.apiKey, String(apiKey || "").trim());
      localStorage.setItem(AI_STORAGE_KEYS.model, String(model || DEFAULT_GROQ_MODEL).trim() || DEFAULT_GROQ_MODEL);
      return true;
    } catch (error) {
      return false;
    }
  }

  function clearAiConfig() {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.removeItem(AI_STORAGE_KEYS.apiKey);
      localStorage.removeItem(AI_STORAGE_KEYS.model);
    } catch (error) {
      return;
    }
  }

  function maskApiKey(apiKey) {
    var value = String(apiKey || "").trim();
    if (!value) return "";
    if (value.length <= 10) return value;
    return value.slice(0, 5) + "..." + value.slice(-4);
  }

  function refreshAiButton() {
    var button = byId("aiConfigBtn");
    if (!button) return;
    var config = loadAiConfig();
    var isConnected = !!config.apiKey;
    button.textContent = isConnected ? "Groq attiva" : "AI locale";
    button.classList.toggle("on", isConnected);
    button.title = isConnected
      ? "Groq collegata in locale (" + maskApiKey(config.apiKey) + "). Clicca per sostituire o scollegare la chiave."
      : "Collega Groq in locale per migliorare l'estrazione dal testo libero.";
  }

  function configureAi() {
    var config = loadAiConfig();
    var promptText = config.apiKey
      ? "Groq e attiva in locale (" + maskApiKey(config.apiKey) + "). Incolla una nuova chiave per sostituirla, oppure scrivi OFF per scollegarla."
      : "Incolla una chiave Groq per attivare l'estrazione AI avanzata. La chiave viene salvata solo in questo browser locale.";
    var nextValue = root.prompt(promptText, "");
    if (nextValue == null) {
      refreshAiButton();
      return;
    }

    nextValue = String(nextValue || "").trim();
    if (!nextValue) {
      refreshAiButton();
      return;
    }

    if (/^(off|disconnetti|rimuovi|remove|clear)$/i.test(nextValue)) {
      clearAiConfig();
      refreshAiButton();
      addM("ai", "AI avanzata scollegata. Continuo con il parser locale, che resta sempre il fallback.");
      return;
    }

    if (nextValue.indexOf("gsk_") !== 0) {
      addM("ai", "La chiave non sembra una Groq API key valida. Per sicurezza non l'ho salvata.");
      refreshAiButton();
      return;
    }

    if (!saveAiConfig(nextValue, config.model || DEFAULT_GROQ_MODEL)) {
      addM("ai", "Non sono riuscito a salvare la chiave in locale su questo browser.");
      return;
    }

    refreshAiButton();
    addM("ai", "AI avanzata Groq collegata in locale. La usero per capire meglio il testo libero, ma i calcoli resteranno nel motore assicurativo.");
  }

  function aiMissingFields(profile) {
    var current = profile || {};
    var missing = [];
    if (!current.age) missing.push("age");
    if (!current.grossAnnualIncome && !current.netMonthlyIncome) missing.push("income");
    if (!current.totalAssets && !current.monthlySavings) missing.push("assets_or_savings");
    if (!current.profession) missing.push("profession");
    if (!current.housingStatus) missing.push("housing");
    return missing;
  }

  function trimAiNotes(value) {
    var text = String(value || "").trim();
    if (text.length <= 1400) return text;
    return text.slice(text.length - 1400);
  }

  function sanitizeProfileForAi(profile) {
    var current = profile || {};
    return {
      name: current.name || "",
      age: current.age || 0,
      maritalStatus: current.maritalStatus || "",
      spouseName: current.spouseName || "",
      spouseAge: current.spouseAge || 0,
      childrenCount: current.childrenCount || 0,
      childrenAges: current.childrenAges || [],
      profession: current.profession || "",
      grossAnnualIncome: current.grossAnnualIncome || 0,
      netMonthlyIncome: current.netMonthlyIncome || 0,
      monthlySavings: current.monthlySavings || 0,
      totalAssets: current.totalAssets || 0,
      liquidAssets: current.liquidAssets || 0,
      investedAssets: current.investedAssets || 0,
      housingStatus: current.housingStatus || "",
      housingCost: current.housingCost || 0,
      fixedExpenses: current.fixedExpenses || 0,
      notes: trimAiNotes(current.notes)
    };
  }

  function parseAiJson(content) {
    var text = String(content || "").trim();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch (error) {
      var start = text.indexOf("{");
      var end = text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        try {
          return JSON.parse(text.slice(start, end + 1));
        } catch (nestedError) {
          return null;
        }
      }
    }

    return null;
  }

  async function requestGroqCanonicalNote(baseProfile, text) {
    var config = loadAiConfig();
    if (!config.apiKey || typeof root.fetch !== "function") return "";

    var controller = typeof root.AbortController === "function" ? new root.AbortController() : null;
    var timeoutId = controller ? root.setTimeout(function () { controller.abort(); }, AI_TIMEOUT_MS) : 0;
    var payload = {
      model: config.model || DEFAULT_GROQ_MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Estrai dati cliente da chat assicurativa in italiano. Rispondi solo con JSON valido {\"canonicalNote\":\"...\",\"confidence\":\"high|medium|low\"}. " +
            "canonicalNote deve contenere solo fatti cliente espliciti e in forma canonica, pronti per un parser regole-based. " +
            "Usa etichette chiare come: eta 56 anni; reddito annuo lordo 65000 euro; reddito netto mensile 3200 euro; patrimonio 30000 euro. " +
            "Non inventare coperture, polizze o raccomandazioni. " +
            "Se il messaggio contiene solo un numero, inferisci il significato dai campi mancanti: 1-2 cifre = eta se manca l'eta; >=10000 = reddito annuo se manca il reddito; 500-9000 = reddito netto mensile se manca il reddito."
        },
        {
          role: "user",
          content: JSON.stringify({
            currentProfile: sanitizeProfileForAi(baseProfile),
            missingFields: aiMissingFields(baseProfile),
            latestMessage: String(text || "").trim()
          })
        }
      ]
    };

    try {
      var response = await root.fetch(GROQ_CHAT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + config.apiKey
        },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      });

      if (timeoutId) root.clearTimeout(timeoutId);
      if (!response.ok) return "";

      var json = await response.json();
      var content = (((json || {}).choices || [])[0] || {}).message ? (((json || {}).choices || [])[0] || {}).message.content : "";
      var parsed = parseAiJson(content);
      var canonicalNote = parsed && (parsed.canonicalNote || parsed.canonical_note || parsed.note);
      return String(canonicalNote || "").trim();
    } catch (error) {
      if (timeoutId) root.clearTimeout(timeoutId);
      return "";
    }
  }

  async function enrichProfileWithAi(baseProfile, mergedProfile, text) {
    var canonicalNote = await requestGroqCanonicalNote(baseProfile, text);
    if (!canonicalNote) return mergedProfile;
    return FamilyAdvisorEngine.mergeChatInput(mergedProfile, canonicalNote, { appendNotes: false });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function roundStep(value, step) {
    return Math.round(value / step) * step;
  }

  function currency(value) {
    return FamilyAdvisorEngine.formatCurrency(value);
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[character];
    });
  }

  function shortProductLabel(product) {
    var labels = {
      tcm: "Decesso / TCM",
      income_protection: "Reddito / IP",
      rc_family: "RC & Casa",
      ltc: "Non autosufficienza",
      health: "Salute",
      mortgage: "Mutuo"
    };
    return labels[product.id] || product.name;
  }

  function householdCoreBurn(profile) {
    return profile.housingCost + profile.fixedExpenses + 350 + profile.childrenCount * 140 + (profile.spouseName ? 180 : 0);
  }

  function featuredGoal(goals) {
    return goals.find(function (goal) { return goal.id !== "emergency"; }) || goals[0] || null;
  }

  function formatDelay(delayYears) {
    if (!delayYears) return "nessun ritardo";
    if (delayYears < 1) return "meno di 1 anno";
    return delayYears.toFixed(1).replace(".", ",") + " anni";
  }

  function compactDelay(delayYears) {
    if (!delayYears) return "nessuno";
    if (delayYears < 1) return "< 1a";
    return delayYears.toFixed(1).replace(".", ",") + "a";
  }

  function scoreTone(score) {
    if (score <= 40) {
      return { key: "red", label: "Basso", color: "#c0392b" };
    }
    if (score <= 70) {
      return { key: "orange", label: "Medio", color: "#d46b08" };
    }
    return { key: "green", label: "Solido", color: "#1a7f4b" };
  }

  function sumValues(values) {
    return values.reduce(function (total, value) {
      return total + (value || 0);
    }, 0);
  }

  function premiumRangeLabel(product) {
    var premium = Math.max(0, product.monthlyPremium || 0);
    var low = Math.max(8, Math.floor(premium * 0.88));
    var high = Math.max(low + 4, Math.ceil(premium * 1.12));
    return "€ " + currency(low) + " - " + currency(high) + "/mese";
  }

  function reserveMultiple(product) {
    var premium = Math.max(product.monthlyPremium || 0, 1);
    return Math.max(1, Math.round((product.selfFundMonthlyEquivalent || premium) / premium));
  }

  function priorityMeta(score) {
    if (score >= 60) return { label: "Priorita alta", key: "high" };
    if (score >= 45) return { label: "Priorita media", key: "medium" };
    return { label: "Priorita bassa", key: "low" };
  }

  function goalInputValue(goal, field) {
    if (field === "years") return goal.years;
    return currency(goal.targetAmount);
  }

  function sanitizeGoalValue(goal, field, rawValue) {
    var numericValue = parseInt(String(rawValue || "").replace(/[^\d]/g, ""), 10) || 0;
    if (field === "years") return clamp(numericValue || goal.years || 1, 1, 30);
    var step = goal.id === "emergency" ? 1000 : 5000;
    return Math.max(step, roundStep(numericValue || goal.targetAmount || step, step));
  }

  function syncGoalValueToQuestionnaire(goalId, field, value) {
    var tile = document.querySelector('#goalGrid .goal-tile[data-goal-id="' + goalId + '"]');
    if (!tile) return;
    var input = tile.querySelector('[data-goal-field="' + field + '"]');
    if (input) input.value = value;
  }

  function syncGoalSelectionToQuestionnaire(goalId, enabled) {
    var tile = document.querySelector('#goalGrid .goal-tile[data-goal-id="' + goalId + '"]');
    if (!tile) return;
    tile.classList.toggle("on", enabled);
    tile.dataset.goalEnabled = enabled ? "1" : "0";
  }

  function selectedGoalIdsFromPlan() {
    if (!S.plan) return [];
    if (S.plan.selectedGoalIds && S.plan.selectedGoalIds.length) return S.plan.selectedGoalIds.slice();
    return S.plan.goals.map(function (goal) { return goal.id; });
  }

  function readSelectedGoalIdsFromDom() {
    var tiles = Array.from(document.querySelectorAll("#goalGrid .goal-tile"));
    if (!tiles.length) return null;
    return tiles.filter(function (tile) {
      return tile.classList.contains("on");
    }).map(function (tile) {
      return tile.dataset.goalId;
    });
  }

  function updateScenarioGoal(goalId, field, rawValue) {
    if (!S.plan) return;
    var goal = (S.plan.goalSuggestions || S.plan.goals).find(function (entry) { return entry.id === goalId; });
    if (!goal) return;
    var nextValue = sanitizeGoalValue(goal, field, rawValue);

    goal[field] = nextValue;
    goal.displayValue = "€ " + currency(goal.targetAmount);
    goal.displayYears = "entro " + goal.years + " anni";

    syncGoalValueToQuestionnaire(goalId, field, nextValue);
    applyPlan(readProfileFromForm(), {
      selectedGoalIds: selectedGoalIdsFromPlan(),
      selectedCoverageIds: S.plan.selectedCoverageIds.slice(),
      keepSliderValues: true
    });
  }

  function toggleGoalSelection(goalId) {
    if (!S.plan) return;
    var selectedGoalIds = selectedGoalIdsFromPlan();
    var index = selectedGoalIds.indexOf(goalId);
    if (index >= 0) {
      if (selectedGoalIds.length === 1) return;
      selectedGoalIds.splice(index, 1);
    } else {
      selectedGoalIds.push(goalId);
    }

    syncGoalSelectionToQuestionnaire(goalId, selectedGoalIds.indexOf(goalId) >= 0);
    applyPlan(readProfileFromForm(), {
      selectedGoalIds: selectedGoalIds,
      selectedCoverageIds: S.plan.selectedCoverageIds.slice(),
      keepSliderValues: true
    });
  }

  function progressMarkup(label, current, target, toneClass, note) {
    var safeTarget = target || 1;
    var percentage = clamp(Math.round((current / safeTarget) * 100), 0, 100);
    return (
      '<div class="progress-row">' +
      '<div class="progress-head"><span>' + esc(label) + '</span><strong>' + percentage + '%</strong></div>' +
      '<div class="progress-track"><div class="progress-fill ' + (toneClass || "") + '" style="width:' + percentage + '%"></div></div>' +
      '<div class="progress-note">' + esc(note) + "</div>" +
      "</div>"
    );
  }

  function selectedProducts() {
    if (!S.plan) return [];
    return S.plan.recommendations.filter(function (recommendation) {
      return S.plan.selectedCoverageIds.indexOf(recommendation.id) >= 0;
    });
  }

  function isSelectedProduct(productId) {
    return !!(S.plan && S.plan.selectedCoverageIds.indexOf(productId) >= 0);
  }

  function relevantScenarioIds(activeScenario) {
    if (!activeScenario) return [];
    return activeScenario.scenarioIds && activeScenario.scenarioIds.length ? activeScenario.scenarioIds : [activeScenario.id];
  }

  function productMatchesScenario(product, activeScenario) {
    var scenarioIds = relevantScenarioIds(activeScenario);
    return scenarioIds.some(function (scenarioId) {
      return product.scenarioIds.indexOf(scenarioId) >= 0;
    });
  }

  function scenarioProducts(activeScenario) {
    if (!S.plan) return [];
    var recommendations = S.plan.recommendations.slice().sort(function (left, right) {
      var leftMatch = productMatchesScenario(left, activeScenario) ? 1 : 0;
      var rightMatch = productMatchesScenario(right, activeScenario) ? 1 : 0;
      if (rightMatch !== leftMatch) return rightMatch - leftMatch;
      var leftSelected = isSelectedProduct(left.id) ? 1 : 0;
      var rightSelected = isSelectedProduct(right.id) ? 1 : 0;
      if (rightSelected !== leftSelected) return rightSelected - leftSelected;
      return right.score - left.score;
    });

    var relevant = recommendations.filter(function (product) {
      return productMatchesScenario(product, activeScenario);
    });
    var selectedOther = recommendations.filter(function (product) {
      return !productMatchesScenario(product, activeScenario) && isSelectedProduct(product.id);
    });
    var fallback = recommendations.filter(function (product) {
      return !productMatchesScenario(product, activeScenario) && !isSelectedProduct(product.id);
    });

    return relevant.concat(selectedOther, fallback).slice(0, 4);
  }

  function scenarioEconomics(activeScenario) {
    var products = scenarioProducts(activeScenario);
    var relevantProducts = products.filter(function (product) {
      return productMatchesScenario(product, activeScenario);
    });
    var selectedRelevant = relevantProducts.filter(function (product) {
      return isSelectedProduct(product.id);
    });
    var suggestedPool = relevantProducts.length ? relevantProducts : products.slice(0, 3);
    var activePool = selectedRelevant.length ? selectedRelevant : [];
    var activePremium = roundStep(sumValues(activePool.map(function (product) { return product.monthlyPremium; })), 1);
    var activeSelfFund = Math.round(sumValues(activePool.map(function (product) { return product.selfFundMonthlyEquivalent; })));
    var suggestedPremium = roundStep(sumValues(suggestedPool.map(function (product) { return product.monthlyPremium; })), 1);
    var suggestedSelfFund = Math.round(sumValues(suggestedPool.map(function (product) { return product.selfFundMonthlyEquivalent; })));
    var annualTaxSaving = Math.round(sumValues(activePool.map(function (product) {
      return product.monthlyPremium * product.deductibleRate * 12;
    })));

    return {
      products: products,
      relevantProducts: relevantProducts,
      selectedRelevant: selectedRelevant,
      activePool: activePool,
      suggestedPool: suggestedPool,
      activePremium: activePremium,
      activeSelfFund: activeSelfFund,
      activeFreed: Math.max(0, activeSelfFund - activePremium),
      suggestedPremium: suggestedPremium,
      suggestedSelfFund: suggestedSelfFund,
      suggestedFreed: Math.max(0, suggestedSelfFund - suggestedPremium),
      annualTaxSaving: annualTaxSaving
    };
  }

  function scenarioCoverageReason(product, activeScenario) {
    var profile = S.plan.profile;
    var reasons = {
      tcm: profile.childrenCount || profile.spouseName
        ? "Tiene in piedi la sicurezza del nucleo se il reddito principale viene meno."
        : "Trasferisce un rischio grave senza usare il capitale destinato agli obiettivi.",
      income_protection: "Se il lavoro si ferma, evita di bruciare i risparmi per sostenere il tenore di vita.",
      accident: "Copre eventi accidentali che possono bloccare il lavoro e creare spese improvvise.",
      rc_family: profile.housingStatus !== "Affittuario"
        ? "Ha una casa: protegge immobile, danni a terzi e spese legali improvvise."
        : "Evita che un danno a terzi costringa a usare la liquidita del piano.",
      ltc: "Riduce l'impatto di assistenza di lungo periodo sul patrimonio familiare.",
      health: "Riduce esborsi medici straordinari che sottraggono risorse agli obiettivi.",
      mortgage: "Protegge la continuita del progetto casa se mutuo o reddito entrano in crisi."
    };

    if (product.id === "rc_family" && activeScenario && activeScenario.id === "home_damage") {
      return "E la copertura piu naturale se il cliente ha un immobile da proteggere da danni e responsabilita.";
    }
    if (product.id === "income_protection" && activeScenario && activeScenario.id === "income_stop") {
      return "Qui e la leva piu importante: il rischio vero non e la spesa, ma il blocco del reddito.";
    }
    if (product.id === "accident" && activeScenario && relevantScenarioIds(activeScenario).indexOf("ip") >= 0) {
      return "Rinforza la protezione sul rischio invalidita quando il cliente lavora molto sul proprio reddito.";
    }
    if (product.id === "tcm" && activeScenario && activeScenario.id === "death") {
      return "Serve a trasformare un evento irreversibile in capitale immediato per la famiglia.";
    }
    return reasons[product.id] || product.shortDescription || product.detail;
  }

  function joinReadableList(items) {
    var clean = (items || []).filter(Boolean);
    if (!clean.length) return "";
    if (clean.length === 1) return clean[0];
    if (clean.length === 2) return clean[0] + " e " + clean[1];
    return clean.slice(0, -1).join(", ") + " e " + clean[clean.length - 1];
  }

  function activeGoalNames(limit) {
    if (!S.plan || !S.plan.goals) return [];
    return S.plan.goals.slice(0, limit || 3).map(function (goal) {
      return goal.name;
    });
  }

  function productKnowledgeTerms(productId) {
    var map = {
      tcm: ["tcm", "temporanea caso morte", "famiglia"],
      income_protection: ["protezione reddito", "invalidita", "reddito"],
      accident: ["infortuni", "invalidita", "reddito"],
      rc_family: ["rc famiglia", "casa", "responsabilita"],
      ltc: ["ltc", "long term care", "non autosufficienza"],
      health: ["salute", "ricoveri", "spese mediche"],
      mortgage: ["mutuo", "casa", "reddito"]
    };
    return map[productId] || [];
  }

  function filterPolicyCitations(product, citations) {
    var list = Array.isArray(citations) ? citations.slice() : [];
    if (!list.length) return [];

    var terms = productKnowledgeTerms(product.id);
    var methodology = list.filter(function (citation) {
      return String((citation && citation.category) || "").toLowerCase() === "methodology";
    });
    var filtered = list.filter(function (citation) {
      var title = String((citation && citation.title) || "").toLowerCase();
      var category = String((citation && citation.category) || "").toLowerCase();
      if (category === "methodology") return true;
      return terms.some(function (term) { return title.indexOf(term) >= 0; });
    });

    if (filtered.length) return filtered.slice(0, 4);
    if (methodology.length) return methodology.slice(0, 1);
    return [];
  }

  function productPriorityNarrative(product) {
    if (product.score >= 60) return "e una leva prioritaria";
    if (product.score >= 45) return "e una copertura coerente";
    return "resta una copertura complementare";
  }

  function productRiskFocus(product) {
    var labels = {
      tcm: "l'assenza improvvisa del capitale familiare",
      income_protection: "il blocco del reddito per invalidita",
      accident: "lo stop lavorativo per infortunio",
      rc_family: "danni a terzi e imprevisti su casa o vita privata",
      ltc: "i costi di assistenza di lungo periodo",
      health: "spese mediche importanti e ricoveri",
      mortgage: "la continuita del progetto casa e del mutuo"
    };
    return labels[product.id] || "un rischio che puo erodere il piano";
  }

  function productReasons(product, profile, focusGoal) {
    var reasons = [];
    var goalNames = activeGoalNames(3);

    if (product.id === "tcm") {
      if (profile.childrenCount) reasons.push("ci sono " + profile.childrenCount + " figli da proteggere");
      if (profile.spouseName || profile.maritalStatus === "Coniugato" || profile.maritalStatus === "Convivente") reasons.push("il nucleo familiare puo dipendere dal reddito principale");
      if (profile.housingStatus === "Con mutuo") reasons.push("c'e un mutuo che non va lasciato scoperto");
      if (goalNames.length) reasons.push("obiettivi come " + joinReadableList(goalNames) + " non dovrebbero dipendere solo dal patrimonio accumulato");
    } else if (product.id === "income_protection") {
      if (profile.netMonthlyIncome) reasons.push("il piano dipende da un reddito netto mensile di € " + currency(profile.netMonthlyIncome));
      if (profile.occupationRisk === "alto") reasons.push("la professione ha una rischiosita alta");
      if (profile.childrenCount) reasons.push("il nucleo ha impegni familiari continuativi");
      if (goalNames.length) reasons.push("gli obiettivi di medio periodo richiedono continuita di risparmio");
    } else if (product.id === "accident") {
      if (profile.occupationRisk !== "basso") reasons.push("la professione espone a uno stop temporaneo piu rilevante");
      if (profile.netMonthlyIncome) reasons.push("un infortunio potrebbe fermare il flusso di reddito");
      if (goalNames.length) reasons.push("serve difendere il ritmo di accumulo sugli obiettivi");
    } else if (product.id === "rc_family") {
      if (profile.housingStatus !== "Affittuario") reasons.push("il cliente ha un immobile o un progetto casa da proteggere");
      if (profile.childrenCount) reasons.push("la vita familiare aumenta la possibilita di danni a terzi o eventi domestici");
      if (profile.totalAssets >= 60000) reasons.push("c'e un patrimonio che non conviene esporre a spese improvvise");
    } else if (product.id === "ltc") {
      if (profile.age >= 50) reasons.push("con l'eta cresce il rischio di erodere patrimonio per assistenza");
      if (focusGoal && focusGoal.id === "retirement") reasons.push("il tema previdenziale richiede protezione anche nella non autosufficienza");
      if (profile.totalAssets >= 80000) reasons.push("ha senso difendere capitale gia accumulato");
    } else if (product.id === "health") {
      if (profile.age >= 45) reasons.push("la probabilita di spese mediche importanti cresce con l'eta");
      if (profile.netMonthlyIncome) reasons.push("spese straordinarie potrebbero sottrarre risorse al piano");
      if (goalNames.length) reasons.push("il cliente ha obiettivi che richiedono stabilita di liquidita");
    } else if (product.id === "mortgage") {
      if (profile.housingStatus === "Con mutuo") reasons.push("c'e un mutuo che va tenuto in piedi anche sotto shock");
      if (profile.housingCost) reasons.push("la rata casa pesa gia sul cash flow mensile");
      if (focusGoal && focusGoal.id === "home") reasons.push("il progetto casa non dovrebbe saltare se il reddito si interrompe");
    }

    if (!reasons.length && goalNames.length) {
      reasons.push("serve proteggere obiettivi come " + joinReadableList(goalNames));
    }
    if (!reasons.length) {
      reasons.push("aiuta a non usare il capitale destinato agli obiettivi per assorbire un imprevisto");
    }

    return reasons.slice(0, 3);
  }

  function scenarioBlockForProduct(product, activeScenario, focusGoal) {
    if (!activeScenario) {
      return "Questa copertura protegge il piano sul rischio " + productRiskFocus(product) + ".";
    }

    var gapText = activeScenario.noCoverage.goalGap
      ? "puo aprire un gap di € " + currency(activeScenario.noCoverage.goalGap)
      : "non apre un gap immediato, ma indebolisce comunque il piano";
    var baseSentence = "Nello scenario attivo \"" + activeScenario.label + "\" il cliente senza copertura " + gapText + " su " + (focusGoal ? "\"" + focusGoal.name + "\"" : "questo obiettivo") + " e la probabilita scende al " + activeScenario.noCoverage.achievement + "%.";

    if (productMatchesScenario(product, activeScenario)) {
      return baseSentence + " Questa polizza interviene proprio sul punto di fragilita legato a " + productRiskFocus(product) + ".";
    }

    return baseSentence + " Anche se non e la leva piu diretta su questo scenario, resta utile per non lasciare scoperto " + productRiskFocus(product) + ".";
  }

  function economicBlockForProduct(product) {
    var lines = [];
    lines.push("Il motore stima un premio indicativo di " + premiumRangeLabel(product) + ".");
    if (product.detail) lines.push(product.detail + ".");
    if (product.secondaryDetail) lines.push(product.secondaryDetail + ".");
    lines.push("Senza copertura il cliente dovrebbe tenere circa € " + currency(product.selfFundMonthlyEquivalent) + "/mese di auto-cuscinetto sul rischio.");
    return lines.join(" ");
  }

  function buildPolicyInsightBlocks(product, activeScenario) {
    var profile = S.plan.profile;
    var focusGoal = S.analysis && S.analysis.focusGoal ? S.analysis.focusGoal : (S.plan.goals && S.plan.goals[0]);
    var headlineFacts = [];

    if (profile.name) headlineFacts.push(profile.name);
    if (profile.age) headlineFacts.push(profile.age + " anni");
    if (profile.childrenCount) headlineFacts.push(profile.childrenCount + " figli");
    if (profile.housingStatus) headlineFacts.push("casa " + profile.housingStatus.toLowerCase());
    if (profile.netMonthlyIncome) headlineFacts.push("reddito netto € " + currency(profile.netMonthlyIncome) + "/mese");
    var subject = headlineFacts.length ? joinReadableList(headlineFacts) : "questo cliente";

    return [
      {
        label: "Perche qui",
        body: "Per " + subject + ", " + product.name + " " + productPriorityNarrative(product) + " perche " + joinReadableList(productReasons(product, profile, focusGoal)) + "."
      },
      {
        label: "Che cosa protegge",
        body: scenarioBlockForProduct(product, activeScenario, focusGoal)
      },
      {
        label: "Lettura economica",
        body: economicBlockForProduct(product)
      }
    ];
  }

  function resetRagInsight() {
    S.ragInsight = null;
    renderRagInsightPanel();
  }

  function currentActiveScenario() {
    var collection = currentScenarioCollection();
    return collection ? collection[S.activeScenarioId] : null;
  }

  function ragProfileSummary() {
    if (!S.plan) return "";
    var profile = S.plan.profile;
    var parts = [];

    if (profile.name) parts.push(profile.name);
    if (profile.age) parts.push(profile.age + " anni");
    if (profile.housingStatus) parts.push("stato casa " + profile.housingStatus.toLowerCase());
    if (profile.childrenCount) parts.push(profile.childrenCount + " figli");
    if (profile.netMonthlyIncome) parts.push("reddito netto mensile € " + currency(profile.netMonthlyIncome));
    else if (profile.grossAnnualIncome) parts.push("reddito annuo lordo € " + currency(profile.grossAnnualIncome));
    if (profile.totalAssets) parts.push("patrimonio € " + currency(profile.totalAssets));

    return parts.join(", ");
  }

  function chatProfileSummary(profile) {
    var current = profile || {};
    var parts = [];
    var explicitGoals = (current.goals || []).filter(function (goal) {
      return goal && goal.id;
    });

    if (current.name) parts.push(current.name);
    if (current.age) parts.push(current.age + " anni");
    if (current.profession) parts.push(current.profession.toLowerCase());
    if (current.maritalStatus) parts.push(current.maritalStatus.toLowerCase());
    if (current.childrenCount) parts.push(current.childrenCount + " figli");
    if (current.residenceCity) parts.push("residenza " + current.residenceCity);
    if (current.housingStatus) parts.push("casa " + current.housingStatus.toLowerCase());
    if (current.netMonthlyIncome) parts.push("reddito mensile € " + currency(current.netMonthlyIncome));
    else if (current.grossAnnualIncome) parts.push("reddito annuo € " + currency(current.grossAnnualIncome));
    if (current.totalAssets) parts.push("patrimonio € " + currency(current.totalAssets));
    if (current.monthlySavings) parts.push("risparmio € " + currency(current.monthlySavings) + "/mese");
    if (explicitGoals.length) {
      var goalNames = {
        retirement: "pensione integrativa",
        home: "acquisto casa",
        education: "fondo studi figli",
        emergency: "fondo emergenze",
        wealth: "risparmio obiettivo"
      };
      parts.push("obiettivi " + explicitGoals.slice(0, 3).map(function (goal) {
        return goal.name ? String(goal.name).toLowerCase() : (goalNames[goal.id] || goal.id);
      }).join(", "));
    }

    return parts.join(" · ");
  }

  function chatMissingFieldLabels(profile) {
    var current = profile || {};
    var labels = [];
    if (!current.age) labels.push("eta");
    if (!current.grossAnnualIncome && !current.netMonthlyIncome) labels.push("reddito");
    if (!current.monthlySavings && !current.totalAssets) labels.push("risparmio o patrimonio");
    if (!current.profession) labels.push("professione");
    if (!current.housingStatus) labels.push("situazione abitativa");
    if (!(current.goals || []).length) labels.push("obiettivi");
    return labels.slice(0, 4);
  }

  function chatRetrievalHint(profile) {
    var current = profile || {};
    var goalNames = {
      retirement: "pensione integrativa",
      home: "acquisto casa",
      education: "fondo studi figli",
      emergency: "fondo emergenze",
      wealth: "risparmio obiettivo"
    };
    var hints = [];

    if (current.residenceCity) hints.push(current.residenceCity);
    if (current.housingStatus) hints.push("situazione abitativa " + current.housingStatus.toLowerCase());
    if (current.childrenCount) hints.push(current.childrenCount + " figli");
    if ((current.goals || []).length) {
      hints.push("obiettivi " + current.goals.slice(0, 3).map(function (goal) {
        return goal.name ? String(goal.name).toLowerCase() : (goalNames[goal.id] || goal.id);
      }).join(", "));
    }

    return hints.join(" · ");
  }

  function shouldRequestChatRag(profile, text) {
    var normalized = String(text || "").trim();
    if (normalized.length < 12) return false;
    if (!profileSignalCount(profile)) return false;
    return !!(
      profile.residenceCity ||
      profile.housingStatus ||
      (profile.goals || []).length ||
      profile.childrenCount ||
      /casa|mutuo|universita|studi|figli|pensione|emergenz|milano|roma|torino|bari|palermo|bologna|napoli/i.test(normalized)
    );
  }

  function ragQuestionForProduct(product, activeScenario) {
    var focusGoal = S.analysis && S.analysis.focusGoal ? S.analysis.focusGoal : featuredGoal(S.plan.goals);
    var profileSummary = ragProfileSummary();
    var scenarioLabel = activeScenario ? activeScenario.label : "scenario principale";
    return (
      "Spiega in italiano, per un consulente assicurativo, perche per il cliente " +
      profileSummary +
      " ha senso valutare la copertura " +
      product.name +
      ". " +
      "Resta focalizzato sull'obiettivo " +
      (focusGoal ? focusGoal.name : "principale") +
      " e sullo scenario " +
      scenarioLabel +
      ". " +
      "Usa solo il contesto davvero rilevante e non allargarti su polizze non pertinenti."
    );
  }

  async function requestRag(payload, endpoint, timeoutMs) {
    if (typeof root.fetch !== "function") {
      throw new Error("Fetch non disponibile in questo browser");
    }

    var controller = typeof root.AbortController === "function" ? new root.AbortController() : null;
    var timeoutId = controller ? root.setTimeout(function () { controller.abort(); }, timeoutMs || RAG_TIMEOUT_MS) : 0;

    try {
      var response = await root.fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload || {}),
        signal: controller ? controller.signal : undefined
      });

      if (timeoutId) root.clearTimeout(timeoutId);
      if (!response.ok) throw new Error("Il servizio RAG non ha risposto correttamente");
      return await response.json();
    } catch (error) {
      if (timeoutId) root.clearTimeout(timeoutId);
      throw error;
    }
  }

  async function requestRagExplanation(question) {
    return requestRag(question, RAG_QUERY_ENDPOINT, RAG_TIMEOUT_MS);
  }

  async function requestChatRagInsight(profile, text) {
    return requestRag({
      note: String(text || "").trim(),
      profileSummary: chatProfileSummary(profile),
      retrievalHint: chatRetrievalHint(profile),
      missingFields: chatMissingFieldLabels(profile),
      topK: 5
    }, RAG_INTAKE_ENDPOINT, RAG_INTAKE_TIMEOUT_MS);
  }

  function hasChatRagContent(insight) {
    return !!(insight && (insight.summary || insight.benchmark || insight.nextQuestion));
  }

  function intakeCitationsMarkup(citations, limit) {
    var list = (citations || []).slice(0, limit || 3);
    if (!list.length) return "";
    return (
      '<div class="intake-citations">' +
      list.map(function (citation) {
        return '<span class="intake-citation">[' + esc(citation.ref) + "] " + esc(citation.title) + "</span>";
      }).join("") +
      "</div>"
    );
  }

  function chatRagMessageMarkup(insight) {
    return (
      '<div class="chat-rag-card">' +
      '<div class="chat-rag-ey">Contesto benchmark</div>' +
      '<div class="chat-rag-title">' + esc(insight.summary || "Lettura rapida del caso") + "</div>" +
      (insight.benchmark ? '<div class="chat-rag-body">' + esc(insight.benchmark) + "</div>" : "") +
      (insight.nextQuestion ? '<div class="chat-rag-follow">Domanda utile: ' + esc(insight.nextQuestion) + "</div>" : "") +
      intakeCitationsMarkup(insight.citations, 3) +
      "</div>"
    );
  }

  function renderPage2IntakeInsight() {
    var panel = byId("page2IntakeInsight");
    if (!panel) return;
    if (!hasChatRagContent(S.chatRagInsight)) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }

    panel.hidden = false;
    panel.innerHTML =
      '<div class="intake-band-ey">Insight emerso dagli appunti</div>' +
      '<div class="intake-band-head"><div><div class="intake-band-title">' + esc(S.chatRagInsight.summary || "Lettura iniziale del caso") + '</div><div class="intake-band-copy">' + esc(S.chatRagInsight.benchmark || "Ho recuperato benchmark e contesto utili dal knowledge base per dare profondita alla conversazione iniziale.") + '</div></div><div class="intake-band-pill">RAG</div></div>' +
      (S.chatRagInsight.nextQuestion
        ? '<div class="intake-band-question">Prossima domanda utile: <strong>' + esc(S.chatRagInsight.nextQuestion) + '</strong></div>'
        : "") +
      intakeCitationsMarkup(S.chatRagInsight.citations, 3);
  }

  function renderRagInsightPanel() {
    var panel = byId("ragInsightPanel");
    if (!panel) return;

    var insight = S.ragInsight;
    if (!insight) {
      panel.hidden = true;
      panel.innerHTML = "";
      return;
    }

    panel.hidden = false;

    if (insight.status === "loading") {
      panel.innerHTML =
        '<div class="rag-panel-ey">RAG consulenziale</div>' +
        '<div class="rag-panel-head"><div><div class="rag-panel-title">Sto preparando la spiegazione per ' + esc(insight.productName) + '</div><div class="rag-panel-sub">Recupero i contenuti piu rilevanti dal knowledge base assicurativo e li traduco in linguaggio consulenziale.</div></div><div class="rag-panel-pill">In elaborazione</div></div>';
      return;
    }

    if (insight.status === "error") {
      panel.innerHTML =
        '<div class="rag-panel-ey">Lettura consulenziale</div>' +
        '<div class="rag-panel-head"><div><div class="rag-panel-title">Non sono riuscito a generare la spiegazione</div><div class="rag-panel-sub">' + esc(insight.message || "Il servizio RAG non ha risposto in tempo utile.") + '</div></div><div class="rag-panel-pill error">Riprova</div></div>';
      return;
    }

    panel.innerHTML =
      '<div class="rag-panel-ey">Lettura consulenziale</div>' +
      '<div class="rag-panel-head"><div><div class="rag-panel-title">Perche ' + esc(insight.productName) + ' e coerente con questo caso</div><div class="rag-panel-sub">Sintesi guidata dal profilo cliente e dal motore assicurativo, con fonti del knowledge base usate come supporto.</div></div><div class="rag-panel-pill">' + esc((insight.citations || []).length ? "Fonti " + (insight.citations || []).length : "Profilo + motore") + '</div></div>' +
      '<div class="rag-panel-grid">' +
      (insight.blocks || []).map(function (block) {
        return '<div class="rag-panel-card"><div class="rag-panel-card-k">' + esc(block.label) + '</div><div class="rag-panel-card-v">' + esc(block.body) + '</div></div>';
      }).join("") +
      '</div>' +
      ((insight.citations || []).length
        ? '<div class="rag-citations">' + insight.citations.slice(0, 4).map(function (citation) {
            return '<span class="rag-citation">[' + esc(citation.ref) + '] ' + esc(citation.title) + '</span>';
          }).join("") + '</div>'
        : "");

    if (typeof panel.scrollIntoView === "function") {
      root.setTimeout(function () {
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 30);
    }
  }

  async function explainPolicyWithRag(productId) {
    if (!S.plan) return;
    var product = S.plan.recommendations.find(function (entry) { return entry.id === productId; });
    if (!product) return;

    var activeScenario = currentActiveScenario();
    var focusGoal = S.analysis && S.analysis.focusGoal ? S.analysis.focusGoal : (S.plan.goals && S.plan.goals[0]);
    var turnId = ++S.ragTurnId;
    S.ragInsight = {
      status: "loading",
      productId: product.id,
      productName: product.name,
      scenarioId: activeScenario ? activeScenario.id : null
    };
    renderRagInsightPanel();
    renderPolicyBoard(activeScenario);

    try {
      var result = await requestRagExplanation({
        question: ragQuestionForProduct(product, activeScenario),
        audience: "advisor",
        topK: 4,
        productId: product.id,
        profileSummary: ragProfileSummary(),
        goalName: focusGoal ? focusGoal.name : "",
        scenarioLabel: activeScenario ? activeScenario.label : "",
        scenarioIds: activeScenario ? relevantScenarioIds(activeScenario) : []
      });
      if (turnId !== S.ragTurnId) return;

      S.ragInsight = {
        status: "ready",
        productId: product.id,
        productName: product.name,
        scenarioId: activeScenario ? activeScenario.id : null,
        blocks: buildPolicyInsightBlocks(product, activeScenario),
        citations: filterPolicyCitations(product, result && result.citations ? result.citations : [])
      };
    } catch (error) {
      if (turnId !== S.ragTurnId) return;
      S.ragInsight = {
        status: "error",
        productId: product.id,
        productName: product.name,
        scenarioId: activeScenario ? activeScenario.id : null,
        message: error && error.name === "AbortError"
          ? "Il servizio RAG ha impiegato troppo tempo. Riprova tra poco."
          : "Il servizio RAG non e disponibile in questo momento."
      };
    }

    renderRagInsightPanel();
    renderPolicyBoard(currentActiveScenario());
  }

  function scenarioCollectionForMode(analysis, mode) {
    if (!analysis) return {};
    return mode === "bundle" ? analysis.bundles || {} : analysis.scenarios || {};
  }

  function scenarioOrderForMode(analysis, mode) {
    if (!analysis) return [];
    return mode === "bundle" ? analysis.bundleOrder || [] : analysis.scenarioOrder || [];
  }

  function scenarioPriorityScore(scenario) {
    var gapWeight = scenario.noCoverage.goalGap;
    var probabilityWeight = Math.max(0, scenario.withCoverage.achievement - scenario.noCoverage.achievement) * 1200;
    var delayWeight = Math.round(scenario.noCoverage.delayYears * 9000);
    return gapWeight + probabilityWeight + delayWeight + (scenario.totalLossValue || 0) * 0.03;
  }

  function pickPriorityScenarioId(analysis, mode) {
    if (!analysis) return null;
    var scenarios = Object.values(scenarioCollectionForMode(analysis, mode));
    scenarios.sort(function (left, right) {
      return scenarioPriorityScore(right) - scenarioPriorityScore(left);
    });
    return scenarios.length ? scenarios[0].id : null;
  }

  function currentScenarioCollection() {
    return scenarioCollectionForMode(S.analysis, S.activeScenarioMode);
  }

  function currentScenarioOrder() {
    return scenarioOrderForMode(S.analysis, S.activeScenarioMode);
  }

  function destroyChart(id) {
    if (S.ch[id]) {
      S.ch[id].destroy();
      delete S.ch[id];
    }
  }

  function goTo(pageNumber) {
    if (pageNumber === 3 && !S.plan) {
      pageNumber = S.draftProfile ? 2 : 1;
    }
    for (var i = 1; i <= 3; i += 1) {
      var page = byId("p" + i);
      var navItem = byId("n" + i);
      if (!page || !navItem) continue;
      page.classList.toggle("on", i === pageNumber);
      navItem.className = "ns" + (i === pageNumber ? " on" : i < pageNumber ? " dn" : "");
      navItem.querySelector(".nn").textContent = i < pageNumber ? "✓" : i;
    }
    S.page = pageNumber;
    root.scrollTo(0, 0);
    if (pageNumber === 2) renderPage2Mode();
    if (pageNumber === 3) refreshScenarioAnalysis();
  }

  function autoH(element) {
    element.style.height = "auto";
    element.style.height = Math.min(element.scrollHeight, 100) + "px";
  }

  function hKey(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMsg();
    }
  }

  function qS(text) {
    byId("chatInput").value = text;
    sendMsg();
  }

  function addM(role, text) {
    var chat = byId("chatMsgs");
    var node = document.createElement("div");
    node.className = "msg " + role;
    node.innerHTML = '<div class="mav">' + (role === "ai" ? "🤖" : "👤") + '</div><div class="mb">' + String(text || "").replace(/\n/g, "<br>") + "</div>";
    chat.appendChild(node);
    chat.scrollTop = chat.scrollHeight;
  }

  function renderWelcomeChat() {
    var chat = byId("chatMsgs");
    if (!chat) return;
    chat.innerHTML =
      '<div class="msg ai">' +
      '<div class="mav">🤖</div>' +
      '<div class="mb">' + esc(INITIAL_ASSISTANT_MESSAGE) + "</div>" +
      "</div>";
    byId("qchips").style.display = "flex";
  }

  function resetRenderedState() {
    [
      "profileSummary",
      "advisorNarrative",
      "financeSnapshot",
      "goalGrid",
      "coverageTableBody",
      "goalFocusGrid",
      "goalGaugeGrid",
      "coverageSummaryBand",
      "policySuggestedGrid",
      "policyOptionalGrid",
      "impactStage",
      "scenarioModeTabs",
      "bundleGrid",
      "eventGrid",
      "benefitBars",
      "valueNarrative",
      "printSheet"
    ].forEach(function (id) {
      var node = byId(id);
      if (node) node.innerHTML = "";
    });

    [
      "premV",
      "premS",
      "taxV",
      "liqV",
      "policySuggestedBadge",
      "policyOptionalBadge",
      "p3ClientName",
      "p3GoalName",
      "at",
      "ad",
      "vP",
      "vR",
      "vA",
      "mNP",
      "mYP",
      "mND",
      "mYD",
      "mNPct",
      "mYPct",
      "gapNoV",
      "gapYesV",
      "delayNoV",
      "delayYesV"
    ].forEach(function (id) {
      var node = byId(id);
      if (node) node.textContent = "";
    });

    [
      ["fNome", ""],
      ["fDOB", ""],
      ["fEta", ""],
      ["fSt", "Single"],
      ["fSpouseName", ""],
      ["fSpouseAge", ""],
      ["fFi", ""],
      ["fChildrenAges", ""],
      ["fProfession", ""],
      ["fR", ""],
      ["fRnet", ""],
      ["fRi", ""],
      ["fPat", ""],
      ["fLiqu", ""],
      ["fInv", ""],
      ["fAb", "Affittuario"],
      ["fHomeCost", ""],
      ["fFixed", ""]
    ].forEach(function (entry) {
      var node = byId(entry[0]);
      if (node) node.value = entry[1];
    });

    ["slP", "slR", "slA"].forEach(function (id) {
      var node = byId(id);
      if (!node) return;
      node.value = node.defaultValue || node.value;
    });

    Object.keys(S.ch).forEach(function (chartId) {
      destroyChart(chartId);
    });
  }

  function resetClientWorkspace(preserveChat) {
    S.draftProfile = null;
    S.plan = null;
    S.analysis = null;
    S.page2AnalysisVisible = false;
    S.activeGoalId = null;
    S.activeScenarioId = "rc";
    S.activeScenarioMode = "bundle";
    S.coverageTouched = false;
    S.ragInsight = null;
    S.chatRagInsight = null;
    resetRenderedState();
    renderPage2IntakeInsight();
    if (!preserveChat) renderWelcomeChat();
  }

  function looksLikeFreshClientIntro(text) {
    var trimmed = String(text || "").trim();
    var normalized = trimmed.toLowerCase();
    var startsWithFullName = /^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’\-]+\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’\-]+/.test(trimmed);
    var hasIdentityBlock = /profilo completo|nuovo cliente|cliente nuovo|nome e cognome|cliente:/i.test(trimmed);
    var hasDemographicSignal = /\b\d{2}\s*anni\b/i.test(trimmed);
    var hasFinancialSignal = /ral|reddito|patrimonio|risparm|stipendio|obiettiv/i.test(normalized);
    return hasIdentityBlock || (startsWithFullName && (hasDemographicSignal || hasFinancialSignal));
  }

  function profileSignalCount(profile) {
    var count = 0;
    if (profile.name && profile.name !== "Cliente") count += 1;
    if (profile.age) count += 1;
    if (profile.spouseName || profile.childrenCount) count += 1;
    if (profile.grossAnnualIncome || profile.netMonthlyIncome) count += 1;
    if (profile.totalAssets || profile.monthlySavings) count += 1;
    if ((profile.goals || []).length) count += 1;
    return count;
  }

  function shouldOpenProfile(reply, profile, text) {
    var signals = profileSignalCount(profile);
    if (profile.name && profile.name !== "Cliente") return true;
    if (reply.ready) return true;
    if (signals >= 2) return true;
    if (signals >= 1 && String(text || "").trim().length >= 3) return true;
    return false;
  }

  function renderPage2Mode() {
    var intro = byId("page2AnalysisIntro");
    var coverageCard = byId("page2CoverageCard");
    var title = byId("p2Title");
    var subtitle = byId("p2Subtitle");
    var topCta = byId("p2TopCta");
    var bottomCta = byId("p2BottomCta");
    var analysisVisible = false;
    if (!intro || !coverageCard || !title || !subtitle || !topCta || !bottomCta) return;

    intro.classList.add("phase-hidden");
    coverageCard.classList.add("phase-hidden");
    title.textContent = "Compila o verifica il questionario";
    subtitle.textContent = "Completa solo i dati essenziali e poi vai subito alla simulazione scenari.";
    topCta.textContent = "Simula scenari →";
    bottomCta.textContent = "Simula scenari →";
    renderPage2IntakeInsight();
  }

  function showTyp() {
    remTyp();
    var chat = byId("chatMsgs");
    var node = document.createElement("div");
    node.className = "msg ai";
    node.id = "typ";
    node.innerHTML = '<div class="mav">🤖</div><div class="mb"><div class="typing"><div class="td2"></div><div class="td2"></div><div class="td2"></div></div></div>';
    chat.appendChild(node);
    chat.scrollTop = chat.scrollHeight;
  }

  function remTyp() {
    var typingNode = byId("typ");
    if (typingNode) typingNode.remove();
  }

  async function processChatTurn(text, shouldStartFreshClient, turnId) {
    try {
      var baseProfile = shouldStartFreshClient ? FamilyAdvisorEngine.createEmptyProfile() : (S.draftProfile || FamilyAdvisorEngine.createEmptyProfile());
      var mergedProfile = FamilyAdvisorEngine.mergeChatInput(baseProfile, text);

      if (turnId !== S.pendingTurnId) return;

      var reply = FamilyAdvisorEngine.buildAdvisorReply(mergedProfile);
      var canOpenProfile = shouldOpenProfile(reply, mergedProfile, text);
      var chatRagInsight = null;

      S.draftProfile = mergedProfile;
      remTyp();
      addM("ai", reply.message);

      if (shouldRequestChatRag(mergedProfile, text)) {
        try {
          chatRagInsight = await requestChatRagInsight(mergedProfile, text);
        } catch (error) {
          chatRagInsight = null;
        }

        if (turnId !== S.pendingTurnId) return;

        if (hasChatRagContent(chatRagInsight)) {
          S.chatRagInsight = chatRagInsight;
          addM("ai", chatRagMessageMarkup(chatRagInsight));
          renderPage2IntakeInsight();
        }
      }

      if (canOpenProfile) {
        S.page2AnalysisVisible = false;
        fillFormFromProfile(mergedProfile);
        renderPage2IntakeInsight();
        root.setTimeout(function () {
          addM("ai", "✅ Apro il questionario essenziale: completa i dati e poi passiamo subito agli scenari.");
          root.setTimeout(function () {
            goTo(2);
          }, 350);
        }, 500);
      }
    } catch (error) {
      if (turnId !== S.pendingTurnId) return;
      remTyp();
      addM("ai", "C'e stato un problema nel rileggere il messaggio. Riprova pure: tengo comunque attivo il parser locale.");
    }
  }

  function sendMsg() {
    var input = byId("chatInput");
    var text = input.value.trim();
    if (!text) return;
    var shouldStartFreshClient = !!S.draftProfile && S.page === 1 && looksLikeFreshClientIntro(text);

    if (shouldStartFreshClient) {
      resetClientWorkspace(true);
      renderWelcomeChat();
    }

    input.value = "";
    input.style.height = "auto";
    addM("u", text);
    byId("qchips").style.display = "none";
    showTyp();
    S.pendingTurnId += 1;
    var turnId = S.pendingTurnId;

    root.setTimeout(function () {
      processChatTurn(text, shouldStartFreshClient, turnId);
    }, 260);
  }

  function toggleMic() {
    var button = byId("micBtn");
    if (!S.list) {
      if (!("webkitSpeechRecognition" in root) && !("SpeechRecognition" in root)) {
        addM("ai", "⚠️ Il riconoscimento vocale richiede un browser compatibile come Chrome.");
        return;
      }
      var Recognition = root.SpeechRecognition || root.webkitSpeechRecognition;
      S.rec = new Recognition();
      S.rec.lang = "it-IT";
      S.rec.continuous = false;
      S.rec.interimResults = false;
      S.rec.onresult = function (event) {
        byId("chatInput").value = event.results[0][0].transcript;
        toggleMic();
        sendMsg();
      };
      S.rec.onerror = function () {
        toggleMic();
      };
      S.rec.start();
      S.list = true;
      button.classList.add("rec");
      button.textContent = "⏹";
      return;
    }

    S.rec && S.rec.stop();
    S.list = false;
    button.classList.remove("rec");
    button.textContent = "🎤";
  }

  function parseChildrenAges(value) {
    var matches = String(value || "").match(/\d{1,2}/g) || [];
    return matches.map(function (entry) {
      return parseInt(entry, 10);
    });
  }

  function computeAgeFromDob(value) {
    if (!value) return 0;
    var birthDate = new Date(value);
    var today = new Date();
    var age = today.getFullYear() - birthDate.getFullYear();
    var monthDifference = today.getMonth() - birthDate.getMonth();
    if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
      age -= 1;
    }
    return age;
  }

  function readGoalsFromDom() {
    return Array.from(document.querySelectorAll("#goalGrid .goal-tile")).map(function (tile) {
      var goalId = tile.dataset.goalId;
      var targetAmount = parseInt(tile.querySelector('[data-goal-field="targetAmount"]').value, 10) || 0;
      var years = parseInt(tile.querySelector('[data-goal-field="years"]').value, 10) || 1;
      return {
        id: goalId,
        targetAmount: targetAmount,
        years: years,
        enabled: tile.classList.contains("on"),
        source: "manual"
      };
    });
  }

  function readProfileFromForm() {
    var existingProfile = (S.plan && S.plan.profile) || S.draftProfile || {};
    var birthDate = byId("fDOB").value;
    var age = parseInt(byId("fEta").value, 10) || computeAgeFromDob(birthDate) || 0;
    var totalAssets = parseInt(byId("fPat").value, 10) || 0;
    var netMonthlyIncome = parseInt(byId("fRnet").value, 10) || 0;
    var domGoals = readGoalsFromDom();
    var fallbackGoals =
      (S.plan && (S.plan.goalSuggestions || S.plan.goals)) ||
      (S.draftProfile && S.draftProfile.goals) ||
      [];

    return FamilyAdvisorEngine.finalizeProfile({
      name: byId("fNome").value.trim(),
      birthDate: birthDate,
      age: age,
      maritalStatus: byId("fSt").value,
      spouseName: byId("fSt").value === "Sposato" || byId("fSt").value === "Convivente" ? "Partner" : "",
      spouseAge: 0,
      childrenCount: parseInt(byId("fFi").value, 10) || 0,
      childrenAges: [],
      profession: byId("fProfession").value.trim(),
      grossAnnualIncome: parseInt(byId("fR").value, 10) || 0,
      netMonthlyIncome: netMonthlyIncome,
      monthlySavings: parseInt(byId("fRi").value, 10) || 0,
      totalAssets: totalAssets,
      liquidAssets: parseInt(byId("fLiqu").value, 10) || 0,
      investedAssets: parseInt(byId("fInv").value, 10) || 0,
      residenceCity: existingProfile.residenceCity || "",
      housingStatus: byId("fAb").value,
      housingCost: parseInt(byId("fHomeCost").value, 10) || 0,
      fixedExpenses: parseInt(byId("fFixed").value, 10) || 0,
      goals: domGoals.length ? domGoals : fallbackGoals,
      existingCoverageIds: S.plan ? S.plan.profile.existingCoverageIds : [],
      notes: existingProfile.notes || "",
      riskProfileId: existingProfile.riskProfileId || "bilanciato"
    }, { applyDefaults: false });
  }

  function fieldValue(value) {
    return value ? String(value) : "";
  }

  function fillFormFromProfile(profile) {
    if (!profile) return;
    S.isRendering = true;
    byId("fNome").value = profile.name || "";
    byId("fDOB").value = profile.birthDate || "";
    byId("fEta").value = fieldValue(profile.age);
    byId("fSt").value = profile.maritalStatus || "";
    byId("fSpouseName").value = profile.spouseName || "";
    byId("fSpouseAge").value = fieldValue(profile.spouseAge);
    byId("fFi").value = fieldValue(profile.childrenCount);
    byId("fChildrenAges").value = (profile.childrenAges || []).join(", ");
    byId("fProfession").value = profile.profession || "";
    byId("fR").value = fieldValue(profile.grossAnnualIncome);
    byId("fRnet").value = fieldValue(profile.netMonthlyIncome);
    byId("fRi").value = fieldValue(profile.monthlySavings);
    byId("fPat").value = fieldValue(profile.totalAssets);
    byId("fLiqu").value = fieldValue(profile.liquidAssets);
    byId("fInv").value = fieldValue(profile.investedAssets);
    byId("fAb").value = profile.housingStatus || "";
    byId("fHomeCost").value = fieldValue(profile.housingCost);
    byId("fFixed").value = fieldValue(profile.fixedExpenses);

    S.isRendering = false;
  }

  function renderProfileSummary() {
    if (!S.plan) return;
    var summaryEl = byId("profileSummary");
    var narrativeEl = byId("advisorNarrative");
    var financeEl = byId("financeSnapshot");
    if (!summaryEl || !narrativeEl || !financeEl) return;

    var profile = S.plan.profile;
    var snapshot = S.plan.snapshot;
    var recommendations = selectedProducts();
    var primaryGoal = featuredGoal(S.plan.goals);
    var secondaryGoal = S.plan.goals.find(function (goal) {
      return goal.id !== "emergency" && goal.id !== primaryGoal.id;
    });
    var emergencyGoal = S.plan.goals.find(function (goal) { return goal.id === "emergency"; });
    var homeGoal = S.plan.goals.find(function (goal) { return goal.id === "home"; });
    var familyLabel = profile.childrenCount
      ? profile.maritalStatus + " · " + profile.childrenCount + " figli"
      : profile.maritalStatus;
    var savingsRate = profile.netMonthlyIncome ? Math.round((profile.monthlySavings / profile.netMonthlyIncome) * 100) : 0;
    var coreBurn = householdCoreBurn(profile);
    var freeCash = Math.max(0, profile.netMonthlyIncome - coreBurn);
    var bufferMonths = coreBurn ? (profile.liquidAssets / coreBurn) : 0;
    var insuredGap = Math.max(S.plan.needs.deathCapital, S.plan.needs.invalidityCapital);
    var packageList = recommendations.length
      ? recommendations.slice(0, 3).map(function (product) {
          return (
            '<div class="phero-list-item">' +
            '<div class="phero-list-name">' + esc(shortProductLabel(product)) + '</div>' +
            '<div class="phero-list-pill">€ ' + esc(product.monthlyPremium) + '/mese</div>' +
            "</div>"
          );
        }).join("")
      : '<div class="phero-list-item"><div class="phero-list-name">Nessuna copertura attiva</div><div class="phero-list-pill">Da impostare</div></div>';
    var talkTrack =
      "Questo cliente ha una buona base di partenza, ma oggi la continuita del piano dipende troppo dal patrimonio attuale. " +
      "La priorita e proteggere " + primaryGoal.name.toLowerCase() + " con poche leve ad alta percezione di valore.";

    summaryEl.innerHTML =
      '<div class="phero">' +
      '<div>' +
      '<div class="phero-ey">Scheda pronta per il colloquio</div>' +
      '<div class="phero-title">' + esc(profile.name) + '</div>' +
      '<div class="phero-copy">' + esc(S.plan.segment.description) + ' La lettura e stata semplificata per una conversazione commerciale chiara, con pochi numeri e priorita immediate.</div>' +
      '<div class="phero-tags">' +
      '<div class="phero-tag">' + esc(profile.age + " anni") + "</div>" +
      '<div class="phero-tag">' + esc(profile.profession) + "</div>" +
      '<div class="phero-tag">' + esc(familyLabel) + "</div>" +
      '<div class="phero-tag">' + esc(profile.housingStatus) + "</div>" +
      '</div>' +
      '<div class="phero-metrics">' +
      '<div class="phero-metric"><div class="phero-k">Patrimonio oggi</div><div class="phero-v">€ ' + esc(currency(profile.totalAssets)) + '</div><div class="phero-s">Liquidita € ' + esc(currency(profile.liquidAssets)) + '</div></div>' +
      '<div class="phero-metric"><div class="phero-k">Risparmio mensile</div><div class="phero-v">€ ' + esc(currency(profile.monthlySavings)) + '</div><div class="phero-s">' + esc(savingsRate + "% del reddito netto") + '</div></div>' +
      '<div class="phero-metric"><div class="phero-k">Obiettivo vicino</div><div class="phero-v">' + esc(primaryGoal.name) + '</div><div class="phero-s">' + esc(primaryGoal.displayYears) + '</div></div>' +
      "</div>" +
      "</div>" +
      '<div class="phero-side">' +
      '<div class="phero-side-lbl">Pacchetto consigliato oggi</div>' +
      '<div class="phero-side-title">' + esc(snapshot.selectedCount + " mosse prioritarie per proteggere piano e patrimonio") + '</div>' +
      '<div class="phero-list">' + packageList + '</div>' +
      '<div class="phero-foot">Premio attivo <strong>€ ' + esc(snapshot.totalPremium) + '/mese</strong> · recupero fiscale stimato <strong>€ ' + esc(snapshot.annualTaxSaving) + '/anno</strong> · liquidita liberata <strong>€ ' + esc(snapshot.liquidityFreed) + '/mese</strong>.</div>' +
      "</div>" +
      "</div>";

    narrativeEl.innerHTML =
      '<div class="fcard-title"><div class="fcard-icon" style="background:#eef5ff">🗣️</div>Parlato consulente</div>' +
      '<div class="story-script">"' + esc(talkTrack) + '"</div>' +
      '<div class="story-list">' +
      '<div class="story-item"><div class="story-k">Priorita adesso</div><div class="story-m">' + esc(primaryGoal.name) + '</div><div class="story-s">' + esc("E il tema piu sensibile da proteggere subito. Subito dopo viene " + (secondaryGoal ? secondaryGoal.name.toLowerCase() : "la continuita del piano") + ".") + '</div></div>' +
      '<div class="story-item"><div class="story-k">Punto forte</div><div class="story-m">Risparmia € ' + esc(currency(profile.monthlySavings)) + '/mese</div><div class="story-s">' + esc("La base di partenza e buona: il cliente ha capacita di risparmio e un patrimonio gia costruito.") + '</div></div>' +
      '<div class="story-item"><div class="story-k">Fragilita da spiegare bene</div><div class="story-m">Gap potenziale € ' + esc(currency(insuredGap)) + '</div><div class="story-s">' + esc("Se il reddito o la stabilita familiare vengono colpiti, il piano rischia di fermarsi prima di arrivare agli obiettivi.") + '</div></div>' +
      "</div>";

    financeEl.innerHTML =
      '<div class="fcard-title"><div class="fcard-icon" style="background:#fff7e6">💡</div>Cruscotto economico semplice</div>' +
      '<div class="finance-grid">' +
      '<div class="finance-tile"><div class="finance-k">Netto mensile</div><div class="finance-v">€ ' + esc(currency(profile.netMonthlyIncome)) + '</div><div class="finance-s">Reddito disponibile da cui parte il piano.</div></div>' +
      '<div class="finance-tile"><div class="finance-k">Impegni base</div><div class="finance-v">€ ' + esc(currency(coreBurn)) + '</div><div class="finance-s">Casa, uscite ricorrenti e struttura familiare.</div></div>' +
      '<div class="finance-tile"><div class="finance-k">Spazio di manovra</div><div class="finance-v">€ ' + esc(currency(freeCash)) + '</div><div class="finance-s">Margine stimato dopo i costi essenziali.</div></div>' +
      '<div class="finance-tile"><div class="finance-k">Tenuta di liquidita</div><div class="finance-v">' + esc(bufferMonths.toFixed(1).replace(".", ",")) + ' mesi</div><div class="finance-s">Quanti mesi regge la cassa senza toccare gli investimenti.</div></div>' +
      "</div>" +
      '<div class="progress-stack">' +
      progressMarkup(
        "Fondo emergenze",
        profile.liquidAssets,
        emergencyGoal ? emergencyGoal.targetAmount : Math.max(1, profile.liquidAssets),
        "safe",
        "Liquidita oggi: € " + currency(profile.liquidAssets) + (emergencyGoal ? " su target € " + currency(emergencyGoal.targetAmount) : "")
      ) +
      (homeGoal ? progressMarkup(
        "Capitale per casa",
        profile.liquidAssets + profile.monthlySavings * 12,
        Math.max(1, homeGoal.targetAmount),
        "alt",
        "Tra liquidita e 12 mesi di risparmio copri gia una parte concreta dell'anticipo casa."
      ) : "") +
      progressMarkup(
        "Coperture prioritarie attive",
        snapshot.selectedCount,
        Math.min(3, S.plan.recommendations.length || 1),
        "",
        snapshot.selectedCount + " coperture core gia attive sul set consigliato dal motore."
      ) +
      "</div>";
  }

  function renderGoals() {
    if (!S.plan) return;
    var goalGrid = byId("goalGrid");
    var goalSuggestions = S.plan.goalSuggestions || S.plan.goals;
    var selectedGoalIds = selectedGoalIdsFromPlan();
    goalGrid.classList.remove("phase-hidden");
    goalGrid.innerHTML = goalSuggestions
      .map(function (goal) {
        var selected = selectedGoalIds.indexOf(goal.id) >= 0;
        return (
          '<div class="goal-tile ' + goal.accentClass + (selected ? " on" : "") + '" data-goal-id="' + esc(goal.id) + '" data-goal-enabled="' + (selected ? "1" : "0") + '">' +
          '<div class="goal-tile-top"><div class="goal-emoji">' + esc(goal.emoji) + '</div><div class="goal-name">' + esc(goal.name) + '</div><div class="goal-check">✓</div><button type="button" class="goal-switch' + (selected ? " on" : "") + '" onclick="event.stopPropagation();toggleGoalSelection(\'' + esc(goal.id) + '\')">' + esc(selected ? "In simulazione" : "Aggiungi") + "</button></div>" +
          '<div class="fg2" style="gap:8px 12px">' +
          '<div class="fgrp"><div class="flbl">' + esc(goal.targetLabel) + '</div><div class="pfxw"><div class="pfx">€</div><input class="fi pi" type="number" data-goal-field="targetAmount" value="' + esc(goal.targetAmount) + '"></div></div>' +
          '<div class="fgrp"><div class="flbl">Entro</div><input class="fi" type="number" min="1" max="30" data-goal-field="years" value="' + goal.years + '"></div>' +
          '</div>' +
          "</div>"
        );
      })
      .join("");
  }

  function renderCoverageTable() {
    if (!S.plan) return;
    byId("coverageTableBody").innerHTML = S.plan.recommendations
      .map(function (recommendation) {
        var active = S.plan.selectedCoverageIds.indexOf(recommendation.id) >= 0;
        return (
          "<tr>" +
          '<td><div class="cov-ic2" style="background:' + recommendation.tint + '">' + esc(recommendation.icon) + "</div></td>" +
          '<td><div class="cov-nm">' + esc(recommendation.name) + '</div><div class="cov-ds">' + esc(recommendation.detail) + "</div></td>" +
          '<td><div class="cov-ds">' + esc(recommendation.secondaryDetail) + "<br>Coerenza profilo: " + recommendation.score + "/100</div></td>" +
          '<td><div class="cov-eur">€ ' + recommendation.monthlyPremium + '/mese</div></td>' +
          '<td><div class="cov-ded' + (recommendation.deductibleRate ? "" : " no") + '">' + esc(recommendation.deductibleLabel) + "</div></td>" +
          '<td><button class="tog' + (active ? " on" : "") + '" onclick="toggleCoverage(\'' + esc(recommendation.id) + '\')"></button></td>' +
          "</tr>"
        );
      })
      .join("");
  }

  function renderPremiumSummary() {
    if (!S.plan) return;
    var snapshot = S.plan.snapshot;
    byId("premV").textContent = "€ " + snapshot.totalPremium;
    byId("premS").innerHTML =
      snapshot.selectedCount +
      " copertur" +
      (snapshot.selectedCount === 1 ? "a" : "e") +
      " attiv" +
      (snapshot.selectedCount === 1 ? "a" : "e") +
      ' · <span style="color:#86efac">€ ' +
      snapshot.deductibleMonthly +
      " detraibili/mese</span>";
    byId("taxV").textContent = "€ " + snapshot.annualTaxSaving;
    byId("liqV").textContent = "€ " + snapshot.liquidityFreed;
  }

  function updateSliderBase(keepCurrentValues) {
    if (!S.plan) return;
    var profile = S.plan.profile;
    var primaryGoal = featuredGoal(S.plan.goals);
    var targetHorizon = primaryGoal ? clamp(primaryGoal.years + 2, 2, 25) : 10;

    if (!keepCurrentValues) {
      byId("slP").value = clamp(roundStep(profile.totalAssets, 5000), 20000, 300000);
      byId("slR").value = clamp(roundStep(profile.monthlySavings, 50), 200, 3000);
      byId("slA").value = targetHorizon;
    }
  }

  function currentOverrides() {
    return {
      totalAssets: parseInt(byId("slP").value, 10) || S.plan.profile.totalAssets,
      monthlySavings: parseInt(byId("slR").value, 10) || S.plan.profile.monthlySavings,
      horizonYears: parseInt(byId("slA").value, 10) || 10,
      goalId: S.activeGoalId
    };
  }

  function renderGoalFocusGrid() {
    if (!S.plan) return;
    var focusGrid = byId("goalFocusGrid");
    var goals = S.plan.goalSuggestions || S.plan.goals;
    var selectedGoalIds = selectedGoalIdsFromPlan();
    focusGrid.innerHTML = goals
      .map(function (goal) {
        var durationLabel = goal.id === "retirement" ? "Orizzonte" : "Durata";
        var selected = selectedGoalIds.indexOf(goal.id) >= 0;
        return (
          '<div class="gfocus-card' + (selected ? " on" : " off") + (goal.id === S.activeGoalId ? " focus" : "") + '"' + (selected ? ' onclick="selectGoal(\'' + esc(goal.id) + '\')"' : "") + '>' +
          '<div class="gfocus-top"><div class="gfocus-main"><div class="gfocus-emoji">' + esc(goal.emoji) + '</div><div><div class="gfocus-name">' + esc(goal.name) + '</div><div class="gfocus-sub">' + esc(goal.displayYears) + '</div></div></div><button type="button" class="goal-switch' + (selected ? " on" : "") + '" onclick="event.stopPropagation();toggleGoalSelection(\'' + esc(goal.id) + '\')">' + esc(selected ? "In simulazione" : "Aggiungi") + "</button></div>" +
          '<div class="gfocus-meta">' +
          '<div><div class="gfocus-k">Valore obiettivo</div><div class="gfocus-edit"><div class="gfocus-input-wrap" onclick="event.stopPropagation()"><span class="gfocus-input-prefix">€</span><input class="gfocus-input" type="text" inputmode="numeric" value="' + esc(goalInputValue(goal, "targetAmount")) + '" onchange="updateScenarioGoal(\'' + esc(goal.id) + '\', \'targetAmount\', this.value)" onblur="updateScenarioGoal(\'' + esc(goal.id) + '\', \'targetAmount\', this.value)" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()"></div></div></div>' +
          '<div><div class="gfocus-k">' + esc(durationLabel) + '</div><div class="gfocus-edit"><div class="gfocus-input-wrap" onclick="event.stopPropagation()"><input class="gfocus-input" type="text" inputmode="numeric" value="' + esc(goalInputValue(goal, "years")) + '" onchange="updateScenarioGoal(\'' + esc(goal.id) + '\', \'years\', this.value)" onblur="updateScenarioGoal(\'' + esc(goal.id) + '\', \'years\', this.value)" onclick="event.stopPropagation()" onkeydown="event.stopPropagation()"><span class="gfocus-input-suffix">anni</span></div></div></div>' +
          "</div>" +
          '<div class="gfocus-bar"><span style="width:100%"></span></div>' +
          "</div>"
        );
      })
      .join("");
  }

  function renderGoalGaugeGrid() {
    if (!S.analysis) return;
    var grid = byId("goalGaugeGrid");
    if (!grid) return;

    grid.innerHTML = (S.analysis.goalGaugeCards || [])
      .map(function (goalCard) {
        var currentScore = clamp(goalCard.activeAchievement, 0, 100);
        var tone = scoreTone(currentScore);
        var improvement = Math.max(0, currentScore - clamp(goalCard.noCoverageAchievement, 0, 100));
        return (
          '<div class="goal-gauge-card">' +
          '<div class="goal-gauge-top"><div class="goal-gauge-emoji">' + esc(goalCard.goalEmoji) + '</div><div><div class="goal-gauge-name">' + esc(goalCard.goalName) + '</div><div class="goal-gauge-sub">€ ' + esc(currency(goalCard.targetAmount)) + " · " + esc(goalCard.displayYears) + "</div></div></div>" +
          '<div class="goal-gauge-ring" style="--angle:' + (currentScore * 3.6) + 'deg;--tone:' + esc(tone.color) + '">' +
          '<div class="goal-gauge-center"><div class="goal-gauge-score">' + currentScore + '<small>/100</small></div><div class="goal-gauge-sub">set attivo</div></div>' +
          "</div>" +
          '<div style="display:flex;justify-content:center"><span class="goal-gauge-tone ' + esc(tone.key) + '">' + esc(tone.label) + "</span></div>" +
          '<div class="goal-gauge-delta' + (improvement ? " positive" : "") + '">' + (improvement ? "+" + improvement + " punti sbloccati con le coperture" : "Nessun miglioramento finche non attivi coperture") + "</div>" +
          '<div class="goal-gauge-stats">' +
          '<div class="goal-gauge-stat"><div class="goal-gauge-stat-k">Partenza oggi</div><div class="goal-gauge-stat-v">' + esc(goalCard.foundationScore || 0) + "/100</div></div>" +
          '<div class="goal-gauge-stat"><div class="goal-gauge-stat-k">Tenuta con imprevisti</div><div class="goal-gauge-stat-v">' + currentScore + "/100</div></div>" +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function renderCoverageSummaryBand() {
    if (!S.plan) return;
    var band = byId("coverageSummaryBand");
    if (!band) return;

    var snapshot = S.plan.snapshot;
    var selectedGoalCount = S.plan.goals.length;
    if (!snapshot.selectedCount) {
      band.innerHTML =
        '<div class="coverage-band empty">' +
        '<div><div class="coverage-band-ey">Set polizze</div><div class="coverage-band-title">Nessuna copertura attiva</div><div class="coverage-band-copy">Attiva una o piu polizze qui sotto e vedrai subito il costo mensile totale del set rispetto a quanto il cliente dovrebbe auto-accantonare da solo.</div></div>' +
        '<div class="coverage-band-grid">' +
        '<div class="coverage-band-metric"><div class="coverage-band-k">Obiettivi in simulazione</div><div class="coverage-band-v">' + esc(selectedGoalCount) + '</div></div>' +
        '<div class="coverage-band-metric"><div class="coverage-band-k">Set attivo</div><div class="coverage-band-v">€ 0/mese</div></div>' +
        '<div class="coverage-band-metric"><div class="coverage-band-k">Auto-accantonamento</div><div class="coverage-band-v">da vedere</div></div>' +
        "</div></div>";
      return;
    }

    band.innerHTML =
      '<div class="coverage-band">' +
      '<div><div class="coverage-band-ey">Set polizze attivo</div><div class="coverage-band-title">Con ' + esc(snapshot.selectedCount) + ' copertur' + (snapshot.selectedCount === 1 ? "a" : "e") + ' attiv' + (snapshot.selectedCount === 1 ? "a" : "e") + ' il cliente spende € ' + esc(currency(snapshot.totalPremium)) + '/mese</div><div class="coverage-band-copy">Per reggere gli stessi rischi senza polizze dovrebbe assorbire circa € ' + esc(currency(snapshot.selfFundMonthly)) + '/mese di auto-cuscinetto. La differenza resta disponibile per sostenere gli obiettivi scelti.</div></div>' +
      '<div class="coverage-band-grid">' +
      '<div class="coverage-band-metric premium"><div class="coverage-band-k">Costo totale set</div><div class="coverage-band-v">€ ' + esc(currency(snapshot.totalPremium)) + '/mese</div></div>' +
      '<div class="coverage-band-metric reserve"><div class="coverage-band-k">Senza polizze</div><div class="coverage-band-v">€ ' + esc(currency(snapshot.selfFundMonthly)) + '/mese</div></div>' +
      '<div class="coverage-band-metric freed"><div class="coverage-band-k">Liquidita liberata</div><div class="coverage-band-v">€ ' + esc(currency(snapshot.liquidityFreed)) + '/mese</div></div>' +
      "</div></div>";
  }

  function renderPolicyBoard(activeScenario) {
    if (!S.plan) return;
    var suggestedGrid = byId("policySuggestedGrid");
    var optionalGrid = byId("policyOptionalGrid");
    var suggestedBadge = byId("policySuggestedBadge");
    var optionalBadge = byId("policyOptionalBadge");
    if (!suggestedGrid || !optionalGrid) return;

    var recommendations = S.plan.recommendations.slice().sort(function (left, right) {
      var leftSelected = isSelectedProduct(left.id) ? 1 : 0;
      var rightSelected = isSelectedProduct(right.id) ? 1 : 0;
      if (rightSelected !== leftSelected) return rightSelected - leftSelected;
      return right.score - left.score;
    });
    var suggested = recommendations.filter(function (product, index) {
      return product.score >= 52 || isSelectedProduct(product.id) || index < 2;
    });
    var optional = recommendations.filter(function (product) {
      return suggested.indexOf(product) < 0;
    });

    suggestedBadge.textContent = suggested.length + " suggerite";
    optionalBadge.textContent = optional.length ? optional.length + " opzionali" : "Nessuna opzionale";

    function cardMarkup(product, bucket) {
      var priority = priorityMeta(product.score);
      var selected = isSelectedProduct(product.id);
      var matchesCurrentScenario = activeScenario ? productMatchesScenario(product, activeScenario) : false;
      var reserveRatio = reserveMultiple(product);
      var isSuggested = bucket === "suggested";
      var ragActive = S.ragInsight && S.ragInsight.productId === product.id;
      var ragLoading = ragActive && S.ragInsight.status === "loading";
      return (
        '<div class="policy-card' + (isSuggested ? " suggested" : "") + (selected ? " on" : "") + '">' +
        '<div class="policy-card-shell">' +
        '<div class="policy-card-main">' +
        '<div class="policy-card-flag' + (isSuggested ? "" : " optional") + '">' + esc(isSuggested ? "✓ Consigliata" : "Opzionale") + "</div>" +
        '<div class="policy-card-top">' +
        '<div class="policy-card-icon" style="background:' + esc(product.tint) + '">' + esc(product.icon) + "</div>" +
        '<div style="flex:1;min-width:0"><div class="policy-card-name">' + esc(product.name) + '</div><div class="policy-card-copy">' + esc(scenarioCoverageReason(product, activeScenario)) + "</div></div>" +
        "</div>" +
        '<div class="policy-tags">' +
        '<span class="policy-tag ' + esc(priority.key) + '">' + esc(priority.label) + "</span>" +
        '<span class="policy-tag">' + esc(matchesCurrentScenario ? "utile nello scenario attivo" : "utile sul profilo") + "</span>" +
        "</div>" +
        "</div>" +
        '<div class="policy-card-stats">' +
        '<div class="policy-card-metrics">' +
        '<div class="policy-mini premium"><div class="policy-mini-k">Costo mensile</div><div class="policy-mini-v">' + esc(premiumRangeLabel(product)) + '</div><div class="policy-mini-s">' + esc(product.deductibleLabel) + "</div></div>" +
        '<div class="policy-mini reserve"><div class="policy-mini-k">Senza polizza</div><div class="policy-mini-v">€ ' + esc(currency(product.selfFundMonthlyEquivalent)) + '/mese</div></div>' +
        "</div>" +
        '<div class="policy-legend"><span class="policy-legend-item"><span class="policy-legend-dot green"></span>Costo mensile</span><span class="policy-legend-item"><span class="policy-legend-dot red"></span>Senza polizza</span></div>' +
        '<div class="policy-callout"><div><div class="policy-callout-k">Lettura veloce</div><div class="policy-callout-v">1€ di premio evita circa <strong>' + esc(reserveRatio) + '€</strong> di auto-cuscinetto</div></div><div class="policy-callout-s">Il cliente trasferisce il rischio invece di bloccarsi da solo molta piu liquidita.</div></div>' +
        "</div>" +
        '<div class="policy-card-side">' +
        '<div class="policy-side-score"><div class="policy-side-k">Coerenza profilo</div><div class="policy-side-v">' + esc(product.score) + '<small>/100</small></div></div>' +
        '<div class="policy-card-foot"><button class="policy-rag-btn' + (ragActive ? " on" : "") + '" onclick="explainPolicyWithRag(\'' + esc(product.id) + '\')" ' + (ragLoading ? "disabled" : "") + '>' + esc(ragLoading ? "Analizzo..." : (ragActive ? "Aggiorna insight" : "Spiegami perche")) + '</button><button class="policy-toggle' + (selected ? " on" : "") + '" onclick="toggleCoverage(\'' + esc(product.id) + '\')">' + esc(selected ? "Disattiva" : "Attiva") + "</button></div>" +
        "</div>" +
        "</div>" +
        "</div>"
      );
    }

    suggestedGrid.innerHTML = suggested.length ? suggested.map(function (product) { return cardMarkup(product, "suggested"); }).join("") : '<div class="policy-empty">Nessuna copertura prioritaria individuata per questo profilo.</div>';
    optionalGrid.innerHTML = optional.length ? optional.map(function (product) { return cardMarkup(product, "optional"); }).join("") : '<div class="policy-empty">Per questo profilo il motore non vede altre coperture opzionali davvero rilevanti.</div>';
    renderRagInsightPanel();
  }

  function renderImpactStage(activeScenario) {
    var stage = byId("impactStage");
    if (!stage || !activeScenario || !S.analysis) return;
    var focusGoal = S.analysis.focusGoal;
    var economics = scenarioEconomics(activeScenario);
    var recoveredGap = Math.max(0, activeScenario.noCoverage.goalGap - activeScenario.withCoverage.goalGap);
    var probabilityLift = Math.max(0, activeScenario.withCoverage.achievement - activeScenario.noCoverage.achievement);
    var selectedLabels = economics.selectedRelevant.map(shortProductLabel);
    var suggestedLabels = economics.suggestedPool.map(shortProductLabel);
    var packageValue = economics.activePremium || economics.suggestedPremium;
    var packageLabel = economics.activePremium ? "Premio attivo" : "Premio suggerito";
    var packageNarrative = economics.activePremium
      ? "Con € " + currency(economics.activePremium) + "/mese il cliente evita di dover lasciare esposto circa € " + currency(economics.activeSelfFund) + "/mese di auto-protezione."
      : "Su questo scenario non c'e ancora una copertura attiva: il motore propone un pacchetto da circa € " + currency(economics.suggestedPremium) + "/mese per alleggerire il rischio sul piano.";
    var packageSupport = economics.activePremium
      ? (selectedLabels.length ? "Coperture oggi attive: " + selectedLabels.join(", ") + "." : "")
      : (suggestedLabels.length ? "Coperture da attivare: " + suggestedLabels.join(", ") + "." : "");

    stage.innerHTML =
      '<div class="impact-stage-ey">' + esc(S.activeScenarioMode === "bundle" ? "Stress combinato" : "Evento singolo") + "</div>" +
      '<div class="impact-stage-top">' +
      '<div>' +
      '<div class="impact-stage-title">' + esc(activeScenario.label) + "</div>" +
      '<div class="impact-stage-copy">Scenario letto su <strong>' + esc(focusGoal.name) + '</strong>: qui sotto l\'assicuratore vede in pochi secondi cosa succede se il cliente resta scoperto e cosa cambia se attiva una o piu coperture.</div>' +
      '<div class="impact-stage-tags">' +
      '<div class="impact-stage-tag">' + esc(focusGoal.displayYears) + "</div>" +
      '<div class="impact-stage-tag">' + esc(activeScenario.severityLabel) + "</div>" +
      '<div class="impact-stage-tag">' + esc(activeScenario.eventLabels.join(" · ")) + "</div>" +
      "</div>" +
      "</div>" +
      '<div class="impact-stage-side">' +
      '<div class="impact-stage-side-k">' + esc(packageLabel) + "</div>" +
      '<div class="impact-stage-side-v">€ ' + esc(currency(packageValue)) + '/mese</div>' +
      '<div class="impact-stage-side-s">' + esc(packageNarrative + " " + packageSupport) + "</div>" +
      "</div>" +
      "</div>" +
      '<div class="impact-stage-grid">' +
      '<div class="impact-stage-metric"><div class="impact-stage-k">Gap recuperato</div><div class="impact-stage-v">€ ' + esc(currency(recoveredGap)) + '</div><div class="impact-stage-s">Capitale riportato verso il target.</div></div>' +
      '<div class="impact-stage-metric"><div class="impact-stage-k">Probabilita obiettivo</div><div class="impact-stage-v">' + esc(activeScenario.noCoverage.achievement) + '% → ' + esc(activeScenario.withCoverage.achievement) + '%</div><div class="impact-stage-s">Salto di ' + esc(probabilityLift) + " punti sul traguardo.</div></div>" +
      '<div class="impact-stage-metric"><div class="impact-stage-k">Liquidita liberata</div><div class="impact-stage-v">€ ' + esc(currency(economics.activePremium ? economics.activeFreed : economics.suggestedFreed)) + '</div><div class="impact-stage-s">Margine mensile non piu bloccato in auto-accantonamento.</div></div>' +
      "</div>";
  }

  function renderScenarioCoverageDeck(activeScenario) {
    if (!S.plan || !S.analysis) return;
    var focusGoal = S.analysis.focusGoal;
    var economics = scenarioEconomics(activeScenario);
    var summary = byId("coverageStageSummary");
    var grid = byId("coverageStageGrid");
    var title = byId("coverageStageTitle");
    var copy = byId("coverageStageCopy");
    var usingSuggested = !economics.activePremium && economics.suggestedPremium;
    var packagePremium = economics.activePremium || economics.suggestedPremium;
    var selfFundValue = economics.activePremium ? economics.activeSelfFund : economics.suggestedSelfFund;
    var liquidityValue = economics.activePremium ? economics.activeFreed : economics.suggestedFreed;
    var products = economics.products.length ? economics.products : S.plan.recommendations.slice(0, 3);
    var relevantCount = (economics.activePremium ? economics.selectedRelevant.length : economics.suggestedPool.length) || 0;
    var relevantLabel = relevantCount === 1 ? "copertura rilevante" : "coperture rilevanti";

    title.textContent = "Coperture consigliate per proteggere " + focusGoal.name;
    copy.textContent = economics.activePremium
      ? "Con il pacchetto attivo in simulazione il cliente paga un premio mensile e riduce il bisogno di tenere ferma liquidita per assorbire da solo lo shock."
      : "Su questo scenario non c'e ancora una copertura attiva: qui sotto trovi le soluzioni che il motore suggerisce con premio stimato e logica di protezione.";

    summary.innerHTML =
      '<div class="coverage-stat"><div class="coverage-stat-k">' + esc(usingSuggested ? "Pacchetto suggerito" : "Premio in simulazione") + '</div><div class="coverage-stat-v">€ ' + esc(currency(packagePremium)) + '/mese</div><div class="coverage-stat-s">' + esc(relevantCount + " " + relevantLabel) + ' per questo scenario.</div></div>' +
      '<div class="coverage-stat"><div class="coverage-stat-k">Auto-accantonamento evitato</div><div class="coverage-stat-v">€ ' + esc(currency(selfFundValue)) + '/mese</div><div class="coverage-stat-s">Quanto servirebbe trattenere da soli per gestire lo stesso rischio.</div></div>' +
      '<div class="coverage-stat"><div class="coverage-stat-k">Liquidita liberata</div><div class="coverage-stat-v">€ ' + esc(currency(liquidityValue)) + '/mese</div><div class="coverage-stat-s">Margine che torna disponibile per obiettivi ed emergenze.</div></div>' +
      '<div class="coverage-stat"><div class="coverage-stat-k">Risparmio fiscale annuo</div><div class="coverage-stat-v">€ ' + esc(currency(economics.annualTaxSaving)) + '</div><div class="coverage-stat-s">Valore stimato sulle coperture oggi attive in simulazione.</div></div>';

    grid.innerHTML = products
      .map(function (product) {
        var selected = isSelectedProduct(product.id);
        var scenarioMatched = productMatchesScenario(product, activeScenario);
        var premiumLabel = "€ " + currency(product.monthlyPremium) + "/mese";
        var selfFundLabel = "€ " + currency(product.selfFundMonthlyEquivalent) + "/mese";
        return (
          '<div class="coverage-card' + (selected ? " on" : "") + '">' +
          '<div class="coverage-card-top">' +
          '<div class="coverage-card-icon" style="background:' + esc(product.tint) + '">' + esc(product.icon) + "</div>" +
          '<div style="flex:1">' +
          '<div class="coverage-card-title">' + esc(product.name) + "</div>" +
          '<div class="coverage-card-copy">' + esc(scenarioCoverageReason(product, activeScenario)) + "</div>" +
          "</div>" +
          '<div class="coverage-flag' + (selected ? " on" : "") + '">' + esc(selected ? "Attiva nella simulazione" : "Consigliata") + "</div>" +
          "</div>" +
          '<div class="coverage-card-metrics">' +
          '<div class="coverage-mini"><div class="coverage-mini-k">Premio</div><div class="coverage-mini-v">' + esc(premiumLabel) + '</div><div class="coverage-mini-s">' + esc(product.deductibleLabel) + '</div></div>' +
          '<div class="coverage-mini"><div class="coverage-mini-k">Se non assicurato</div><div class="coverage-mini-v">' + esc(selfFundLabel) + '</div><div class="coverage-mini-s">Accantonamento mensile stimato per assorbire il rischio.</div></div>' +
          "</div>" +
          '<div class="coverage-card-tags">' +
          '<span class="coverage-card-tag">' + esc(product.secondaryDetail) + "</span>" +
          '<span class="coverage-card-tag">' + esc(scenarioMatched ? "rilevante in questo scenario" : "utile come rinforzo del piano") + "</span>" +
          "</div>" +
          '<div class="coverage-card-foot">' +
          '<span class="coverage-card-copy" style="margin:0">Coerenza profilo ' + esc(product.score) + "/100</span>" +
          '<button class="coverage-toggle' + (selected ? " on" : "") + '" onclick="toggleCoverage(\'' + esc(product.id) + '\')">' + esc(selected ? "Copertura attiva" : "Attiva copertura") + "</button>" +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function renderScenarioModeTabs() {
    var tabs = byId("scenarioModeTabs");
    if (!tabs) return;
    tabs.innerHTML =
      '<button class="mode-tab' + (S.activeScenarioMode === "bundle" ? " on" : "") + '" onclick="setScenarioMode(\'bundle\')">Stress combinati</button>' +
      '<button class="mode-tab' + (S.activeScenarioMode === "single" ? " on" : "") + '" onclick="setScenarioMode(\'single\')">Eventi singoli</button>';
  }

  function renderBundleCards() {
    if (!S.analysis) return;
    var bundleGrid = byId("bundleGrid");
    if (!bundleGrid) return;
    var order = scenarioOrderForMode(S.analysis, "bundle");
    bundleGrid.style.display = S.activeScenarioMode === "bundle" ? "grid" : "none";
    bundleGrid.innerHTML = order
      .map(function (bundleId) {
        var scenario = S.analysis.bundles[bundleId];
        if (!scenario) return "";
        return (
          '<button class="bundle-card' + (S.activeScenarioMode === "bundle" && scenario.id === S.activeScenarioId ? " on" : "") + '" onclick="selectScenario(\'' + scenario.id + '\')">' +
          '<div class="bundle-card-top"><div class="bundle-card-emoji">' + esc(scenario.icon) + '</div><div><div class="bundle-card-name">' + esc(scenario.label) + '</div><div class="bundle-card-copy">' + esc(scenario.description || scenario.shortLabel) + "</div></div></div>" +
          '<div class="bundle-card-meta"><div class="bundle-card-pill">' + esc(scenario.amountLabel) + '</div><div class="bundle-card-pill sev ' + esc(scenario.severityClass) + '">' + esc(scenario.severityLabel) + "</div></div>" +
          '<div class="bundle-card-tags">' +
          scenario.eventLabels.map(function (label) {
            return '<span class="bundle-card-tag">' + esc(label) + "</span>";
          }).join("") +
          "</div>" +
          "</button>"
        );
      })
      .join("");
  }

  function renderGoalStory(activeScenario) {
    var goalBrief = byId("goalBrief");
    var scenarioBrief = byId("scenarioBrief");
    var focusGoal = S.analysis.focusGoal;
    var economics = scenarioEconomics(activeScenario);
    var activeProducts = economics.selectedRelevant.slice();
    var recoveredGap = Math.max(0, activeScenario.noCoverage.goalGap - activeScenario.withCoverage.goalGap);
    var recoveredProbability = Math.max(0, activeScenario.withCoverage.achievement - activeScenario.noCoverage.achievement);
    var recoveredDelay = Math.max(0, activeScenario.noCoverage.delayYears - activeScenario.withCoverage.delayYears);
    if (!activeProducts.length) activeProducts = economics.suggestedPool.slice(0, 3);
    var capitalToday = focusGoal.id === "emergency"
      ? S.analysis.profile.liquidAssets
      : S.analysis.profile.liquidAssets + S.analysis.profile.monthlySavings * 12;
    var packagePremium = economics.activePremium || economics.suggestedPremium;
    var packageType = economics.activePremium ? "attivo" : "suggerito";
    var packageTitle = economics.activePremium
      ? "Con € " + currency(packagePremium) + "/mese il rischio cambia forma"
      : "Da € " + currency(packagePremium) + "/mese il rischio si trasferisce";

    goalBrief.innerHTML =
      '<div class="goal-story-ey">Obiettivo cliente</div>' +
      '<div class="goal-story-title">' + esc(focusGoal.name) + "</div>" +
      '<div class="goal-story-copy">Questa e la meta che il cliente vuole proteggere. La lettura per obiettivo rende il rischio concreto: non stiamo parlando di una polizza in astratto, ma di cosa succede al suo progetto di vita.</div>' +
      '<div class="goal-story-grid">' +
      '<div class="goal-story-metric"><div class="goal-story-k">Target</div><div class="goal-story-v">€ ' + esc(currency(focusGoal.targetAmount)) + '</div><div class="goal-story-s">' + esc(focusGoal.displayYears) + '</div></div>' +
      '<div class="goal-story-metric"><div class="goal-story-k">Base oggi</div><div class="goal-story-v">€ ' + esc(currency(capitalToday)) + '</div><div class="goal-story-s">Capitale subito mobilitabile per il progetto.</div></div>' +
      '<div class="goal-story-metric"><div class="goal-story-k">Probabilita con pacchetto</div><div class="goal-story-v">' + activeScenario.withCoverage.achievement + '%</div><div class="goal-story-s">Esito con il pacchetto ' + esc(packageType) + ' in simulazione.</div></div>' +
      "</div>";

    scenarioBrief.innerHTML =
      '<div class="goal-story-ey">Messaggio da dire al cliente</div>' +
      '<div class="goal-story-title">' + esc(packageTitle) + "</div>" +
      '<div class="goal-story-copy">' + esc(activeScenario.alertBody) + "</div>" +
      '<div class="goal-story-highlight">' +
      '<div class="goal-story-hl"><div class="goal-story-hk">Gap recuperato</div><div class="goal-story-hv">€ ' + esc(currency(recoveredGap)) + "</div></div>" +
      '<div class="goal-story-hl"><div class="goal-story-hk">Probabilita recuperata</div><div class="goal-story-hv">+' + esc(recoveredProbability) + " pt</div></div>" +
      '<div class="goal-story-hl"><div class="goal-story-hk">Ritardo evitato</div><div class="goal-story-hv">' + esc(compactDelay(recoveredDelay)) + "</div></div>" +
      "</div>" +
      '<div class="goal-story-list">' +
      '<div class="goal-story-item"><div class="goal-story-dot"></div><div><strong>' + esc(activeScenario.noCoverage.goalGap ? "Se resta scoperto si apre un gap di € " + currency(activeScenario.noCoverage.goalGap) : "Anche senza copertura il target resta formalmente raggiungibile") + '</strong><span>Il ritardo stimato e ' + esc(formatDelay(activeScenario.noCoverage.delayYears)) + ' e la probabilita scende al ' + esc(activeScenario.noCoverage.achievement) + "%.</span></div></div>" +
      '<div class="goal-story-item"><div class="goal-story-dot" style="background:var(--teal)"></div><div><strong>' + esc(activeScenario.withCoverage.goalGap ? "Con protezione il gap si riduce a € " + currency(activeScenario.withCoverage.goalGap) : "Con protezione il target resta sostanzialmente protetto") + '</strong><span>Il piano recupera tenuta e il ritardo atteso scende a ' + esc(formatDelay(activeScenario.withCoverage.delayYears)) + ".</span></div></div>" +
      '<div class="goal-story-item"><div class="goal-story-dot" style="background:var(--blue)"></div><div><strong>Leve da mostrare</strong><span>' + esc(activeProducts.map(shortProductLabel).join(", ") || "Nessuna copertura selezionata") + '. Premio ' + currency(packagePremium) + "/mese.</span></div></div>" +
      "</div>";
  }

  function renderEventButtons() {
    if (!S.analysis) return;
    var eventGrid = byId("eventGrid");
    var order = scenarioOrderForMode(S.analysis, "single");
    eventGrid.style.display = S.activeScenarioMode === "single" ? "grid" : "none";
    var scenarios = order.map(function (scenarioId) {
      return S.analysis.scenarios[scenarioId];
    }).filter(Boolean);
    eventGrid.innerHTML = scenarios
      .map(function (scenario) {
        return (
          '<button class="evb' + (S.activeScenarioMode === "single" && scenario.id === S.activeScenarioId ? " on" : "") + '" onclick="selectScenario(\'' + scenario.id + '\')">' +
          '<div class="evi">' + scenario.icon + "</div>" +
          '<div class="evn">' + scenario.label + "</div>" +
          '<div class="evc">' + scenario.amountLabel + "</div>" +
          '<div class="evs ' + scenario.severityClass + '">' + scenario.severityLabel + "</div>" +
          "</button>"
        );
      })
      .join("");
  }

  function renderBenefitBars(activeScenario) {
    var economics = scenarioEconomics(activeScenario);
    var products = economics.selectedRelevant.length ? economics.selectedRelevant.slice(0, 4) : economics.suggestedPool.slice(0, 4);
    var insuredLabel = economics.selectedRelevant.length ? "Con polizza" : "Premio suggerito";
    var labels = {
      tcm: "Decesso / TCM",
      income_protection: "Reddito / IP",
      rc_family: "RC & Casa",
      ltc: "Non autosufficienza",
      health: "Salute",
      mortgage: "Mutuo"
    };
    if (!products.length) {
      byId("benefitBars").innerHTML = '<div class="cov-ds">Attiva almeno una copertura per vedere il confronto tra accantonamento e protezione assicurativa.</div>';
      return;
    }

    byId("benefitBars").innerHTML = products
      .map(function (product) {
        var referenceValue = Math.max(product.selfFundMonthlyEquivalent, product.monthlyPremium, 1);
        var selfPercent = Math.max(16, Math.round((product.selfFundMonthlyEquivalent / referenceValue) * 100));
        var insuredPercent = Math.max(16, Math.round((product.monthlyPremium / referenceValue) * 100));
        var shortLabel = labels[product.id] || product.name;
        return (
          '<div class="bcr">' +
          '<div class="bcl">' + shortLabel + "</div>" +
          '<div class="bcbs">' +
          '<div class="brow2"><div class="bb bbn" style="width:' + selfPercent + '%"></div><span class="bbl2 n">Autofinanziando € ' + currency(product.selfFundMonthlyEquivalent) + '/mese</span></div>' +
          '<div class="brow2"><div class="bb bby" style="width:' + insuredPercent + '%"></div><span class="bbl2 y">' + insuredLabel + ' € ' + currency(product.monthlyPremium) + '/mese</span></div>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  function drawBar(activeScenario) {
    destroyChart("bar");
    var horizonLabel = "Alla data obiettivo";
    var ctx = byId("barC").getContext("2d");
    var endNo = activeScenario.noCoverage.goalAvailableCapital;
    var endYes = activeScenario.withCoverage.goalAvailableCapital;

    S.ch.bar = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Oggi", "Dopo evento", horizonLabel],
        datasets: [
          {
            label: "Senza polizza",
            data: [S.analysis.profile.totalAssets, activeScenario.noCoverage.postEventCapital, endNo],
            backgroundColor: "rgba(239,68,68,.6)",
            borderColor: "#dc2626",
            borderWidth: 1.5,
            borderRadius: 5,
            barPercentage: 0.38
          },
          {
            label: "Con polizza",
            data: [S.analysis.profile.totalAssets, activeScenario.withCoverage.postEventCapital, endYes],
            backgroundColor: "rgba(0,133,124,.6)",
            borderColor: "#00857c",
            borderWidth: 1.5,
            borderRadius: 5,
            barPercentage: 0.38
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (context) {
                return "€ " + context.parsed.y.toLocaleString("it-IT");
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { family: "Outfit", size: 11 }, color: "#7a93b8" } },
          y: { grid: { color: "rgba(212,227,245,.5)" }, ticks: { font: { family: "Outfit", size: 10 }, color: "#7a93b8", callback: function (value) { return "€" + Math.round(value / 1000) + "k"; } } }
        }
      }
    });
  }

  function drawDonuts(activeScenario) {
    ["dNo", "dYes"].forEach(function (id) { destroyChart(id); });

    function mount(canvasId, score, color) {
      var ctx = byId(canvasId).getContext("2d");
      S.ch[canvasId] = new Chart(ctx, {
        type: "doughnut",
        data: {
          datasets: [{
            data: [score, 100 - score],
            backgroundColor: [color, "rgba(212,227,245,.4)"],
            borderWidth: 0,
            circumference: 270,
            rotation: 225
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "72%",
          plugins: { legend: { display: false }, tooltip: { enabled: false } }
        },
        plugins: [{
          id: "centerText",
          afterDraw: function (chart) {
            var area = chart.chartArea;
            var context = chart.ctx;
            var centerX = area.left + area.width / 2;
            var centerY = area.top + area.height / 2 + 8;
            context.save();
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.font = "800 22px Outfit,sans-serif";
            context.fillStyle = color;
            context.fillText(score + "%", centerX, centerY);
            context.font = "500 9.5px Outfit,sans-serif";
            context.fillStyle = "#7a93b8";
            context.fillText("sostenibilita", centerX, centerY + 16);
            context.restore();
          }
        }]
      });
    }

    mount("dNo", activeScenario.noCoverage.sustainability, "#ef4444");
    mount("dYes", activeScenario.withCoverage.sustainability, "#1a7f4b");
  }

  function drawLiquidityChart(activeScenario) {
    destroyChart("liq");
    var economics = scenarioEconomics(activeScenario);
    var products = economics.selectedRelevant.length ? economics.selectedRelevant.slice(0, 4) : economics.suggestedPool.slice(0, 4);
    var ctx = byId("liqC").getContext("2d");

    if (!products.length) {
      S.ch.liq = new Chart(ctx, {
        type: "bar",
        data: {
          labels: ["Nessuna copertura"],
          datasets: [{ data: [0], backgroundColor: "rgba(212,227,245,.7)", borderRadius: 5 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { enabled: false } },
          scales: { x: { grid: { display: false } }, y: { display: false } }
        }
      });
      return;
    }

    S.ch.liq = new Chart(ctx, {
      type: "bar",
      data: {
        labels: products.map(function (product) {
          return shortProductLabel(product);
        }),
        datasets: [
          {
            label: "Auto-accantonamento",
            data: products.map(function (product) { return product.selfFundMonthlyEquivalent; }),
            backgroundColor: "rgba(252,165,165,.8)",
            borderRadius: 5
          },
          {
            label: economics.selectedRelevant.length ? "Premio polizza" : "Premio suggerito",
            data: products.map(function (product) { return product.monthlyPremium; }),
            backgroundColor: "rgba(0,133,124,.75)",
            borderRadius: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (context) {
                return "€ " + context.parsed.y + "/mese";
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { family: "Outfit", size: 11 }, color: "#7a93b8" } },
          y: { grid: { color: "rgba(212,227,245,.5)" }, ticks: { font: { family: "Outfit", size: 10 }, color: "#7a93b8", callback: function (value) { return "€" + value; } } }
        }
      }
    });
  }

  function drawTimeline(activeScenario) {
    destroyChart("tl");
    var labels = activeScenario.withCoverage.path.map(function (_, index) {
      return index === 0 ? "Oggi" : "Anno " + Math.round(index / 12);
    }).filter(function (_, index) {
      return index === 0 || index % 12 === 0;
    });
    var noData = activeScenario.noCoverage.path.filter(function (_, index) { return index === 0 || index % 12 === 0; });
    var yesData = activeScenario.withCoverage.path.filter(function (_, index) { return index === 0 || index % 12 === 0; });
    var targetData = activeScenario.targetPath.filter(function (_, index) { return index === 0 || index % 12 === 0; });
    var ctx = byId("tlC").getContext("2d");

    S.ch.tl = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Senza copertura",
            data: noData,
            borderColor: "#e57373",
            backgroundColor: "rgba(229,115,115,.07)",
            fill: true,
            tension: 0.4,
            borderWidth: 2.5,
            pointRadius: 3,
            pointBackgroundColor: "#e57373"
          },
          {
            label: "Con copertura",
            data: yesData,
            borderColor: "#00857c",
            backgroundColor: "rgba(0,133,124,.07)",
            fill: true,
            tension: 0.4,
            borderWidth: 2.5,
            pointRadius: 3,
            pointBackgroundColor: "#00857c"
          },
          {
            label: "Target obiettivi",
            data: targetData,
            borderColor: "#e8a000",
            borderDash: [6, 4],
            fill: false,
            tension: 0,
            borderWidth: 2,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (context) {
                return "€ " + context.parsed.y.toLocaleString("it-IT");
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { family: "Outfit", size: 10 }, color: "#7a93b8", maxTicksLimit: 9 } },
          y: { grid: { color: "rgba(212,227,245,.5)" }, ticks: { font: { family: "Outfit", size: 10 }, color: "#7a93b8", callback: function (value) { return "€" + Math.round(value / 1000) + "k"; } } }
        },
        animation: { duration: 700, easing: "easeInOutQuart" }
      }
    });
  }

  function renderScenarioMetrics(activeScenario) {
    var profile = S.analysis.profile;
    var economics = scenarioEconomics(activeScenario);
    var gapNo = activeScenario.noCoverage.goalGap;
    var gapYes = activeScenario.withCoverage.goalGap;
    var premiumValue = economics.activePremium || economics.suggestedPremium;
    var selfFundValue = economics.activePremium ? economics.activeSelfFund : economics.suggestedSelfFund;
    var liquidityValue = economics.activePremium ? economics.activeFreed : economics.suggestedFreed;
    var valueTitle = economics.activePremium
      ? "Con € " + currency(premiumValue) + "/mese il rischio pesa meno sul piano"
      : "Pacchetto suggerito da € " + currency(premiumValue) + "/mese";
    var valueNarrative = economics.activePremium
      ? "Per proteggere questo rischio il cliente spende circa € " + currency(premiumValue) + "/mese invece di dover lasciare assorbito fino a € " + currency(selfFundValue) + "/mese in auto-protezione. Il vantaggio pratico e che libera circa € " + currency(liquidityValue) + "/mese per continuare ad alimentare gli obiettivi."
      : "Se il cliente resta scoperto dovrebbe assorbire il rischio con capitale e risparmio. Il motore suggerisce coperture da circa € " + currency(premiumValue) + "/mese che riducono il bisogno di auto-accantonare fino a € " + currency(selfFundValue) + "/mese.";

    byId("p3ClientName").textContent = profile.name;
    byId("p3GoalName").textContent = S.analysis.focusGoal.name;
    byId("mNP").textContent = "€ " + currency(activeScenario.noCoverage.goalAvailableCapital);
    byId("mYP").textContent = "€ " + currency(activeScenario.withCoverage.goalAvailableCapital);
    byId("mND").textContent = gapNo ? "Gap € " + currency(gapNo) : "Target pieno";
    byId("mYD").textContent = gapYes ? "Gap € " + currency(gapYes) : "Target protetto";
    byId("mNPct").textContent = activeScenario.noCoverage.achievement + "%";
    byId("mYPct").textContent = activeScenario.withCoverage.achievement + "%";
    byId("gapNoV").textContent = gapNo ? "€ " + currency(gapNo) : "target pieno";
    byId("gapYesV").textContent = gapYes ? "€ " + currency(gapYes) : "target pieno";
    byId("delayNoV").textContent = compactDelay(activeScenario.noCoverage.delayYears);
    byId("delayYesV").textContent = compactDelay(activeScenario.withCoverage.delayYears);
    byId("valueNarrative").innerHTML =
      '<div class="value-note-title">' + esc(valueTitle) + "</div>" +
      '<div class="value-note-copy">' + esc(valueNarrative) + "</div>";
  }

  function ensureScenarioSelection(forcePriority) {
    var collection = currentScenarioCollection();
    if (!Object.keys(collection).length) {
      if (S.activeScenarioMode === "bundle") {
        S.activeScenarioMode = "single";
        collection = currentScenarioCollection();
      }
    }
    if (forcePriority || !collection[S.activeScenarioId]) {
      S.activeScenarioId = pickPriorityScenarioId(S.analysis, S.activeScenarioMode) || Object.keys(collection)[0];
    }
  }

  function refreshScenarioAnalysis() {
    if (!S.plan) return;
    S.ragInsight = null;
    var previousGoalId = S.analysis && S.analysis.focusGoal ? S.analysis.focusGoal.id : null;
    if (!S.activeGoalId || !S.plan.goals.some(function (goal) { return goal.id === S.activeGoalId; })) {
      S.activeGoalId = (featuredGoal(S.plan.goals) || S.plan.goals[0]).id;
    }
    var overrides = currentOverrides();

    byId("vP").textContent = currency(overrides.totalAssets);
    byId("vR").textContent = currency(overrides.monthlySavings);
    byId("vA").textContent = overrides.horizonYears;

    S.analysis = FamilyAdvisorEngine.analyzeScenarios(S.plan, overrides);
    if (S.activeScenarioMode === "bundle" && !(S.analysis.bundleOrder || []).length) {
      S.activeScenarioMode = "single";
    }
    ensureScenarioSelection(previousGoalId !== S.analysis.focusGoal.id);

    renderGoalFocusGrid();
    renderScenarioModeTabs();
    renderBundleCards();
    renderEventButtons();
    renderScenario(S.activeScenarioId);
  }

  function renderScenario(scenarioId) {
    if (!S.analysis) return;
    var collection = currentScenarioCollection();
    if (!collection[scenarioId]) return;
    S.activeScenarioId = scenarioId;
    var activeScenario = collection[scenarioId];
    renderGoalFocusGrid();
    renderScenarioModeTabs();
    renderBundleCards();
    renderEventButtons();
    renderGoalGaugeGrid();
    renderCoverageSummaryBand();
    renderPolicyBoard(activeScenario);
    renderImpactStage(activeScenario);
    renderScenarioMetrics(activeScenario);
    renderBenefitBars(activeScenario);
    drawBar(activeScenario);
    drawLiquidityChart(activeScenario);
    drawTimeline(activeScenario);
  }

  function syncProfile() {
    if (S.isRendering) return;
    var profile = readProfileFromForm();
    var selectedGoalIds = readSelectedGoalIdsFromDom();
    var options = {
      selectedCoverageIds: S.plan ? S.plan.selectedCoverageIds.slice() : [],
      keepSliderValues: true
    };
    if (selectedGoalIds && selectedGoalIds.length) options.selectedGoalIds = selectedGoalIds;
    applyPlan(profile, options);
  }

  function toggleCoverage(productId) {
    if (!S.plan) return;
    resetRagInsight();
    S.coverageTouched = true;
    var selectedIds = S.plan.selectedCoverageIds.slice();
    var index = selectedIds.indexOf(productId);
    if (index >= 0) selectedIds.splice(index, 1);
    else selectedIds.push(productId);

    applyPlan(readProfileFromForm(), {
      selectedGoalIds: selectedGoalIdsFromPlan(),
      selectedCoverageIds: selectedIds,
      keepSliderValues: true
    });
  }

  function selectScenario(scenarioId) {
    resetRagInsight();
    renderScenario(scenarioId);
  }

  function selectGoal(goalId) {
    resetRagInsight();
    S.activeGoalId = goalId;
    refreshScenarioAnalysis();
  }

  function setScenarioMode(mode) {
    resetRagInsight();
    S.activeScenarioMode = mode === "single" ? "single" : "bundle";
    ensureScenarioSelection(true);
    renderScenario(S.activeScenarioId);
  }

  function buildPrintReport() {
    if (!S.plan || !S.analysis) return;
    var activeScenario = currentScenarioCollection()[S.activeScenarioId];
    if (!activeScenario) return;
    var printSheet = byId("printSheet");
    if (!printSheet) return;
    var relevantProducts = selectedProducts().filter(function (product) {
      return productMatchesScenario(product, activeScenario);
    });
    if (!relevantProducts.length) relevantProducts = selectedProducts();
    var focusGoal = S.analysis.focusGoal;
    var premium = S.plan.snapshot.totalPremium;

    printSheet.innerHTML =
      '<div class="print-wrap">' +
      '<div class="print-header">' +
      '<div><div class="print-ey">FamilyAdvisor Pro</div><div class="print-title">Simulazione scenario assicurativo</div><div class="print-sub">' + esc(S.analysis.profile.name) + " · " + esc(focusGoal.name) + " · " + esc(activeScenario.label) + '</div></div>' +
      '<div class="print-badge">' + esc(S.activeScenarioMode === "bundle" ? "Stress combinato" : "Evento singolo") + "</div>" +
      "</div>" +
      '<div class="print-grid">' +
      '<div class="print-card"><div class="print-k">Obiettivo</div><div class="print-v">' + esc(focusGoal.name) + '</div><div class="print-s">Target € ' + esc(currency(focusGoal.targetAmount)) + " · " + esc(focusGoal.displayYears) + "</div></div>" +
      '<div class="print-card"><div class="print-k">Probabilita con coperture</div><div class="print-v">' + esc(activeScenario.withCoverage.achievement) + '%</div><div class="print-s">Senza coperture ' + esc(activeScenario.noCoverage.achievement) + "%</div></div>" +
      '<div class="print-card"><div class="print-k">Gap recuperato</div><div class="print-v">€ ' + esc(currency(Math.max(0, activeScenario.noCoverage.goalGap - activeScenario.withCoverage.goalGap))) + '</div><div class="print-s">Ritardo evitato ' + esc(compactDelay(Math.max(0, activeScenario.noCoverage.delayYears - activeScenario.withCoverage.delayYears))) + "</div></div>" +
      '<div class="print-card"><div class="print-k">Premio attivo</div><div class="print-v">€ ' + esc(premium) + '/mese</div><div class="print-s">Coperture rilevanti ' + esc(relevantProducts.length) + "</div></div>" +
      "</div>" +
      '<div class="print-section">' +
      '<div class="print-h">Lettura consulenziale</div>' +
      '<p>' + esc(activeScenario.alertBody) + "</p>" +
      "</div>" +
      '<div class="print-section">' +
      '<div class="print-h">Coperture che fanno la differenza</div>' +
      '<div class="print-list">' +
      relevantProducts.slice(0, 4).map(function (product) {
        return '<div class="print-list-item"><strong>' + esc(shortProductLabel(product)) + '</strong><span>Premio € ' + esc(product.monthlyPremium) + '/mese · ' + esc(product.shortDescription || product.detail) + "</span></div>";
      }).join("") +
      "</div>" +
      "</div>" +
      '<div class="print-section">' +
      '<div class="print-h">Esito scenario</div>' +
      '<div class="print-table">' +
      '<div class="print-row"><span>Senza copertura</span><strong>' + esc(activeScenario.noCoverage.goalGap ? "Gap € " + currency(activeScenario.noCoverage.goalGap) : "Target pieno") + '</strong></div>' +
      '<div class="print-row"><span>Con copertura</span><strong>' + esc(activeScenario.withCoverage.goalGap ? "Gap € " + currency(activeScenario.withCoverage.goalGap) : "Target protetto") + '</strong></div>' +
      '<div class="print-row"><span>Probabilita di raggiungimento</span><strong>' + esc(activeScenario.noCoverage.achievement) + "% → " + esc(activeScenario.withCoverage.achievement) + '%</strong></div>' +
      '<div class="print-row"><span>Scenario incluso</span><strong>' + esc(activeScenario.eventLabels.join(" · ")) + "</strong></div>" +
      "</div>" +
      "</div>" +
      "</div>";
  }

  function exportScenarioPdf() {
    buildPrintReport();
    document.body.classList.add("print-mode");
    root.print();
    root.setTimeout(function () {
      document.body.classList.remove("print-mode");
    }, 400);
  }

  function handlePage2PrimaryAction() {
    var profile = readProfileFromForm();
    var selectedGoalIds = readSelectedGoalIdsFromDom();
    var options = {
      selectedCoverageIds: S.coverageTouched && S.plan ? S.plan.selectedCoverageIds.slice() : [],
      keepSliderValues: false
    };
    if (selectedGoalIds && selectedGoalIds.length) options.selectedGoalIds = selectedGoalIds;
    applyPlan(profile, options);
    goTo(3);
  }

  function newClient() {
    resetClientWorkspace(false);
    byId("chatInput").value = "";
    byId("chatInput").style.height = "auto";
    goTo(1);
  }

  function applyPlan(profile, options) {
    options = options || {};
    var questionnaireProfile = profile;
    var planOptions = {};
    if (Object.prototype.hasOwnProperty.call(options, "selectedCoverageIds")) {
      planOptions.selectedCoverageIds = options.selectedCoverageIds;
    } else if (S.plan) {
      planOptions.selectedCoverageIds = S.plan.selectedCoverageIds.slice();
    }
    if (Object.prototype.hasOwnProperty.call(options, "selectedGoalIds")) {
      planOptions.selectedGoalIds = options.selectedGoalIds;
    } else if (S.plan && S.plan.selectedGoalIds) {
      planOptions.selectedGoalIds = S.plan.selectedGoalIds.slice();
    }

    S.plan = FamilyAdvisorEngine.buildPlan(profile, planOptions);
    S.draftProfile = S.plan.profile;
    FamilyAdvisorEngine.saveProfile(S.plan.profile);

    fillFormFromProfile(questionnaireProfile || S.plan.profile);
    renderProfileSummary();
    renderGoals();
    renderCoverageTable();
    renderPremiumSummary();
    renderPage2Mode();
    updateSliderBase(options.keepSliderValues);
    refreshScenarioAnalysis();
  }

  function bindEvents() {
    ["slP", "slR", "slA"].forEach(function (id) {
      byId(id).addEventListener("input", refreshScenarioAnalysis);
    });
    root.addEventListener("afterprint", function () {
      document.body.classList.remove("print-mode");
    });
  }

  function boot() {
    bindEvents();
    resetClientWorkspace(false);
  }

  root.goTo = goTo;
  root.autoH = autoH;
  root.hKey = hKey;
  root.qS = qS;
  root.sendMsg = sendMsg;
  root.configureAi = configureAi;
  root.toggleMic = toggleMic;
  root.syncProfile = syncProfile;
  root.toggleCoverage = toggleCoverage;
  root.explainPolicyWithRag = explainPolicyWithRag;
  root.selectScenario = selectScenario;
  root.selectGoal = selectGoal;
  root.updateScenarioGoal = updateScenarioGoal;
  root.setScenarioMode = setScenarioMode;
  root.exportScenarioPdf = exportScenarioPdf;
  root.handlePage2PrimaryAction = handlePage2PrimaryAction;
  root.newClient = newClient;
  root.toggleGoalSelection = toggleGoalSelection;

  document.addEventListener("DOMContentLoaded", boot);
})(window);
