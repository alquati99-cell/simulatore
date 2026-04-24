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
    activeScenarioMode: "single",
    activeGoalId: null,
    coverageTouched: false,
    premiumOverrides: {},
    proposalLibraryOpen: false,
    isRendering: false,
    pendingTurnId: 0,
    ragInsight: null,
    chatRagInsight: null,
    questionnaireGateMessage: "",
    policyFocusByArea: {},
    policyScopeMenuByArea: {}
  };
  var INITIAL_ASSISTANT_MESSAGE = "Ciao! Scrivi quello che sai del cliente: nome, eta, famiglia, reddito mensile, casa, obiettivi. Anche due righe o appunti veloci vanno bene.";
  var AI_STORAGE_KEYS = {
    apiKey: "familyadvisor.groqApiKey",
    model: "familyadvisor.groqModel"
  };
  var DEFAULT_GROQ_MODEL = "llama-3.1-8b-instant";
  var GROQ_CHAT_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
  var AI_TIMEOUT_MS = 6500;
  var RAG_INTAKE_ENDPOINT = "https://simulatore-rag-api.alquati99.workers.dev/api/rag/intake";
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

  var FORM_NOTES_MARKER = "[familyadvisor-form-extra]";

  function parseChildrenAgesInput(value) {
    return String(value || "")
      .split(/[^0-9]+/)
      .map(function (entry) { return parseInt(entry, 10) || 0; })
      .filter(function (age) { return age > 0 && age < 30; })
      .slice(0, 8);
  }

  function readablePetLabel(value) {
    var labels = {
      cane: "Cane",
      gatto: "Gatto",
      piu_animali: "Piu animali",
      altro: "Altro animale"
    };
    return labels[value] || "";
  }

  function readableMobilityLabel(value) {
    var labels = {
      auto: "Auto",
      monopattino: "Monopattino",
      moto: "Moto",
      bici: "Bici",
      mezzi: "Mezzi pubblici",
      misto: "Auto e micromobilita"
    };
    return labels[value] || "";
  }

  function readableSportRiskLabel(value) {
    var labels = {
      nessuno: "Nessuno",
      occasionale: "Saltuario",
      regolare: "Regolare",
      intenso: "Molto frequente"
    };
    return labels[value] || "";
  }

  function readableTravelLabel(value) {
    var labels = {
      mai: "Quasi mai",
      mensile: "Qualche volta al mese",
      settimanale: "Tutte le settimane"
    };
    return labels[value] || "";
  }

  function stripGeneratedFormNotes(notes) {
    var text = String(notes || "").trim();
    var markerIndex = text.indexOf(FORM_NOTES_MARKER);
    return markerIndex >= 0 ? text.slice(0, markerIndex).trim() : text;
  }

  function buildGeneratedFormNotes(profileDraft) {
    var lines = [];
    if (profileDraft.residenceCity) lines.push("Citta di residenza: " + profileDraft.residenceCity + ".");
    if (profileDraft.partnerNetMonthlyIncome) {
      lines.push("Reddito netto partner: € " + currency(profileDraft.partnerNetMonthlyIncome) + "/mese.");
    }
    if (profileDraft.petType && profileDraft.petType !== "nessuno") {
      lines.push("Ha un animale domestico: " + readablePetLabel(profileDraft.petType) + ".");
    }
    if (profileDraft.mobilityMode) {
      if (profileDraft.mobilityMode === "monopattino") lines.push("Usa spesso il monopattino.");
      else lines.push("Mobilita principale: " + readableMobilityLabel(profileDraft.mobilityMode) + ".");
    }
    if (profileDraft.sportRiskLevel && profileDraft.sportRiskLevel !== "nessuno") {
      lines.push("Sport o hobby a rischio: " + readableSportRiskLabel(profileDraft.sportRiskLevel) + ".");
    }
    if (profileDraft.travelFrequency && profileDraft.travelFrequency !== "mai") {
      lines.push("Viaggi di lavoro: " + readableTravelLabel(profileDraft.travelFrequency) + ".");
    }
    return lines.join(" ");
  }

  function mergeGeneratedFormNotes(existingNotes, profileDraft) {
    var base = stripGeneratedFormNotes(existingNotes);
    var generated = buildGeneratedFormNotes(profileDraft);
    return [base, generated ? FORM_NOTES_MARKER + "\n" + generated : ""].filter(Boolean).join("\n").trim();
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

  function compactProductLabel(product) {
    var profile = S.plan ? S.plan.profile : {};
    var labels = {
      tcm: profile && (profile.childrenCount || profile.spouseName) ? "Tutela famiglia" : "Tutela capitale",
      income_protection: "Protegge reddito",
      rc_family: profile && profile.housingStatus !== "Affittuario" ? "Casa e responsabilita" : "Responsabilita civile",
      ltc: "Long term care",
      health: "Spese salute",
      accident: "Copre infortuni",
      mortgage: "Protegge mutuo"
    };
    return labels[product.id] || product.shortDescription || product.name;
  }

  function compactProductMetric(product) {
    var amount = Math.max(0, product.coverAmount || 0);
    if (product.id === "income_protection" || product.id === "ltc") {
      return "Rendita € " + currency(amount) + "/mese";
    }
    if (product.id === "tcm") {
      return "Capitale € " + currency(amount);
    }
    if (product.id === "rc_family") {
      return "Massimale € " + currency(amount);
    }
    if (product.id === "health") {
      return "Spese fino a € " + currency(amount);
    }
    if (product.id === "accident") {
      return "Indennizzo € " + currency(amount);
    }
    if (product.id === "mortgage") {
      return "Debito € " + currency(amount);
    }
    return "";
  }

  function compactDeductibleLabel(product) {
    return product.deductibleRate ? "Detraibile 19%" : "Non detraibile";
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

  function durationLabelFromMonths(months) {
    if (!months) return "";
    if (months < 12) return months + " mesi";
    var years = Math.round(months / 12);
    return years === 1 ? "1 anno" : years + " anni";
  }

  function impactSummaryLine(entry) {
    if (!entry) return "";
    var parts = [];
    if (entry.upfrontLoss) parts.push("€ " + currency(entry.upfrontLoss) + " subito");
    if (entry.monthlyLoss) {
      parts.push("€ " + currency(entry.monthlyLoss) + "/mese" + (entry.durationMonths ? " per " + durationLabelFromMonths(entry.durationMonths) : ""));
    }
    return parts.join(" + ") || "nessuna perdita stimata";
  }

  function supportSummaryLine(entry) {
    if (!entry) return "";
    var parts = [];
    if (entry.upfront) parts.push("€ " + currency(entry.upfront) + " subito");
    if (entry.monthly) {
      parts.push("€ " + currency(entry.monthly) + "/mese" + (entry.durationMonths ? " per " + durationLabelFromMonths(entry.durationMonths) : ""));
    }
    return parts.join(" + ") || "nessun recupero";
  }

  function groupedSupportEntries(activeScenario) {
    var groups = {};
    ((activeScenario && activeScenario.supportBreakdown) || []).forEach(function (entry) {
      var groupKey = entry.sourceId || entry.productId;
      if (!groups[groupKey]) {
        groups[groupKey] = {
          productId: groupKey,
          productName: entry.productName + (entry.solutionName ? " · " + entry.solutionName : ""),
          upfront: 0,
          monthly: 0,
          durationMonths: 0,
          scenarioLabels: []
        };
      }
      groups[groupKey].upfront += entry.upfront || 0;
      groups[groupKey].monthly += entry.monthly || 0;
      groups[groupKey].durationMonths = Math.max(groups[groupKey].durationMonths, entry.durationMonths || 0);
      if (groups[groupKey].scenarioLabels.indexOf(entry.scenarioLabel) < 0) {
        groups[groupKey].scenarioLabels.push(entry.scenarioLabel);
      }
    });

    return Object.keys(groups).map(function (key) {
      return groups[key];
    }).sort(function (left, right) {
      return (right.upfront + right.monthly * Math.max(1, right.durationMonths)) - (left.upfront + left.monthly * Math.max(1, left.durationMonths));
    });
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
    if (score >= 60) return { label: "Alta", key: "high" };
    if (score >= 45) return { label: "Media", key: "medium" };
    return { label: "Bassa", key: "low" };
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

  function cloneOfferSelections(offerSelections) {
    if (!offerSelections) return null;
    try {
      return JSON.parse(JSON.stringify(offerSelections));
    } catch (error) {
      return null;
    }
  }

  function currentOfferSelections() {
    return S.plan && S.plan.offerSelections ? cloneOfferSelections(S.plan.offerSelections) : null;
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
      offerSelections: currentOfferSelections(),
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
      offerSelections: currentOfferSelections(),
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

  function fieldHasValue(id, allowZero) {
    var node = byId(id);
    if (!node) return false;
    var value = String(node.value == null ? "" : node.value).trim();
    if (allowZero && value === "0") return true;
    return value !== "";
  }

  function inferGenderFromName(name) {
    var firstName = normalizeNameToken(name);
    if (!firstName) return "neutral";

    var femaleNames = {
      giulia: true, chiara: true, sara: true, martina: true, francesca: true,
      anna: true, alessia: true, valentina: true, silvia: true, laura: true,
      federica: true, eleonora: true, elena: true, claudia: true, beatrice: true
    };
    var maleNames = {
      marco: true, matteo: true, luca: true, andrea: true, francesco: true,
      alessandro: true, davide: true, stefano: true, giuseppe: true, simone: true,
      nicola: true, fabio: true, emanuele: true, filippo: true, carlo: true
    };

    if (femaleNames[firstName]) return "female";
    if (maleNames[firstName]) return "male";
    if (/a$/.test(firstName) && !/luca|andrea|nicola|mattia|elia/.test(firstName)) return "female";
    if (/o$|e$|i$/.test(firstName)) return "male";
    return "neutral";
  }

  function normalizeNameToken(name) {
    return String(name || "")
      .trim()
      .split(/\s+/)[0]
      .toLowerCase()
      .replace(/[^a-zà-ÿ]/g, "");
  }

  function resolvedQuestionnaireGender() {
    var genderNode = byId("fGender");
    if (!genderNode) return "neutral";
    if (genderNode.dataset.manual === "1" && genderNode.value) return genderNode.value;
    return inferGenderFromName(byId("fNome") ? byId("fNome").value : "");
  }

  function questionnaireCompletionState() {
    var maritalStatus = byId("fSt") ? byId("fSt").value : "";
    var hasPartner =
      maritalStatus === "Sposato" ||
      maritalStatus === "Convivente" ||
      fieldHasValue("fSpouseName") ||
      fieldHasValue("fPartnerIncome");
    var childrenAges = parseChildrenAgesInput(byId("fChildrenAges") ? byId("fChildrenAges").value : "");
    var childrenCount = parseInt((byId("fFi") && byId("fFi").value) || "", 10) || childrenAges.length || 0;
    var required = [
      { id: "fNome", label: "Nome e cognome", complete: fieldHasValue("fNome") },
      { id: "fEta", label: "Eta o data di nascita", complete: fieldHasValue("fEta") || fieldHasValue("fDOB") },
      { id: "fCity", label: "Citta di residenza", complete: fieldHasValue("fCity") },
      { id: "fSt", label: "Stato civile", complete: fieldHasValue("fSt") },
      { id: "fProfession", label: "Professione", complete: fieldHasValue("fProfession") },
      { id: "fAb", label: "Situazione abitativa", complete: fieldHasValue("fAb") },
      { id: "fRnet", label: "Reddito cliente", complete: fieldHasValue("fRnet") },
      { id: "fRi", label: "Risparmio o patrimonio", complete: fieldHasValue("fRi") || fieldHasValue("fPat") }
    ];
    var optional = [
      { id: "fSpouseName", label: "Nome partner", relevant: hasPartner, complete: !hasPartner || fieldHasValue("fSpouseName") },
      { id: "fPartnerIncome", label: "Reddito partner", relevant: hasPartner, complete: !hasPartner || fieldHasValue("fPartnerIncome") },
      { id: "fChildrenAges", label: "Eta figli", relevant: childrenCount > 0, complete: !(childrenCount > 0) || fieldHasValue("fChildrenAges") },
      { id: "fPet", label: "Animali domestici", relevant: true, complete: fieldHasValue("fPet") },
      { id: "fVehicle", label: "Mobilita personale", relevant: true, complete: fieldHasValue("fVehicle") },
      { id: "fSportRisk", label: "Sport / hobby a rischio", relevant: true, complete: fieldHasValue("fSportRisk") },
      { id: "fTravel", label: "Viaggi per lavoro", relevant: true, complete: fieldHasValue("fTravel") }
    ];
    var requiredCompleted = required.filter(function (entry) { return entry.complete; }).length;
    var optionalRelevant = optional.filter(function (entry) { return entry.relevant !== false; });
    var optionalCompleted = optionalRelevant.filter(function (entry) { return entry.complete; }).length;
    var totalWeight = required.length * 2 + optionalRelevant.length;
    var nextRequired = required.find(function (entry) { return !entry.complete; });
    return {
      required: required,
      optional: optional,
      requiredCompleted: requiredCompleted,
      requiredTotal: required.length,
      requiredMissing: required.filter(function (entry) { return !entry.complete; }).map(function (entry) { return entry.label; }),
      optionalCompleted: optionalCompleted,
      optionalTotal: optionalRelevant.length,
      optionalPending: optionalRelevant.filter(function (entry) { return !entry.complete; }).map(function (entry) { return entry.label; }),
      completion: totalWeight ? Math.round(((requiredCompleted * 2) + optionalCompleted) / totalWeight * 100) : 0,
      nextRequiredFieldId: nextRequired ? nextRequired.id : "",
      hasPartner: hasPartner,
      childrenCount: childrenCount
    };
  }

  function completionAvatarSvg(gender, completion) {
    var bodyPath = gender === "female"
      ? "M59 82c-11 0-20 9-20 20v24c0 8 6 14 14 14h10l-16 78c-2 10 4 18 13 19 8 1 15-4 17-12l5-28 5 28c2 8 9 13 17 12 9-1 15-9 13-19l-16-78h10c8 0 14-6 14-14v-24c0-11-9-20-20-20H59Z"
      : gender === "male"
        ? "M57 82c-12 0-22 10-22 22v34c0 10 8 18 18 18h7l-10 66c-1 10 5 18 15 19 8 1 15-5 16-13l9-55 9 55c1 8 8 14 16 13 10-1 16-9 15-19l-10-66h7c10 0 18-8 18-18v-34c0-12-10-22-22-22H57Z"
        : "M58 82c-11 0-21 10-21 21v30c0 10 8 17 17 17h8l-12 72c-2 9 4 17 13 18 8 1 14-4 16-12l8-50 8 50c2 8 8 13 16 12 9-1 15-9 13-18l-12-72h8c9 0 17-7 17-17v-30c0-11-10-21-21-21H58Z";
    var fillTop = 236 - Math.round(clamp(completion, 0, 100) * 1.72);
    var fillHeight = 260 - fillTop;
    var waveY = fillTop + 8;
    return '' +
      '<svg viewBox="0 0 160 260" aria-hidden="true">' +
      '<defs>' +
      '<linearGradient id="profileWater" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a7deff"></stop><stop offset="100%" stop-color="#3566df"></stop></linearGradient>' +
      '<clipPath id="profileFigureClip">' +
      '<circle cx="80" cy="44" r="24"></circle>' +
      '<path d="' + bodyPath + '"></path>' +
      '</clipPath>' +
      '</defs>' +
      '<g clip-path="url(#profileFigureClip)">' +
      '<rect x="0" y="0" width="160" height="260" fill="#f8fbff"></rect>' +
      '<rect x="0" y="' + fillTop + '" width="160" height="' + fillHeight + '" fill="url(#profileWater)"></rect>' +
      '<path d="M-10 ' + waveY + ' C 18 ' + (waveY - 8) + ', 46 ' + (waveY + 8) + ', 74 ' + waveY + ' S 128 ' + (waveY - 10) + ', 170 ' + waveY + ' L 170 260 L -10 260 Z" fill="rgba(255,255,255,.52)"></path>' +
      '</g>' +
      '<circle cx="80" cy="44" r="24" fill="none" stroke="currentColor" stroke-width="8"></circle>' +
      '<path d="' + bodyPath + '" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"></path>' +
      (gender === "female"
        ? '<path d="M60 96c7 5 14 8 20 8s13-3 20-8" fill="none" stroke="currentColor" stroke-width="4" opacity=".16" stroke-linecap="round"></path>'
        : gender === "male"
          ? '<path d="M60 97h40" fill="none" stroke="currentColor" stroke-width="4" opacity=".16" stroke-linecap="round"></path>'
          : "") +
      '</svg>';
  }

  function renderQuestionnaireProgressCard() {
    var card = byId("questionnaireProgressCard");
    if (!card) return;

    var state = questionnaireCompletionState();
    var gender = resolvedQuestionnaireGender();
    var profileName = byId("fNome") && byId("fNome").value.trim() ? byId("fNome").value.trim() : "cliente";
    var completion = clamp(state.completion, 0, 100);
    var requiredRows = state.required.map(function (entry) {
      return '<div class="profile-progress-row' + (entry.complete ? " on" : "") + '"><strong>' + esc(entry.label) + '</strong><span>' + esc(entry.complete ? "ok" : "manca") + "</span></div>";
    }).join("");
    var optionalRows = state.optional.map(function (entry) {
      var rowState = entry.relevant === false ? " na" : entry.complete ? " on" : "";
      var rowLabel = entry.relevant === false ? "n/a" : entry.complete ? "ok" : "vuoto";
      return '<div class="profile-progress-row' + rowState + '"><strong>' + esc(entry.label) + '</strong><span>' + esc(rowLabel) + "</span></div>";
    }).join("");
    var footText = state.requiredMissing.length
      ? "Per simulare bene servono ancora: " + joinReadableList(state.requiredMissing) + "."
      : state.optionalPending.length
        ? "Base completa. Se vuoi una lettura piu ricca, aggiungi ancora: " + joinReadableList(state.optionalPending) + "."
        : "Profilo completo: puoi entrare negli scenari con una scheda molto piu solida.";

    card.innerHTML =
      '<div class="profile-progress-ey">Lettura visiva del profilo</div>' +
      '<div class="profile-progress-head">' +
      '<div><div class="profile-progress-title">Scheda di ' + esc(profileName) + '</div><div class="profile-progress-copy">La sagoma si riempie come un bicchiere di acqua: prima chiudi la base obbligatoria, poi arricchisci il profilo con dettagli di famiglia e vita quotidiana.</div></div>' +
      '<div class="profile-progress-percent">' + esc(completion) + '%</div>' +
      '</div>' +
      '<div class="profile-progress-visual ' + esc(gender) + '">' +
      '<div class="profile-progress-figure-shell">' +
      '<div class="profile-progress-figure-level">Livello ' + esc(completion) + '%</div>' +
      '<div class="profile-progress-illustration">' + completionAvatarSvg(gender, completion) + "</div>" +
      "</div></div>" +
      '<div class="profile-progress-water-note">Piu informazioni inserisci, piu sale il livello della figura.</div>' +
      '<div class="profile-progress-gender">' +
      '<button type="button" class="' + (gender === "neutral" ? "on" : "") + '" onclick="setVisualGender(\'auto\')">Auto</button>' +
      '<button type="button" class="' + (gender === "female" ? "on" : "") + '" onclick="setVisualGender(\'female\')">Donna</button>' +
      '<button type="button" class="' + (gender === "male" ? "on" : "") + '" onclick="setVisualGender(\'male\')">Uomo</button>' +
      "</div>" +
      '<div class="profile-progress-kpis">' +
      '<div class="profile-progress-kpi"><span>Base obbligatoria</span><strong>' + esc(state.requiredCompleted) + "/" + esc(state.requiredTotal) + "</strong></div>" +
      '<div class="profile-progress-kpi"><span>Extra utili</span><strong>' + esc(state.optionalCompleted) + "/" + esc(state.optionalTotal) + "</strong></div>" +
      "</div>" +
      (S.questionnaireGateMessage ? '<div class="profile-progress-alert">' + esc(S.questionnaireGateMessage) + "</div>" : "") +
      '<div class="profile-progress-section"><div class="profile-progress-section-title">Campi obbligatori</div><div class="profile-progress-list">' + requiredRows + "</div></div>" +
      '<div class="profile-progress-section"><div class="profile-progress-section-title">Domande extra</div><div class="profile-progress-list">' + optionalRows + "</div></div>" +
      '<div class="profile-progress-foot">' +
      esc(footText) +
      "</div>";
  }

  function setVisualGender(gender) {
    var node = byId("fGender");
    if (!node) return;
    if (gender === "female" || gender === "male") {
      node.value = gender;
      node.dataset.manual = "1";
    } else {
      node.value = "";
      node.dataset.manual = "0";
    }
    renderQuestionnaireProgressCard();
  }

  function ensureQuestionnaireBaseReady() {
    var state = questionnaireCompletionState();
    var card = byId("questionnaireProgressCard");
    if (!state.requiredMissing.length) {
      S.questionnaireGateMessage = "";
      renderQuestionnaireProgressCard();
      return true;
    }

    S.questionnaireGateMessage = "Compila prima i campi obbligatori: " + joinReadableList(state.requiredMissing) + ".";
    renderQuestionnaireProgressCard();

    if (state.nextRequiredFieldId && byId(state.nextRequiredFieldId) && typeof byId(state.nextRequiredFieldId).focus === "function") {
      byId(state.nextRequiredFieldId).focus();
    }
    if (card && typeof card.scrollIntoView === "function") {
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return false;
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
      tcm: profile.childrenCount || profile.spouseName ? "Capitale immediato alla famiglia" : "Protegge il capitale del piano",
      income_protection: "Sostiene il piano se il reddito si ferma",
      accident: "Riduce lo stop da infortunio",
      rc_family: profile.housingStatus !== "Affittuario" ? "Tutela casa, terzi e vita privata" : "Tutela i danni verso terzi",
      ltc: "Riduce il peso dell'assistenza futura",
      health: "Assorbe spese mediche straordinarie",
      mortgage: "Tiene in piedi il progetto casa"
    };

    if (product.id === "rc_family" && activeScenario && activeScenario.id === "home_damage") {
      return "La piu coerente sul rischio casa";
    }
    if (product.id === "income_protection" && activeScenario && activeScenario.id === "income_stop") {
      return "La leva chiave sul blocco reddito";
    }
    if (product.id === "accident" && activeScenario && relevantScenarioIds(activeScenario).indexOf("ip") >= 0) {
      return "Rinforza la protezione da infortunio";
    }
    if (product.id === "tcm" && activeScenario && activeScenario.id === "death") {
      return "Trasforma il decesso in capitale";
    }
    return reasons[product.id] || compactProductLabel(product);
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

  function resetRagInsight() {
    S.ragInsight = null;
  }

  function currentActiveScenario() {
    var collection = currentScenarioCollection();
    return collection ? collection[S.activeScenarioId] : null;
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

  async function requestRag(payload, endpoint, timeoutMs) {
    if (typeof root.fetch !== "function") {
      throw new Error("Fetch non disponibile in questo browser");
    }

    var controller = typeof root.AbortController === "function" ? new root.AbortController() : null;
    var timeoutId = controller ? root.setTimeout(function () { controller.abort(); }, timeoutMs || RAG_INTAKE_TIMEOUT_MS) : 0;

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

  function formatSavedAt(value) {
    if (!value) return "";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function goalDisplayLabel(goal) {
    if (!goal) return "";
    var labels = {
      retirement: "Pensione",
      home: "Casa",
      education: "Studi figli",
      emergency: "Emergenze",
      wealth: "Capitale"
    };
    return goal.name || labels[goal.id] || goal.id || "";
  }

  function savedClientMeta(profile) {
    var current = profile || {};
    var parts = [];
    if (current.age) parts.push(current.age + " anni");
    if (current.profession) parts.push(current.profession);
    if (current.maritalStatus) parts.push(current.maritalStatus);
    if (current.childrenCount) parts.push(current.childrenCount + " figli");
    if (current.housingStatus) parts.push(current.housingStatus);
    return parts.join(" · ");
  }

  function savedClientFinancialLine(profile) {
    var current = profile || {};
    var parts = [];
    if (current.netMonthlyIncome) parts.push("Reddito € " + currency(current.netMonthlyIncome) + "/mese");
    if (current.totalAssets) parts.push("Patrimonio € " + currency(current.totalAssets));
    if (current.monthlySavings) parts.push("Risparmio € " + currency(current.monthlySavings) + "/mese");
    return parts.join(" · ");
  }

  function renderSavedClientsLibrary() {
    var panel = byId("savedClientsLibrary");
    var countBadge = byId("savedClientsCount");
    if (!panel) return;

    var profiles = FamilyAdvisorEngine.listStoredProfiles ? FamilyAdvisorEngine.listStoredProfiles() : [];
    if (countBadge) {
      countBadge.textContent = profiles.length
        ? profiles.length + " client" + (profiles.length === 1 ? "e" : "i") + " salvat" + (profiles.length === 1 ? "o" : "i")
        : "Archivio vuoto";
    }

    if (!profiles.length) {
      panel.innerHTML =
        '<div class="saved-clients-empty">' +
        '<strong>Nessun cliente salvato per ora</strong>' +
        '<p>Appena compili o verifichi un profilo, lo ritrovi qui e puoi riaprirlo per continuare la consulenza.</p>' +
        '<button class="proposal-btn primary" onclick="goTo(1)">Inizia un nuovo cliente</button>' +
        "</div>";
      return;
    }

    panel.innerHTML = profiles.map(function (profile) {
      var meta = savedClientMeta(profile);
      var financialLine = savedClientFinancialLine(profile);
      var goals = (profile.goals || []).filter(function (goal) {
        return goal && goal.id && goal.enabled !== false;
      });
      var goalMarkup = goals.length
        ? goals.slice(0, 4).map(function (goal) {
            return '<span class="saved-client-goal">' + esc(goalDisplayLabel(goal)) + "</span>";
          }).join("")
        : '<span class="saved-client-goal muted">Obiettivi da completare</span>';

      return (
        '<article class="saved-client-card">' +
        '<div class="saved-client-top">' +
        '<div><div class="saved-client-name">' + esc(profile.name || "Cliente senza nome") + '</div><div class="saved-client-meta">' + esc(meta || "Profilo salvato in locale e pronto da riprendere") + "</div></div>" +
        '<div class="saved-client-date">' + esc(formatSavedAt(profile.savedAt) || "Ora") + "</div>" +
        "</div>" +
        '<div class="saved-client-copy">' + esc(financialLine || "Apri il profilo per verificare dati, obiettivi e coperture.") + "</div>" +
        '<div class="saved-client-goals">' + goalMarkup + "</div>" +
        '<div class="saved-client-actions">' +
        '<span class="saved-client-inline">Ultimo salvataggio locale del consulente</span>' +
        '<button class="proposal-btn primary" onclick="loadSavedClient(\'' + esc(profile.savedAt || "") + '\')">Apri e modifica</button>' +
        "</div>" +
        "</article>"
      );
    }).join("");
  }

  function renderProposalShelf() {
    var shelf = byId("proposalShelf");
    if (!shelf) return;
    var proposals = FamilyAdvisorEngine.listStoredProposals ? FamilyAdvisorEngine.listStoredProposals() : [];

    shelf.innerHTML =
      '<div class="proposal-shelf-head">' +
      '<div><div class="proposal-shelf-ey">Post vendita essenziale</div><div class="proposal-shelf-title">Salva e riprendi le proposte offline</div></div>' +
      '<div class="proposal-shelf-actions">' +
      '<button class="proposal-btn primary" onclick="saveCurrentProposal()">Salva proposta</button>' +
      '<button class="proposal-btn" onclick="toggleProposalLibrary()">' + esc(S.proposalLibraryOpen ? "Chiudi archivio" : "Riprendi proposta") + "</button>" +
      "</div></div>" +
      '<div class="proposal-shelf-copy">Le proposte restano salvate in locale sul dispositivo del consulente e possono essere riaperte per una nuova trattativa.</div>' +
      (
        S.proposalLibraryOpen
          ? (
              proposals.length
                ? '<div class="proposal-list">' + proposals.slice(0, 10).map(function (proposal) {
                    var clientName = (proposal.profile && proposal.profile.name) || "Cliente";
                    return (
                      '<button class="proposal-card" onclick="loadProposal(\'' + esc(proposal.id) + '\')">' +
                      '<div class="proposal-card-top"><div class="proposal-card-name">' + esc(clientName) + '</div><div class="proposal-card-date">' + esc(formatSavedAt(proposal.savedAt)) + "</div></div>" +
                      '<div class="proposal-card-meta">' +
                      '<span>' + esc((proposal.selectedGoalIds || []).length) + " obiettivi</span>" +
                      '<span>' + esc((proposal.selectedCoverageIds || []).length) + " coperture</span>" +
                      '<span>€ ' + esc(currency((proposal.snapshot && proposal.snapshot.totalPremium) || 0)) + '/mese</span>' +
                      "</div>" +
                      "</button>"
                    );
                  }).join("") + "</div>"
                : '<div class="proposal-empty">Nessuna proposta salvata per ora.</div>'
            )
          : ""
      );
  }

  function renderPersonaInsight() {
    var panel = byId("personaInsight");
    if (!panel) return;
    if (!S.plan || !S.plan.persona) {
      panel.innerHTML = "";
      return;
    }

    var persona = S.plan.persona;
    var distribution = (S.plan.personaDistribution || []).slice(0, 6);
    panel.innerHTML =
      '<div class="persona-shell">' +
      '<div class="persona-main">' +
      '<div class="persona-ey">Persona profilo tipo</div>' +
      '<div class="persona-title">' + esc(persona.name) + '</div>' +
      '<div class="persona-copy">' + esc(persona.headline || persona.description || "") + "</div>" +
      '<div class="persona-stats">' +
      '<div class="persona-stat"><div class="persona-k">Distribuzione Italia</div><div class="persona-v">' + esc(String(persona.sharePct || 0).replace(".", ",")) + '%</div></div>' +
      '<div class="persona-stat"><div class="persona-k">Reddito tipo</div><div class="persona-v">€ ' + esc(currency((persona.typicalAnnualIncome || 0) / 12)) + '/mese</div></div>' +
      '<div class="persona-stat"><div class="persona-k">Patrimonio tipo</div><div class="persona-v">€ ' + esc(currency(persona.typicalWealth || 0)) + "</div></div>" +
      "</div>" +
      '<div class="persona-note">Fatte 100 famiglie simili in Italia, circa <strong>' + esc(String(Math.round(persona.sharePct || 0))) + "</strong> hanno questa configurazione.</div>" +
      "</div>" +
      '<div class="persona-dist">' + distribution.map(function (entry) {
        return '<span class="persona-chip' + (entry.id === persona.id ? " on" : "") + '">' + esc(entry.name) + " " + esc(String(entry.sharePct || 0).replace(".", ",")) + '%</span>';
      }).join("") + "</div>" +
      "</div>";
  }

  function toggleProposalLibrary() {
    S.proposalLibraryOpen = !S.proposalLibraryOpen;
    renderProposalShelf();
  }

  function saveCurrentProposal() {
    var profile = readProfileFromForm();
    var selectedGoalIds = readSelectedGoalIdsFromDom() || selectedGoalIdsFromPlan();
    var selectedCoverageIds = S.plan ? S.plan.selectedCoverageIds.slice() : [];
    applyPlan(profile, {
      selectedGoalIds: selectedGoalIds,
      selectedCoverageIds: selectedCoverageIds,
      premiumOverrides: Object.assign({}, S.premiumOverrides),
      offerSelections: currentOfferSelections(),
      keepSliderValues: true
    });
    FamilyAdvisorEngine.saveProposal({
      title: (S.plan.profile.name || "Cliente") + " · proposta",
      profile: S.plan.profile,
      selectedGoalIds: S.plan.selectedGoalIds,
      selectedCoverageIds: S.plan.selectedCoverageIds,
      premiumOverrides: S.plan.premiumOverrides || S.premiumOverrides,
      offerSelections: cloneOfferSelections(S.plan.offerSelections),
      snapshot: S.plan.snapshot,
      persona: S.plan.persona
    });
    S.proposalLibraryOpen = true;
    renderProposalShelf();
  }

  function loadProposal(proposalId) {
    var proposals = FamilyAdvisorEngine.listStoredProposals ? FamilyAdvisorEngine.listStoredProposals() : [];
    var proposal = proposals.find(function (entry) { return entry.id === proposalId; });
    if (!proposal) return;
    S.premiumOverrides = Object.assign({}, proposal.premiumOverrides || {});
    S.proposalLibraryOpen = false;
    S.draftProfile = proposal.profile || FamilyAdvisorEngine.createEmptyProfile();
    applyPlan(proposal.profile || {}, {
      selectedGoalIds: (proposal.selectedGoalIds || []).slice(),
      selectedCoverageIds: (proposal.selectedCoverageIds || []).slice(),
      premiumOverrides: Object.assign({}, S.premiumOverrides),
      offerSelections: cloneOfferSelections(proposal.offerSelections),
      keepSliderValues: true
    });
    goTo(2);
    renderProposalShelf();
  }

  function loadSavedClient(savedAt) {
    var profiles = FamilyAdvisorEngine.listStoredProfiles ? FamilyAdvisorEngine.listStoredProfiles() : [];
    var profile = profiles.find(function (entry) { return entry.savedAt === savedAt; });
    if (!profile) return;

    var selectedGoalIds = (profile.goals || []).filter(function (goal) {
      return goal && goal.id && goal.enabled !== false;
    }).map(function (goal) {
      return goal.id;
    });
    var planOptions = {
      keepSliderValues: true
    };

    if (selectedGoalIds.length) planOptions.selectedGoalIds = selectedGoalIds;

    S.premiumOverrides = {};
    S.proposalLibraryOpen = false;
    S.chatRagInsight = null;
    S.ragInsight = null;
    S.policyFocusByArea = {};
    S.policyScopeMenuByArea = {};
    S.draftProfile = profile;
    applyPlan(profile, planOptions);
    goTo(2);
    renderSavedClientsLibrary();
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

  function chartLibraryAvailable() {
    return typeof root.Chart === "function";
  }

  function resetCanvasSurface(canvas) {
    if (!canvas || typeof canvas.getContext !== "function") return null;
    var rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    var width = Math.max(280, Math.round((rect && rect.width) || canvas.clientWidth || (canvas.parentNode && canvas.parentNode.clientWidth) || 320));
    var height = Math.max(180, Math.round((rect && rect.height) || canvas.clientHeight || (canvas.parentNode && canvas.parentNode.clientHeight) || 240));
    var dpr = root.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    var ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    return {
      ctx: ctx,
      width: width,
      height: height
    };
  }

  function compactChartCurrency(value) {
    if (!Number.isFinite(value)) return "€0";
    if (Math.abs(value) >= 1000) return "€" + Math.round(value / 1000) + "k";
    return "€" + Math.round(value);
  }

  function traceDatasetPath(ctx, points) {
    points.forEach(function (point, index) {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
  }

  function renderLineChartFallback(canvas, config) {
    var surface = resetCanvasSurface(canvas);
    if (!surface) {
      return { destroy: function () {} };
    }

    var ctx = surface.ctx;
    var width = surface.width;
    var height = surface.height;
    var chartArea = {
      left: 44,
      top: 18,
      right: width - 16,
      bottom: height - 28
    };
    var datasets = (config.datasets || []).filter(function (dataset) {
      return dataset && dataset.data && dataset.data.length;
    });
    var values = datasets.reduce(function (all, dataset) {
      return all.concat(dataset.data.filter(function (value) { return Number.isFinite(value); }));
    }, []);

    if (!values.length) {
      ctx.save();
      ctx.fillStyle = "#73859a";
      ctx.font = "600 12px Outfit";
      ctx.textAlign = "center";
      ctx.fillText("Grafico non disponibile", width / 2, height / 2);
      ctx.restore();
      return {
        destroy: function () {
          ctx.clearRect(0, 0, width, height);
        }
      };
    }

    var minValue = config.beginAtZero ? 0 : Math.min.apply(null, values);
    var maxValue = Math.max.apply(null, values.concat(config.beginAtZero ? [0] : []));
    if (minValue === maxValue) {
      var delta = Math.max(1, Math.abs(maxValue) * 0.12);
      minValue -= delta;
      maxValue += delta;
    }
    if (!config.beginAtZero) {
      var span = maxValue - minValue;
      minValue = Math.max(0, minValue - span * 0.08);
      maxValue += span * 0.08;
    }

    var range = Math.max(1, maxValue - minValue);
    var labelCount = Math.max(1, (config.labels || []).length);
    var xStep = labelCount > 1 ? (chartArea.right - chartArea.left) / (labelCount - 1) : 0;

    function xAt(index) {
      return chartArea.left + xStep * index;
    }

    function yAt(value) {
      return chartArea.bottom - ((value - minValue) / range) * (chartArea.bottom - chartArea.top);
    }

    if (typeof config.eventIndex === "number" && labelCount > 0) {
      var eventX = xAt(clamp(config.eventIndex, 0, labelCount - 1));
      ctx.save();
      ctx.fillStyle = "rgba(255,90,112,.05)";
      ctx.fillRect(eventX, chartArea.top, Math.max(0, chartArea.right - eventX), chartArea.bottom - chartArea.top);
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = "rgba(255,90,112,.65)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(eventX, chartArea.top);
      ctx.lineTo(eventX, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      if (config.eventLabel) {
        ctx.fillStyle = "#ff5a70";
        ctx.font = "700 10px Outfit";
        ctx.fillText(config.eventLabel, Math.min(eventX + 10, chartArea.right - 70), chartArea.top + 14);
      }
      ctx.restore();
    }

    var gridLines = 4;
    ctx.save();
    ctx.strokeStyle = "rgba(213,224,240,.7)";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#7588a2";
    ctx.font = "500 10px Outfit";
    for (var row = 0; row <= gridLines; row += 1) {
      var ratio = row / gridLines;
      var y = chartArea.bottom - ratio * (chartArea.bottom - chartArea.top);
      var tickValue = minValue + ratio * range;
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
      ctx.fillText(compactChartCurrency(tickValue), 4, y + 3);
    }

    var tickStep = Math.max(1, Math.ceil(labelCount / 6));
    (config.labels || []).forEach(function (label, index) {
      if (index % tickStep !== 0 && index !== labelCount - 1) return;
      ctx.fillText(String(label), xAt(index) - 12, height - 8);
    });
    ctx.restore();

    datasets.forEach(function (dataset) {
      var points = dataset.data.map(function (value, index) {
        return {
          x: xAt(index),
          y: yAt(value),
          value: value
        };
      });
      if (!points.length) return;

      if (dataset.fill) {
        ctx.save();
        ctx.beginPath();
        traceDatasetPath(ctx, points);
        ctx.lineTo(points[points.length - 1].x, chartArea.bottom);
        ctx.lineTo(points[0].x, chartArea.bottom);
        ctx.closePath();
        ctx.fillStyle = dataset.areaFill || "rgba(49,94,172,.12)";
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.beginPath();
      traceDatasetPath(ctx, points);
      ctx.strokeStyle = dataset.borderColor || "#315eac";
      ctx.lineWidth = dataset.borderWidth || 2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.setLineDash(dataset.borderDash || []);
      ctx.stroke();
      ctx.setLineDash([]);

      if (typeof dataset.highlightIndex === "number" && points[dataset.highlightIndex]) {
        var point = points[dataset.highlightIndex];
        ctx.fillStyle = dataset.pointColor || dataset.borderColor || "#315eac";
        ctx.beginPath();
        ctx.arc(point.x, point.y, dataset.pointRadius || 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });

    return {
      destroy: function () {
        var clear = canvas.getContext("2d");
        if (clear) clear.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
  }

  function goTo(pageNumber) {
    if (pageNumber === 3 && !S.plan) {
      pageNumber = S.draftProfile ? 2 : 1;
    }
    if (pageNumber === 3 && (S.plan || S.draftProfile) && !ensureQuestionnaireBaseReady()) {
      pageNumber = 2;
    }
    var stepPage = pageNumber === 4
      ? ((S.page >= 1 && S.page <= 3) ? S.page : (S.plan || S.draftProfile ? 2 : 1))
      : pageNumber;
    for (var i = 1; i <= 4; i += 1) {
      var page = byId("p" + i);
      if (page) page.classList.toggle("on", i === pageNumber);
      if (i > 3) continue;
      var navItem = byId("n" + i);
      if (!navItem) continue;
      navItem.className = "ns" + (i === stepPage ? " on" : i < stepPage ? " dn" : "");
      navItem.querySelector(".nn").textContent = i < stepPage ? "✓" : i;
    }
    var libraryButton = byId("clientsLibraryBtn");
    if (libraryButton) libraryButton.classList.toggle("on", pageNumber === 4);
    S.page = pageNumber;
    if (root.document && root.document.body) {
      root.document.body.setAttribute("data-page", String(pageNumber));
    }
    if (typeof root.scrollTo === "function") {
      root.scrollTo({ top: 0, behavior: "smooth" });
    }
    if (pageNumber === 2) renderPage2Mode();
    if (pageNumber === 3) refreshScenarioAnalysis();
    if (pageNumber === 4) renderSavedClientsLibrary();
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
      "questionnaireProgressCard",
      "goalGrid",
      "proposalShelf",
      "savedClientsLibrary",
      "personaInsight",
      "scenarioModeTabs",
      "bundleGrid",
      "eventGrid",
      "impactStage",
      "coverageTableBody",
      "goalFocusGrid",
      "goalGaugeGrid",
      "coverageSummaryBand",
      "policyProductGrid",
      "scenarioSimpleIntro",
      "simplePathLabel",
      "simpleGapLabel",
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
      "policyConfigBadge",
      "savedClientsCount",
      "p3ClientName",
      "p3GoalName"
    ].forEach(function (id) {
      var node = byId(id);
      if (node) node.textContent = "";
    });

    [
      ["fNome", ""],
      ["fGender", ""],
      ["fDOB", ""],
      ["fEta", ""],
      ["fCity", ""],
      ["fSt", "Single"],
      ["fSpouseName", ""],
      ["fSpouseAge", ""],
      ["fPartnerIncome", ""],
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
      ["fFixed", ""],
      ["fPet", ""],
      ["fVehicle", ""],
      ["fSportRisk", ""],
      ["fTravel", ""]
    ].forEach(function (entry) {
      var node = byId(entry[0]);
      if (node) {
        node.value = entry[1];
        if (entry[0] === "fGender") node.dataset.manual = "0";
      }
    });

    S.questionnaireGateMessage = "";

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
    S.activeScenarioMode = "single";
    S.coverageTouched = false;
    S.premiumOverrides = {};
    S.proposalLibraryOpen = false;
    S.ragInsight = null;
    S.chatRagInsight = null;
    S.policyFocusByArea = {};
    S.policyScopeMenuByArea = {};
    resetRenderedState();
    renderPage2IntakeInsight();
    renderProposalShelf();
    renderSavedClientsLibrary();
    renderPersonaInsight();
    renderQuestionnaireProgressCard();
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
    renderQuestionnaireProgressCard();
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
    var partnerNetMonthlyIncome = parseInt((byId("fPartnerIncome") && byId("fPartnerIncome").value) || "", 10) || 0;
    var sportRiskLevel = (byId("fSportRisk") && byId("fSportRisk").value) || "";
    var travelFrequency = (byId("fTravel") && byId("fTravel").value) || "";
    var spouseName = byId("fSpouseName").value.trim();
    var spouseAge = parseInt((byId("fSpouseAge") && byId("fSpouseAge").value) || "", 10) || 0;
    var childrenAges = parseChildrenAgesInput(byId("fChildrenAges").value);
    var maritalStatus = byId("fSt").value;
    var hasPartner = maritalStatus === "Sposato" || maritalStatus === "Convivente" || !!spouseName || !!partnerNetMonthlyIncome || !!spouseAge;
    var childrenCount = parseInt(byId("fFi").value, 10) || childrenAges.length || 0;
    var domGoals = readGoalsFromDom();
    var fallbackGoals =
      (S.plan && (S.plan.goalSuggestions || S.plan.goals)) ||
      (S.draftProfile && S.draftProfile.goals) ||
      [];

    return FamilyAdvisorEngine.finalizeProfile({
      name: byId("fNome").value.trim(),
      birthDate: birthDate,
      age: age,
      maritalStatus: maritalStatus,
      spouseName: hasPartner ? (spouseName || "Partner") : "",
      spouseAge: hasPartner ? spouseAge : 0,
      partnerNetMonthlyIncome: hasPartner ? partnerNetMonthlyIncome : 0,
      childrenCount: childrenCount,
      childrenAges: childrenAges,
      profession: byId("fProfession").value.trim(),
      grossAnnualIncome: parseInt(byId("fR").value, 10) || 0,
      netMonthlyIncome: netMonthlyIncome,
      monthlySavings: parseInt(byId("fRi").value, 10) || 0,
      totalAssets: totalAssets,
      liquidAssets: parseInt(byId("fLiqu").value, 10) || 0,
      investedAssets: parseInt(byId("fInv").value, 10) || 0,
      residenceCity: byId("fCity").value.trim() || existingProfile.residenceCity || "",
      housingStatus: byId("fAb").value,
      housingCost: parseInt(byId("fHomeCost").value, 10) || 0,
      fixedExpenses: parseInt(byId("fFixed").value, 10) || 0,
      petType: byId("fPet").value || "",
      mobilityMode: byId("fVehicle").value || "",
      sportRiskLevel: sportRiskLevel,
      travelFrequency: travelFrequency,
      goals: domGoals.length ? domGoals : fallbackGoals,
      existingCoverageIds: S.plan ? S.plan.profile.existingCoverageIds : [],
      notes: mergeGeneratedFormNotes(existingProfile.notes || "", {
        residenceCity: byId("fCity").value.trim() || existingProfile.residenceCity || "",
        partnerNetMonthlyIncome: hasPartner ? partnerNetMonthlyIncome : 0,
        petType: byId("fPet").value || "",
        mobilityMode: byId("fVehicle").value || "",
        sportRiskLevel: sportRiskLevel,
        travelFrequency: travelFrequency
      }),
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
    byId("fCity").value = profile.residenceCity || "";
    byId("fSt").value = profile.maritalStatus || "";
    byId("fSpouseName").value = profile.spouseName || "";
    byId("fSpouseAge").value = fieldValue(profile.spouseAge);
    byId("fPartnerIncome").value = fieldValue(profile.partnerNetMonthlyIncome);
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
    byId("fPet").value = profile.petType || "";
    byId("fVehicle").value = profile.mobilityMode || "";
    byId("fSportRisk").value = profile.sportRiskLevel || "";
    byId("fTravel").value = profile.travelFrequency || "";
    if (byId("fGender") && byId("fGender").dataset.manual !== "1") {
      byId("fGender").value = "";
      byId("fGender").dataset.manual = "0";
    }

    S.isRendering = false;
    renderQuestionnaireProgressCard();
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
    var summaryTags = [
      profile.age ? profile.age + " anni" : "",
      profile.profession || "",
      familyLabel || "",
      profile.housingStatus || "",
      profile.residenceCity || "",
      profile.petType && profile.petType !== "nessuno" ? "Pet: " + readablePetLabel(profile.petType) : "",
      profile.mobilityMode ? "Mobilita: " + readableMobilityLabel(profile.mobilityMode) : "",
      profile.sportRiskLevel && profile.sportRiskLevel !== "nessuno" ? "Sport: " + readableSportRiskLabel(profile.sportRiskLevel) : ""
    ].filter(Boolean);
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
      summaryTags.map(function (tag) { return '<div class="phero-tag">' + esc(tag) + "</div>"; }).join("") +
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
      (profile.partnerNetMonthlyIncome ? '<div class="finance-tile"><div class="finance-k">Reddito partner</div><div class="finance-v">€ ' + esc(currency(profile.partnerNetMonthlyIncome)) + '</div><div class="finance-s">Dato raccolto nel questionario per leggere meglio il nucleo.</div></div>' : "") +
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
          '<td><div class="cov-nm">' + esc(recommendation.name) + '</div><div class="cov-ds">' + esc(compactProductLabel(recommendation)) + "</div></td>" +
          '<td><div class="cov-ds">' + esc(compactProductMetric(recommendation)) + " · Fit " + recommendation.score + "/100</div></td>" +
          '<td><div class="cov-eur">€ ' + recommendation.monthlyPremium + '/mese</div></td>' +
          '<td><div class="cov-ded' + (recommendation.deductibleRate ? "" : " no") + '">' + esc(compactDeductibleLabel(recommendation)) + '</div></td>' +
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
    return keepCurrentValues;
  }

  function currentOverrides() {
    var activeGoal = S.plan && S.plan.goals
      ? (S.plan.goals.find(function (goal) { return goal.id === S.activeGoalId; }) || featuredGoal(S.plan.goals) || S.plan.goals[0])
      : null;
    return {
      totalAssets: S.plan.profile.totalAssets,
      monthlySavings: S.plan.profile.monthlySavings,
      horizonYears: activeGoal ? clamp(activeGoal.years + 2, 2, 25) : 10,
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
        '<div><div class="coverage-band-ey">Set polizze</div><div class="coverage-band-title">Nessuna copertura attiva</div><div class="coverage-band-copy">Attiva le coperture da valutare.</div></div>' +
        '<div class="coverage-band-grid">' +
        '<div class="coverage-band-metric"><div class="coverage-band-k">Obiettivi in simulazione</div><div class="coverage-band-v">' + esc(selectedGoalCount) + '</div></div>' +
        '<div class="coverage-band-metric"><div class="coverage-band-k">Set attivo</div><div class="coverage-band-v">€ 0/mese</div></div>' +
        '<div class="coverage-band-metric"><div class="coverage-band-k">Auto-accantonamento</div><div class="coverage-band-v">da vedere</div></div>' +
        "</div></div>";
      return;
    }

    band.innerHTML =
      '<div class="coverage-band">' +
      '<div><div class="coverage-band-ey">Configurazione attiva</div><div class="coverage-band-title">Con ' + esc(snapshot.selectedCount) + ' copertur' + (snapshot.selectedCount === 1 ? "a" : "e") + ' attiv' + (snapshot.selectedCount === 1 ? "a" : "e") + ' il cliente spende € ' + esc(currency(snapshot.totalPremium)) + '/mese</div><div class="coverage-band-copy">Confronto diretto tra costo della protezione e capitale che il cliente dovrebbe lasciare da solo a cuscinetto.</div></div>' +
      '<div class="coverage-band-grid">' +
      '<div class="coverage-band-metric premium"><div class="coverage-band-k">Costo totale set</div><div class="coverage-band-v">€ ' + esc(currency(snapshot.totalPremium)) + '/mese</div></div>' +
      '<div class="coverage-band-metric reserve"><div class="coverage-band-k">Senza polizze</div><div class="coverage-band-v">€ ' + esc(currency(snapshot.selfFundMonthly)) + '/mese</div></div>' +
      '<div class="coverage-band-metric freed"><div class="coverage-band-k">Liquidita liberata</div><div class="coverage-band-v">€ ' + esc(currency(snapshot.liquidityFreed)) + '/mese</div></div>' +
      "</div></div>";
  }

  function currentAreaFocus(areaId) {
    return (S.policyFocusByArea && S.policyFocusByArea[areaId]) || "";
  }

  function isPolicyScopeMenuOpen(areaId) {
    return !!(S.policyScopeMenuByArea && S.policyScopeMenuByArea[areaId]);
  }

  function setPolicyScopeMenuOpen(areaId, open) {
    if (!areaId) return;
    if (!S.policyScopeMenuByArea) S.policyScopeMenuByArea = {};
    S.policyScopeMenuByArea[areaId] = !!open;
  }

  function setPolicyAreaFocus(areaId, itemId) {
    if (!areaId || !itemId) return;
    if (!S.policyFocusByArea) S.policyFocusByArea = {};
    S.policyFocusByArea[areaId] = itemId;
    var activeScenario = currentScenarioCollection()[S.activeScenarioId];
    if (activeScenario) renderPolicyBoard(activeScenario);
  }

  function offerProductLinkedRecommendations(product) {
    if (!S.plan) return [];
    return S.plan.recommendations.filter(function (recommendation) {
      return (product.linkedProductIds || []).indexOf(recommendation.id) >= 0;
    });
  }

  function offerAreaById(areaId) {
    return !S.plan ? null : (S.plan.offerAreas || []).find(function (entry) { return entry.id === areaId; }) || null;
  }

  function offerProductById(areaId, productId) {
    var area = offerAreaById(areaId);
    return area ? (area.products || []).find(function (entry) { return entry.id === productId; }) || null : null;
  }

  function applyOfferSelections(nextOfferSelections) {
    applyPlan(readProfileFromForm(), {
      selectedGoalIds: selectedGoalIdsFromPlan(),
      offerSelections: nextOfferSelections,
      premiumOverrides: {},
      keepSliderValues: true
    });
  }

  function ensureOfferSelectionNode(nextOfferSelections, areaId, productId) {
    if (!nextOfferSelections[areaId]) nextOfferSelections[areaId] = { products: {} };
    if (!nextOfferSelections[areaId].products) nextOfferSelections[areaId].products = {};
    if (!nextOfferSelections[areaId].products[productId]) {
      nextOfferSelections[areaId].products[productId] = { selected: false, solutionId: "", coverages: {} };
    }
    if (!nextOfferSelections[areaId].products[productId].coverages) {
      nextOfferSelections[areaId].products[productId].coverages = {};
    }
    return nextOfferSelections[areaId].products[productId];
  }

  function toggleOfferCoverageSelection(areaId, productId, coverageId) {
    if (!S.plan) return;
    var product = offerProductById(areaId, productId);
    if (!product) return;
    var coverage = (product.coverages || []).find(function (entry) { return entry.id === coverageId; });
    if (!coverage) return;

    var nextOfferSelections = currentOfferSelections() || {};
    var productNode = ensureOfferSelectionNode(nextOfferSelections, areaId, productId);
    var currentNode = productNode.coverages[coverageId] || {};
    productNode.coverages[coverageId] = {
      selected: !coverage.selected,
      solutionId: currentNode.solutionId || coverage.selectedSolutionId || coverage.suggestedSolutionId
    };
    if (!S.policyFocusByArea) S.policyFocusByArea = {};
    S.policyFocusByArea[areaId] = coverageId;
    applyOfferSelections(nextOfferSelections);
  }

  function selectOfferCoverageSolution(areaId, productId, coverageId, solutionId) {
    if (!S.plan) return;
    var product = offerProductById(areaId, productId);
    if (!product) return;
    var coverage = (product.coverages || []).find(function (entry) { return entry.id === coverageId; });
    if (!coverage) return;
    var targetSolution = (coverage.solutions || []).find(function (solution) {
      return solution.id === solutionId && solution.available !== false;
    });
    if (!targetSolution) return;

    var nextOfferSelections = currentOfferSelections() || {};
    var productNode = ensureOfferSelectionNode(nextOfferSelections, areaId, productId);
    productNode.coverages[coverageId] = {
      selected: true,
      solutionId: solutionId
    };
    if (!S.policyFocusByArea) S.policyFocusByArea = {};
    S.policyFocusByArea[areaId] = coverageId;
    applyOfferSelections(nextOfferSelections);
  }

  function toggleOfferProduct(areaId, productId) {
    if (!S.plan) return;
    var product = offerProductById(areaId, productId);
    if (!product) return;

    var nextOfferSelections = currentOfferSelections() || {};
    var productNode = ensureOfferSelectionNode(nextOfferSelections, areaId, productId);
    if ((product.coverages || []).length) {
      var nextSelected = !product.selected;
      (product.coverages || []).forEach(function (coverage) {
        var currentNode = productNode.coverages[coverage.id] || {};
        productNode.coverages[coverage.id] = {
          selected: nextSelected,
          solutionId: currentNode.solutionId || productNode.solutionId || coverage.selectedSolutionId || coverage.suggestedSolutionId
        };
      });
    }
    productNode.selected = !product.selected;
    productNode.solutionId = productNode.solutionId || product.selectedSolutionId || product.suggestedSolutionId;
    applyOfferSelections(nextOfferSelections);
  }

  function selectOfferProductSolution(areaId, productId, solutionId) {
    if (!S.plan) return;
    var product = offerProductById(areaId, productId);
    if (!product) return;
    var targetSolution = (product.solutions || []).find(function (solution) {
      return solution.id === solutionId && solution.available !== false;
    });
    if (!targetSolution) return;

    var nextOfferSelections = currentOfferSelections() || {};
    var productNode = ensureOfferSelectionNode(nextOfferSelections, areaId, productId);
    productNode.solutionId = solutionId;
    if ((product.coverages || []).length) {
      (product.coverages || []).forEach(function (coverage) {
        var currentNode = productNode.coverages[coverage.id] || {};
        productNode.coverages[coverage.id] = {
          selected: product.coverages.length === 1 ? true : (Object.prototype.hasOwnProperty.call(currentNode, "selected") ? currentNode.selected : coverage.selected),
          solutionId: solutionId
        };
      });
      productNode.selected = product.coverages.length === 1 ? true : product.selected;
    } else {
      productNode.selected = true;
    }
    applyOfferSelections(nextOfferSelections);
  }

  function renderPolicyBoard(activeScenario) {
    if (!S.plan) return;
    var productGrid = byId("policyProductGrid");
    var configBadge = byId("policyConfigBadge");
    if (!productGrid) return;

    var areas = (S.plan.offerAreas || []).slice().sort(function (left, right) {
      return right.fitScore - left.fitScore;
    });

    if (configBadge) {
      configBadge.textContent = areas.length + " aree lette dal motore";
    }

    function buildSelectOptions(solutions, selectedId) {
      return (solutions || []).map(function (solution) {
        return '<option value="' + esc(solution.id) + '"' + (solution.id === selectedId ? " selected" : "") + (solution.available === false ? " disabled" : "") + ">" +
          esc(solution.name + (solution.limitLabel ? " · " + solution.limitLabel : "")) +
          "</option>";
      }).join("");
    }

    function selectedCoverageNames(product) {
      return (product.coverages || [])
        .filter(function (coverage) { return coverage.selected; })
        .map(function (coverage) { return coverage.name; });
    }

    function focusCoverageMarkup(area, product) {
      var availableCoverages = product.coverages || [];
      if (!availableCoverages.length) return "";
      var focusId = currentAreaFocus(area.id);
      if (!focusId || !availableCoverages.some(function (coverage) { return coverage.id === focusId; })) {
        var preselected = availableCoverages.find(function (coverage) { return coverage.selected; });
        focusId = preselected ? preselected.id : availableCoverages[0].id;
      }
      var coverage = availableCoverages.find(function (entry) { return entry.id === focusId; }) || availableCoverages[0];
      var priority = priorityMeta(product.fitScore);
      var productSolutionId = product.selectedSolutionId || product.suggestedSolutionId || "";
      var activeProductSolution = (product.solutions || []).find(function (solution) {
        return solution.id === productSolutionId;
      }) || null;
      var focusSolutionId = coverage.selectedSolutionId || coverage.suggestedSolutionId || productSolutionId;
      var focusSolution = (coverage.solutions || []).find(function (solution) {
        return solution.id === focusSolutionId;
      }) || null;
      var monthlyPremium = product.selectedMonthlyPremium || 0;
      var selectedNames = selectedCoverageNames(product);
      var selectedCount = selectedNames.length;
      var selectedSummary = selectedNames.length
        ? joinReadableList(selectedNames.slice(0, 2)) + (selectedNames.length > 2 ? " +" + (selectedNames.length - 2) : "")
        : "Apri la tendina e attiva gli ambiti utili.";
      var protectionPct = activeScenario ? activeScenario.withCoverage.protection : 0;
      var achievementPct = activeScenario ? activeScenario.withCoverage.achievement : 0;
      var protectionLift = activeScenario ? Math.max(0, activeScenario.withCoverage.protection - activeScenario.noCoverage.protection) : 0;
      var achievementLift = activeScenario ? Math.max(0, activeScenario.withCoverage.achievement - activeScenario.noCoverage.achievement) : 0;
      var focusLine = focusSolution
        ? (focusSolution.id === productSolutionId
            ? focusSolution.name + (focusSolution.limitLabel ? " · " + focusSolution.limitLabel : "")
            : focusSolution.name + " su questo ambito" + (focusSolution.limitLabel ? " · " + focusSolution.limitLabel : ""))
        : "Livello da definire";
      return (
        '<div class="policy-coverage-focus">' +
        '<div class="policy-focus-top">' +
        '<div><div class="policy-focus-title">' + esc(product.name || area.productGroupName || area.name) + ' <span class="policy-priority ' + esc(priority.key) + '">' + esc(priority.label) + '</span></div><div class="policy-focus-note">Scegli prima il livello del prodotto, poi attiva sotto solo gli ambiti che vuoi mettere in trattativa.</div></div>' +
        '<div class="policy-focus-price-stack"><div class="policy-focus-price">€ ' + esc(currency(monthlyPremium)) + '/mese</div><div class="policy-focus-state' + (selectedCount ? " on" : " off") + '">' + esc(selectedCount ? selectedCount + " ambiti attivi" : "Nessun ambito attivo") + "</div></div>" +
        "</div>" +
        '<div class="policy-focus-controls stack">' +
        '<label class="policy-focus-field"><span>Soluzione prodotto</span><select class="policy-focus-select" onchange="selectOfferProductSolution(\'' + esc(area.id) + '\', \'' + esc(product.id) + '\', this.value)">' +
        buildSelectOptions(product.solutions, productSolutionId) +
        "</select></label>" +
        '<div class="policy-focus-inline">Ambito in focus <strong>' + esc(coverage.name) + "</strong> · " + esc(focusLine) + "</div>" +
        "</div>" +
        '<div class="policy-focus-foot"><div class="policy-focus-meta">Livello attivo: <strong>' + esc(activeProductSolution ? activeProductSolution.name : "Da scegliere") + "</strong></div><div class=\"policy-focus-meta\">" + esc(selectedCount ? selectedCount + " ambiti selezionati" : "Nessun ambito selezionato") + "</div></div>" +
        '<div class="policy-focus-kpis">' +
        '<div class="policy-focus-kpi"><span>Copertura scenario</span><strong>' + esc(protectionPct) + '%</strong><small>' + esc(protectionLift ? "+" + protectionLift + " pt" : "nessun recupero") + "</small></div>" +
        '<div class="policy-focus-kpi"><span>Raggiungimento obiettivo</span><strong>' + esc(achievementPct) + '%</strong><small>' + esc(achievementLift ? "+" + achievementLift + " pt" : "nessun salto") + "</small></div>" +
        "</div>" +
        '<div class="policy-scope-section">' +
        '<div class="policy-scope-head"><strong>Ambiti da selezionare</strong><span>Apri la tendina e attivane più di uno sullo stesso prodotto.</span></div>' +
        '<details class="policy-scope-picker"' + (isPolicyScopeMenuOpen(area.id) ? " open" : "") + ' ontoggle="setPolicyScopeMenuOpen(\'' + esc(area.id) + '\', this.open)">' +
        '<summary class="policy-scope-summary"><div><div class="policy-scope-summary-k">Selezione multipla</div><div class="policy-scope-summary-v">' + esc(selectedNames.length ? selectedNames.length + " ambiti attivi" : "Nessun ambito attivo") + '</div></div><div class="policy-scope-summary-meta">' + esc(selectedSummary) + "</div></summary>" +
        '<div class="policy-scope-menu">' +
        availableCoverages.map(function (entry) {
          var entryPriority = priorityMeta(entry.fitScore);
          var entrySolutionId = entry.selectedSolutionId || entry.suggestedSolutionId || "";
          var entrySolution = (entry.solutions || []).find(function (solution) {
            return solution.id === entrySolutionId;
          }) || null;
          var entryPremium = entry.selected
            ? entry.selectedMonthlyPremium
            : entrySolution
            ? entrySolution.monthlyPremium
            : 0;
          var entryStateLabel = entry.selected ? "Selezionato" : "Da aggiungere";
          return (
            '<div class="policy-scope-option' + (entry.selected ? " on" : "") + (entry.id === coverage.id ? " focus" : "") + '">' +
            '<button type="button" class="policy-scope-option-main" onclick="setPolicyAreaFocus(\'' + esc(area.id) + '\', \'' + esc(entry.id) + '\')">' +
            '<div class="policy-scope-main-top"><div class="policy-scope-name">' + esc(entry.name) + '</div><span class="policy-priority ' + esc(entryPriority.key) + '">' + esc(entryPriority.label) + "</span></div>" +
            '<div class="policy-scope-copy">' + esc(entry.id === coverage.id ? "Ambito in modifica" : (entrySolution ? "Con " + entrySolution.name + (entrySolution.limitLabel ? " · " + entrySolution.limitLabel : "") : "Apri per vedere il livello applicato")) + "</div>" +
            '<div class="policy-scope-bottom"><div class="policy-scope-price">€ ' + esc(currency(entryPremium)) + '/mese</div><span class="policy-scope-state' + (entry.selected ? " on" : " off") + '">' + esc(entryStateLabel) + "</span></div>" +
            "</button>" +
            '<button type="button" class="policy-scope-check' + (entry.selected ? " on" : "") + '" onclick="toggleOfferCoverageSelection(\'' + esc(area.id) + '\', \'' + esc(product.id) + '\', \'' + esc(entry.id) + '\')">' + esc(entry.selected ? "Selezionato" : "Aggiungi") + "</button>" +
            "</div>"
          );
        }).join("") +
        "</div>" +
        "</details>" +
        "</div>" +
        "</div>"
      );
    }

    function compactProductMarkup(area, product) {
      var priority = priorityMeta(product.fitScore);
      var selectedSolutionId = product.selectedSolutionId || product.suggestedSolutionId || "";
      var activeSolution = (product.solutions || []).find(function (solution) {
        return solution.id === selectedSolutionId;
      }) || null;
      var linked = offerProductLinkedRecommendations(product);
      var premium = product.selected
        ? product.selectedMonthlyPremium
        : activeSolution
        ? activeSolution.monthlyPremium
        : 0;
      return (
        '<div class="policy-compact-product">' +
        '<div class="policy-compact-top">' +
        '<div><div class="policy-compact-title">' + esc(product.name) + ' <span class="policy-priority ' + esc(priority.key) + '">' + esc(priority.label) + '</span></div><div class="policy-compact-copy">' + esc(linked.length ? joinReadableList(linked.map(function (recommendation) { return shortProductLabel(recommendation); })) : area.reason) + "</div></div>" +
        '<div class="policy-focus-price">€ ' + esc(currency(premium)) + '/mese</div>' +
        "</div>" +
        '<div class="policy-compact-controls">' +
        '<label class="policy-focus-field"><span>Soluzione</span><select class="policy-focus-select" onchange="selectOfferProductSolution(\'' + esc(area.id) + '\', \'' + esc(product.id) + '\', this.value)">' +
        buildSelectOptions(product.solutions, selectedSolutionId) +
        "</select></label>" +
        '<button class="policy-focus-toggle' + (product.selected ? "" : " off") + '" onclick="toggleOfferProduct(\'' + esc(area.id) + '\', \'' + esc(product.id) + '\')">' + esc(product.selected ? "Attiva" : "Aggiungi") + "</button>" +
        "</div>" +
        "</div>"
      );
    }

    function areaMarkup(area) {
      var isSuggested = area.fitScore >= 56 || area.selectedCoverageCount > 0;
      var firstMatrixProduct = (area.products || []).find(function (product) {
        return product.presentation === "coverage-matrix";
      }) || null;
      var selectedCount = sumValues((area.products || []).map(function (product) {
        return (product.coverages || []).filter(function (coverage) { return coverage.selected; }).length;
      }));
      var productContent = firstMatrixProduct
        ? focusCoverageMarkup(area, firstMatrixProduct)
        : '<div class="policy-compact-product-list">' + (area.products || []).map(function (product) {
            return compactProductMarkup(area, product);
          }).join("") + "</div>";
      return (
        '<div class="policy-product-card" style="--policy-accent:' + esc(area.accent || "#315eac") + '">' +
        '<div class="policy-product-top">' +
        '<div><div class="policy-product-ey">' + esc(area.name) + '</div><div class="policy-product-title">' + esc(firstMatrixProduct ? (area.productGroupName || area.summary || area.mainVisual) : area.mainVisual) + '</div><div class="policy-product-copy">' + esc(area.reason) + "</div></div>" +
        '<div class="policy-product-side"><div class="policy-fit">' + esc(area.fitScore) + '/100</div><div class="policy-state ' + (isSuggested ? "suggested" : "secondary") + '">' + esc(isSuggested ? "Suggerita" : "Da valutare") + "</div></div>" +
        "</div>" +
        '<div class="policy-product-summary"><strong>' + esc(firstMatrixProduct ? "Ambiti del prodotto" : "Prodotti protection") + '</strong><span>' + esc(selectedCount ? selectedCount + " selezioni attive" : area.coverageCount + " opzioni configurabili") + "</span></div>" +
        productContent +
        '<div class="policy-coverage-pills">' + (area.products || []).map(function (product) {
          if (product.presentation === "coverage-matrix") {
            return '<span class="policy-coverage-pill on">' + esc((product.coverages || []).length + " ambiti") + "</span>";
          }
          return '<span class="policy-coverage-pill' + (product.selected ? " on" : "") + '">' + esc(product.name) + "</span>";
        }).join("") + "</div>" +
        "</div>" +
        "</div>"
      );
    }

    productGrid.innerHTML = areas.length ? areas.map(function (area) { return areaMarkup(area); }).join("") : '<div class="policy-empty">Nessun prodotto configurabile disponibile su questo profilo.</div>';
  }

  function yearlyLabelsFromPath(path) {
    return path.map(function (_, index) {
      return index === 0 ? "Oggi" : "Anno " + Math.round(index / 12);
    }).filter(function (_, index) {
      return index === 0 || index % 12 === 0;
    });
  }

  function yearlyValues(path) {
    return path.filter(function (_, index) {
      return index === 0 || index % 12 === 0;
    });
  }

  function scenarioEventMonth(activeScenario) {
    var basePath = activeScenario && activeScenario.base && activeScenario.base.path ? activeScenario.base.path : [];
    var maxIndex = Math.max(0, basePath.length - 1);
    return clamp(Math.max(0, activeScenario && activeScenario.eventMonth ? activeScenario.eventMonth : 0), 0, maxIndex);
  }

  function mergePathUntilEvent(basePath, branchPath, eventMonth) {
    return (basePath || []).map(function (value, index) {
      if (index < eventMonth) return value;
      return branchPath && typeof branchPath[index] !== "undefined" ? branchPath[index] : value;
    });
  }

  function sampledEventIndex(eventMonth) {
    return Math.max(0, Math.round(eventMonth / 12));
  }

  function chartGradient(chart, topColor, bottomColor) {
    var area = chart && chart.chartArea;
    if (!area) return topColor;
    var gradient = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
    gradient.addColorStop(0, topColor);
    gradient.addColorStop(1, bottomColor);
    return gradient;
  }

  function scenarioMarkerPlugin(eventIndex, label) {
    return {
      id: "scenarioMarker",
      beforeDatasetsDraw: function (chart) {
        var xScale = chart.scales.x;
        var yScale = chart.scales.y;
        if (!xScale || !yScale || typeof eventIndex !== "number") return;
        var x = xScale.getPixelForValue(eventIndex);
        var ctx = chart.ctx;
        ctx.save();
        ctx.fillStyle = "rgba(255,90,112,.05)";
        ctx.fillRect(x, yScale.top, chart.chartArea.right - x, yScale.bottom - yScale.top);
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = "rgba(255,90,112,.65)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, yScale.top);
        ctx.lineTo(x, yScale.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#ff5a70";
        ctx.font = "700 10px Outfit";
        ctx.fillText(label, Math.min(x + 10, chart.chartArea.right - 74), yScale.top + 14);
        ctx.restore();
      }
    };
  }

  function lastValue(list) {
    if (!list || !list.length) return 0;
    return Number(list[list.length - 1] || 0);
  }

  function drawScenarioPathChart(activeScenario) {
    var canvas = byId("pathC");
    if (!canvas) return;
    destroyChart("path");
    var basePath = activeScenario.base && activeScenario.base.path ? activeScenario.base.path : activeScenario.withCoverage.path;
    var eventMonth = scenarioEventMonth(activeScenario);
    var displayNoPath = mergePathUntilEvent(basePath, activeScenario.noCoverage.path, eventMonth);
    var displayYesPath = mergePathUntilEvent(basePath, activeScenario.withCoverage.path, eventMonth);
    var labels = yearlyLabelsFromPath(basePath);
    var baseData = yearlyValues(basePath);
    var noData = yearlyValues(displayNoPath);
    var yesData = yearlyValues(displayYesPath);
    var eventIndex = sampledEventIndex(eventMonth);

    if (!chartLibraryAvailable()) {
      S.ch.path = renderLineChartFallback(canvas, {
        labels: labels,
        eventIndex: eventIndex,
        eventLabel: "Sinistro",
        datasets: [
          {
            data: baseData,
            borderColor: "#6f7bf7",
            borderWidth: 3,
            borderDash: [10, 7]
          },
          {
            data: noData,
            borderColor: "#ff5a70",
            borderWidth: 3.2,
            fill: true,
            areaFill: "rgba(255,90,112,.16)",
            highlightIndex: eventIndex,
            pointColor: "#ff5a70",
            pointRadius: 4.5
          },
          {
            data: yesData,
            borderColor: "#1fb7a6",
            borderWidth: 3.2,
            fill: true,
            areaFill: "rgba(31,183,166,.14)",
            highlightIndex: eventIndex,
            pointColor: "#1fb7a6",
            pointRadius: 4.5
          }
        ]
      });
      return;
    }

    var ctx = canvas.getContext("2d");

    S.ch.path = new Chart(ctx, {
      type: "line",
      plugins: [scenarioMarkerPlugin(eventIndex, "Sinistro")],
      data: {
        labels: labels,
        datasets: [
          {
            label: "Piano base",
            data: baseData,
            borderColor: "#6f7bf7",
            backgroundColor: "rgba(111,123,247,.08)",
            fill: false,
            tension: 0.38,
            borderWidth: 3,
            borderDash: [10, 7],
            pointRadius: 0,
            pointHoverRadius: 4
          },
          {
            label: "Sinistro scoperto",
            data: noData,
            borderColor: "#ff5a70",
            backgroundColor: function (context) {
              return chartGradient(context.chart, "rgba(255,90,112,.28)", "rgba(255,90,112,0)");
            },
            fill: true,
            tension: 0.38,
            borderWidth: 3.2,
            pointRadius: function (context) {
              return context.dataIndex === eventIndex ? 4.5 : 0;
            },
            pointHoverRadius: 4.5,
            pointBackgroundColor: "#ff5a70"
          },
          {
            label: "Sinistro coperto",
            data: yesData,
            borderColor: "#1fb7a6",
            backgroundColor: function (context) {
              return chartGradient(context.chart, "rgba(31,183,166,.24)", "rgba(31,183,166,0)");
            },
            fill: true,
            tension: 0.38,
            borderWidth: 3.2,
            pointRadius: function (context) {
              return context.dataIndex === eventIndex ? 4.5 : 0;
            },
            pointHoverRadius: 4.5,
            pointBackgroundColor: "#1fb7a6"
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
                return context.dataset.label + ": € " + context.parsed.y.toLocaleString("it-IT");
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { family: "Outfit", size: 10 }, color: "#7588a2", maxTicksLimit: 8 }
          },
          y: {
            grid: { color: "rgba(213,224,240,.55)" },
            ticks: {
              font: { family: "Outfit", size: 10 },
              color: "#7588a2",
              callback: function (value) { return "€" + Math.round(value / 1000) + "k"; }
            }
          }
        },
        animation: { duration: 650, easing: "easeInOutQuart" }
      }
    });
  }

  function drawScenarioGapChart(activeScenario) {
    var canvas = byId("gapC");
    if (!canvas) return;
    destroyChart("gap");
    var basePath = activeScenario.base && activeScenario.base.path ? activeScenario.base.path : activeScenario.withCoverage.path;
    var eventMonth = scenarioEventMonth(activeScenario);
    var displayNoPath = mergePathUntilEvent(basePath, activeScenario.noCoverage.path, eventMonth);
    var displayYesPath = mergePathUntilEvent(basePath, activeScenario.withCoverage.path, eventMonth);
    var labels = yearlyLabelsFromPath(basePath);
    var baseData = yearlyValues(basePath);
    var noGap = yearlyValues(displayNoPath).map(function (value, index) {
      return Math.max(0, baseData[index] - value);
    });
    var yesGap = yearlyValues(displayYesPath).map(function (value, index) {
      return Math.max(0, baseData[index] - value);
    });
    var eventIndex = sampledEventIndex(eventMonth);

    if (!chartLibraryAvailable()) {
      S.ch.gap = renderLineChartFallback(canvas, {
        labels: labels,
        eventIndex: eventIndex,
        eventLabel: "Shock",
        beginAtZero: true,
        datasets: [
          {
            data: noGap,
            borderColor: "#ff5a70",
            borderWidth: 3,
            fill: true,
            areaFill: "rgba(255,90,112,.16)"
          },
          {
            data: yesGap,
            borderColor: "#1fb7a6",
            borderWidth: 3,
            fill: true,
            areaFill: "rgba(31,183,166,.14)"
          }
        ]
      });
      return;
    }

    var ctx = canvas.getContext("2d");

    S.ch.gap = new Chart(ctx, {
      type: "line",
      plugins: [scenarioMarkerPlugin(eventIndex, "Shock")],
      data: {
        labels: labels,
        datasets: [
          {
            label: "Erosione senza coperture",
            data: noGap,
            borderColor: "#ff5a70",
            backgroundColor: function (context) {
              return chartGradient(context.chart, "rgba(255,90,112,.26)", "rgba(255,90,112,0)");
            },
            fill: true,
            tension: 0.35,
            borderWidth: 3,
            pointRadius: 0,
            pointHoverRadius: 4
          },
          {
            label: "Erosione con coperture",
            data: yesGap,
            borderColor: "#1fb7a6",
            backgroundColor: function (context) {
              return chartGradient(context.chart, "rgba(31,183,166,.24)", "rgba(31,183,166,0)");
            },
            fill: true,
            tension: 0.35,
            borderWidth: 3,
            pointRadius: 0,
            pointHoverRadius: 4
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
                return context.dataset.label + ": € " + context.parsed.y.toLocaleString("it-IT");
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { family: "Outfit", size: 10 }, color: "#7588a2", maxTicksLimit: 8 }
          },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(213,224,240,.55)" },
            ticks: {
              font: { family: "Outfit", size: 10 },
              color: "#7588a2",
              callback: function (value) { return "€" + Math.round(value / 1000) + "k"; }
            }
          }
        },
        animation: { duration: 650, easing: "easeInOutQuart" }
      }
    });
  }

  function renderSimpleScenarioGraphs(activeScenario) {
    var intro = byId("scenarioSimpleIntro");
    var pathLabel = byId("simplePathLabel");
    var gapLabel = byId("simpleGapLabel");
    var basePath = activeScenario.base && activeScenario.base.path ? activeScenario.base.path : [];
    var finalBaseCapital = lastValue(basePath);
    var finalNoCapital = lastValue(activeScenario.noCoverage.path);
    var finalYesCapital = lastValue(activeScenario.withCoverage.path);
    var eventYear = activeScenario.eventYear || Math.max(1, Math.round(scenarioEventMonth(activeScenario) / 12));
    var uncoveredDrop = Math.max(0, finalBaseCapital - finalNoCapital);
    var coveredDrop = Math.max(0, finalBaseCapital - finalYesCapital);
    var impactSummary = activeScenario.impactSummary || activeScenario.loss || {};
    var supportSummary = activeScenario.supportSummary || {};
    var eventLabel = activeScenario.eventLabels && activeScenario.eventLabels.length
      ? activeScenario.eventLabels.join(" + ")
      : activeScenario.label;
    if (intro) {
      intro.textContent = 'Scenario simulato: ' + eventLabel + '. Nell\'anno ' + eventYear + ' lo shock vale ' + impactSummaryLine(impactSummary) + '. Con le coperture attive il piano recupera ' + supportSummaryLine(supportSummary) + '.';
    }
    if (pathLabel) {
      pathLabel.textContent = "Prima del sinistro il percorso e lo stesso. Poi si vede il colpo iniziale e l'eventuale perdita di reddito nel tempo: il verde tiene solo sulla parte davvero coperta dai prodotti attivi.";
    }
    if (gapLabel) {
      gapLabel.textContent = "Alla data obiettivo il piano scoperto perde circa € " + currency(uncoveredDrop) + " rispetto al base; con coperture restano esposti circa € " + currency(coveredDrop) + ". Se il verde resta basso, significa che una parte dello shock non e ancora trasferita.";
    }
    drawScenarioPathChart(activeScenario);
    drawScenarioGapChart(activeScenario);
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
    var impactSummary = activeScenario.impactSummary || activeScenario.loss || {};
    var supportSummary = activeScenario.supportSummary || {};
    var residualImpact = activeScenario.netImpact || {};
    var impactRows = (activeScenario.impactBreakdown || []).map(function (entry) {
      return '<div class="impact-stage-row"><strong>' + esc(entry.label) + '</strong><span>' + esc(impactSummaryLine(entry)) + "</span></div>";
    }).join("");
    var supportRows = groupedSupportEntries(activeScenario).map(function (entry) {
      return '<div class="impact-stage-row"><strong>' + esc(entry.productName) + '</strong><span>' + esc(supportSummaryLine(entry) + (entry.scenarioLabels.length ? " · su " + entry.scenarioLabels.join(", ") : "")) + "</span></div>";
    }).join("");
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
      '<div class="impact-stage-copy">Scenario letto su <strong>' + esc(focusGoal.name) + '</strong>. Qui vedi che tipo di sinistro stiamo simulando, da quali importi parte il danno e quali prodotti stanno davvero recuperando lo shock.</div>' +
      '<div class="impact-stage-tags">' +
      '<div class="impact-stage-tag">' + esc(focusGoal.displayYears) + "</div>" +
      '<div class="impact-stage-tag">' + esc(activeScenario.severityLabel) + "</div>" +
      '<div class="impact-stage-tag">' + esc(activeScenario.eventLabels.join(" · ")) + "</div>" +
      "</div>" +
      "</div>" +
      '<div class="impact-stage-side">' +
      '<div class="impact-stage-side-k">' + esc(packageLabel) + "</div>" +
      '<div class="impact-stage-side-v">€ ' + esc(currency(packageValue)) + '/mese</div>' +
      '<div class="impact-stage-side-s">' + esc(packageNarrative + " " + packageSupport + " Shock totale: " + impactSummaryLine(impactSummary) + ". Recupero attivo: " + supportSummaryLine(supportSummary) + ".") + "</div>" +
      "</div>" +
      "</div>" +
      '<div class="impact-stage-grid">' +
      '<div class="impact-stage-metric"><div class="impact-stage-k">Shock iniziale + reddito</div><div class="impact-stage-v">' + esc(impactSummary.monthlyLoss ? "€ " + currency(impactSummary.monthlyLoss) + "/m" : "€ " + currency(impactSummary.upfrontLoss || 0)) + '</div><div class="impact-stage-s">' + esc(impactSummaryLine(impactSummary)) + "</div></div>" +
      '<div class="impact-stage-metric"><div class="impact-stage-k">Recupero da coperture</div><div class="impact-stage-v">' + esc(supportSummary.monthly ? "€ " + currency(supportSummary.monthly) + "/m" : "€ " + currency(supportSummary.upfront || 0)) + '</div><div class="impact-stage-s">' + esc(supportSummaryLine(supportSummary)) + "</div></div>" +
      '<div class="impact-stage-metric"><div class="impact-stage-k">Residuo scoperto</div><div class="impact-stage-v">' + esc(residualImpact.monthlyLoss ? "€ " + currency(residualImpact.monthlyLoss) + "/m" : "€ " + currency(residualImpact.upfrontLoss || 0)) + '</div><div class="impact-stage-s">' + esc(impactSummaryLine(residualImpact)) + "</div></div>" +
      "</div>" +
      '<div class="impact-stage-breakdown">' +
      '<div class="impact-stage-panel"><div class="impact-stage-panel-title">Che sinistro sto vedendo</div>' + (impactRows || '<div class="impact-stage-row empty"><strong>Nessun evento</strong><span>Non ci sono impatti stimati.</span></div>') + "</div>" +
      '<div class="impact-stage-panel"><div class="impact-stage-panel-title">Quali prodotti stanno recuperando il danno</div>' + (supportRows || '<div class="impact-stage-row empty"><strong>Nessuna copertura attiva</strong><span>Per ora il verde non recupera il danno: stai leggendo quasi tutto il rosso.</span></div>') + "</div>" +
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

    S.analysis = FamilyAdvisorEngine.analyzeScenarios(S.plan, overrides);
    var hasBundles = !!((S.analysis.bundleOrder || []).length);
    S.activeScenarioMode = hasBundles && S.activeScenarioMode === "bundle" ? "bundle" : "single";
    ensureScenarioSelection(previousGoalId !== S.analysis.focusGoal.id);
    renderScenario(S.activeScenarioId);
  }

  function renderScenario(scenarioId) {
    if (!S.analysis) return;
    var collection = currentScenarioCollection();
    if (!collection[scenarioId]) return;
    S.activeScenarioId = scenarioId;
    var activeScenario = collection[scenarioId];
    renderScenarioModeTabs();
    renderBundleCards();
    renderEventButtons();
    renderImpactStage(activeScenario);
    renderGoalFocusGrid();
    renderGoalGaugeGrid();
    renderCoverageSummaryBand();
    renderPolicyBoard(activeScenario);
    renderSimpleScenarioGraphs(activeScenario);
  }

  function syncProfile() {
    if (S.isRendering) return;
    var profile = readProfileFromForm();
    var selectedGoalIds = readSelectedGoalIdsFromDom();
    var options = {
      selectedCoverageIds: S.plan ? S.plan.selectedCoverageIds.slice() : [],
      offerSelections: currentOfferSelections(),
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
      offerSelections: null,
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
    if (!ensureQuestionnaireBaseReady()) return;
    var profile = readProfileFromForm();
    var selectedGoalIds = readSelectedGoalIdsFromDom();
    var options = {
      selectedCoverageIds: S.coverageTouched && S.plan ? S.plan.selectedCoverageIds.slice() : [],
      offerSelections: S.coverageTouched ? null : currentOfferSelections(),
      keepSliderValues: false
    };
    if (selectedGoalIds && selectedGoalIds.length) options.selectedGoalIds = selectedGoalIds;
    applyPlan(profile, options);
    goTo(3);
  }

  function handleQuestionnaireFieldInteraction() {
    S.questionnaireGateMessage = "";
    renderQuestionnaireProgressCard();
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
    if (Object.prototype.hasOwnProperty.call(options, "premiumOverrides")) {
      S.premiumOverrides = Object.assign({}, options.premiumOverrides || {});
    } else if (
      !Object.keys(S.premiumOverrides || {}).length &&
      S.plan &&
      S.plan.premiumOverrides &&
      !(S.plan.offerSelections && Object.keys(S.plan.offerSelections).length)
    ) {
      S.premiumOverrides = Object.assign({}, S.plan.premiumOverrides);
    }
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
    if (Object.prototype.hasOwnProperty.call(options, "offerSelections")) {
      planOptions.offerSelections = cloneOfferSelections(options.offerSelections);
    } else if (S.plan && S.plan.offerSelections) {
      planOptions.offerSelections = cloneOfferSelections(S.plan.offerSelections);
    }
    planOptions.premiumOverrides = Object.assign({}, S.premiumOverrides || {});

    S.plan = FamilyAdvisorEngine.buildPlan(profile, planOptions);
    S.draftProfile = S.plan.profile;
    FamilyAdvisorEngine.saveProfile(S.plan.profile);

    fillFormFromProfile(questionnaireProfile || S.plan.profile);
    renderProposalShelf();
    renderSavedClientsLibrary();
    renderPersonaInsight();
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
      var node = byId(id);
      if (node) node.addEventListener("input", refreshScenarioAnalysis);
    });
    [
      "fNome",
      "fDOB",
      "fEta",
      "fCity",
      "fSt",
      "fSpouseName",
      "fSpouseAge",
      "fPartnerIncome",
      "fFi",
      "fChildrenAges",
      "fProfession",
      "fAb",
      "fRnet",
      "fRi",
      "fPat",
      "fHomeCost",
      "fFixed",
      "fPet",
      "fVehicle",
      "fSportRisk",
      "fTravel"
    ].forEach(function (id) {
      var node = byId(id);
      if (!node) return;
      node.addEventListener("input", handleQuestionnaireFieldInteraction);
      node.addEventListener("change", handleQuestionnaireFieldInteraction);
    });
    root.addEventListener("afterprint", function () {
      document.body.classList.remove("print-mode");
    });
  }

  function boot() {
    bindEvents();
    resetClientWorkspace(false);
    renderProposalShelf();
    renderSavedClientsLibrary();
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
  root.selectScenario = selectScenario;
  root.selectGoal = selectGoal;
  root.updateScenarioGoal = updateScenarioGoal;
  root.setScenarioMode = setScenarioMode;
  root.exportScenarioPdf = exportScenarioPdf;
  root.handlePage2PrimaryAction = handlePage2PrimaryAction;
  root.newClient = newClient;
  root.toggleGoalSelection = toggleGoalSelection;
  root.toggleProposalLibrary = toggleProposalLibrary;
  root.saveCurrentProposal = saveCurrentProposal;
  root.loadProposal = loadProposal;
  root.loadSavedClient = loadSavedClient;
  root.toggleOfferProduct = toggleOfferProduct;
  root.toggleOfferCoverageSelection = toggleOfferCoverageSelection;
  root.selectOfferCoverageSolution = selectOfferCoverageSolution;
  root.selectOfferProductSolution = selectOfferProductSolution;
  root.setPolicyAreaFocus = setPolicyAreaFocus;
  root.setPolicyScopeMenuOpen = setPolicyScopeMenuOpen;
  root.setVisualGender = setVisualGender;

  document.addEventListener("DOMContentLoaded", boot);
})(window);
