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
    premiumOverrides: {},
    proposalLibraryOpen: false,
    isRendering: false,
    pendingTurnId: 0,
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
    var blocks = [
      {
        label: "Identita",
        complete: fieldHasValue("fNome") && fieldHasValue("fEta")
      },
      {
        label: "Nucleo",
        complete: fieldHasValue("fSt") && fieldHasValue("fFi", true)
      },
      {
        label: "Professione",
        complete: fieldHasValue("fProfession")
      },
      {
        label: "Abitazione",
        complete: fieldHasValue("fAb")
      },
      {
        label: "Reddito",
        complete: fieldHasValue("fRnet")
      },
      {
        label: "Cuscinetto",
        complete: fieldHasValue("fRi") || fieldHasValue("fPat")
      }
    ];
    var completed = blocks.filter(function (block) { return block.complete; }).length;
    return {
      blocks: blocks,
      completed: completed,
      total: blocks.length,
      completion: Math.round((completed / blocks.length) * 100),
      missing: blocks.filter(function (block) { return !block.complete; }).map(function (block) { return block.label; })
    };
  }

  function completionAvatarSvg(gender) {
    if (gender === "female") {
      return '' +
        '<svg viewBox="0 0 160 160" aria-hidden="true">' +
        '<path d="M50 42c0-22 15-32 30-32s30 10 30 32c0 12-2 20-6 28H56c-4-8-6-16-6-28Z" fill="currentColor" opacity=".18"/>' +
        '<circle cx="80" cy="52" r="24" fill="currentColor"/>' +
        '<path d="M46 138c2-28 18-44 34-44s32 16 34 44H46Z" fill="currentColor"/>' +
        '<path d="M39 142c0-18 12-31 22-39 8 18 22 28 39 28 17 0 31-10 39-28 10 8 22 21 22 39H39Z" fill="currentColor" opacity=".2"/>' +
        '</svg>';
    }
    if (gender === "male") {
      return '' +
        '<svg viewBox="0 0 160 160" aria-hidden="true">' +
        '<path d="M56 30c8-10 20-16 34-16 16 0 29 7 37 21l-8 8c-5-10-18-17-31-17-11 0-21 4-28 11l-4-7Z" fill="currentColor" opacity=".2"/>' +
        '<circle cx="80" cy="52" r="24" fill="currentColor"/>' +
        '<path d="M48 142c2-28 18-44 32-44s30 16 32 44H48Z" fill="currentColor"/>' +
        '<path d="M40 142c0-18 12-30 24-38 8 10 18 16 30 16 12 0 22-6 30-16 12 8 24 20 24 38H40Z" fill="currentColor" opacity=".18"/>' +
        '</svg>';
    }
    return '' +
      '<svg viewBox="0 0 160 160" aria-hidden="true">' +
      '<circle cx="80" cy="52" r="24" fill="currentColor"/>' +
      '<path d="M46 142c2-28 18-44 34-44s32 16 34 44H46Z" fill="currentColor"/>' +
      '<path d="M58 30c6-8 14-12 22-12 11 0 20 4 28 12" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round" opacity=".18"/>' +
      '</svg>';
  }

  function renderQuestionnaireProgressCard() {
    var card = byId("questionnaireProgressCard");
    if (!card) return;

    var state = questionnaireCompletionState();
    var gender = resolvedQuestionnaireGender();
    var profileName = byId("fNome") && byId("fNome").value.trim() ? byId("fNome").value.trim() : "cliente";
    var completion = clamp(state.completion, 0, 100);

    card.innerHTML =
      '<div class="profile-progress-ey">Lettura visiva del profilo</div>' +
      '<div class="profile-progress-head">' +
      '<div><div class="profile-progress-title">Scheda di ' + esc(profileName) + '</div><div class="profile-progress-copy">La figura si completa mentre il questionario prende forma. Pochi campi, ma tutti quelli che servono per rendere credibile la simulazione.</div></div>' +
      '<div class="profile-progress-percent">' + esc(completion) + '%</div>' +
      '</div>' +
      '<div class="profile-progress-visual ' + esc(gender) + '">' +
      '<div class="profile-progress-ring" style="--completion:' + esc(completion) + '">' +
      '<div class="profile-progress-core">' +
      '<div class="profile-progress-fill" style="height:' + esc(completion) + '%"></div>' +
      '<div class="profile-progress-illustration">' + completionAvatarSvg(gender) + "</div>" +
      "</div></div></div>" +
      '<div class="profile-progress-gender">' +
      '<button type="button" class="' + (gender === "neutral" ? "on" : "") + '" onclick="setVisualGender(\'auto\')">Auto</button>' +
      '<button type="button" class="' + (gender === "female" ? "on" : "") + '" onclick="setVisualGender(\'female\')">Donna</button>' +
      '<button type="button" class="' + (gender === "male" ? "on" : "") + '" onclick="setVisualGender(\'male\')">Uomo</button>' +
      "</div>" +
      '<div class="profile-progress-kpis">' +
      '<div class="profile-progress-kpi"><span>Blocchi completati</span><strong>' + esc(state.completed) + "/" + esc(state.total) + "</strong></div>" +
      '<div class="profile-progress-kpi"><span>Pronto per simulare</span><strong>' + esc(completion >= 67 ? "Quasi pronto" : completion >= 34 ? "In costruzione" : "Da completare") + "</strong></div>" +
      "</div>" +
      '<div class="profile-progress-list">' +
      state.blocks.map(function (block) {
        return '<div class="profile-progress-row' + (block.complete ? " on" : "") + '"><strong>' + esc(block.label) + '</strong><span>' + esc(block.complete ? "completo" : "manca") + "</span></div>";
      }).join("") +
      "</div>" +
      '<div class="profile-progress-foot">' +
      (state.missing.length
        ? "Da chiudere ancora: " + esc(joinReadableList(state.missing).toLowerCase()) + "."
        : "Questionario completo: puoi passare subito alla simulazione scenari.") +
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
    if (root.document && root.document.body) {
      root.document.body.setAttribute("data-page", String(pageNumber));
    }
    if (typeof root.scrollTo === "function") {
      root.scrollTo({ top: 0, behavior: "smooth" });
    }
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
      "questionnaireProgressCard",
      "goalGrid",
      "proposalShelf",
      "personaInsight",
      "coverageTableBody",
      "goalFocusGrid",
      "goalGaugeGrid",
      "coverageSummaryBand",
      "policySuggestedGrid",
      "policyOptionalGrid",
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
      "policySuggestedBadge",
      "policyOptionalBadge",
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
      if (node) {
        node.value = entry[1];
        if (entry[0] === "fGender") node.dataset.manual = "0";
      }
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
    S.premiumOverrides = {};
    S.proposalLibraryOpen = false;
    S.ragInsight = null;
    S.chatRagInsight = null;
    resetRenderedState();
    renderPage2IntakeInsight();
    renderProposalShelf();
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
      '<div><div class="coverage-band-ey">Set polizze attivo</div><div class="coverage-band-title">Con ' + esc(snapshot.selectedCount) + ' copertur' + (snapshot.selectedCount === 1 ? "a" : "e") + ' attiv' + (snapshot.selectedCount === 1 ? "a" : "e") + ' il cliente spende € ' + esc(currency(snapshot.totalPremium)) + '/mese</div><div class="coverage-band-copy">Confronto diretto tra premio e cuscinetto richiesto senza polizze.</div></div>' +
      '<div class="coverage-band-grid">' +
      '<div class="coverage-band-metric premium"><div class="coverage-band-k">Costo totale set</div><div class="coverage-band-v">€ ' + esc(currency(snapshot.totalPremium)) + '/mese</div></div>' +
      '<div class="coverage-band-metric reserve"><div class="coverage-band-k">Senza polizze</div><div class="coverage-band-v">€ ' + esc(currency(snapshot.selfFundMonthly)) + '/mese</div></div>' +
      '<div class="coverage-band-metric freed"><div class="coverage-band-k">Liquidita liberata</div><div class="coverage-band-v">€ ' + esc(currency(snapshot.liquidityFreed)) + '/mese</div></div>' +
      "</div></div>";
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
    applyOfferSelections(nextOfferSelections);
  }

  function toggleOfferProduct(areaId, productId) {
    if (!S.plan) return;
    var product = offerProductById(areaId, productId);
    if (!product) return;

    var nextOfferSelections = currentOfferSelections() || {};
    var productNode = ensureOfferSelectionNode(nextOfferSelections, areaId, productId);
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
    productNode.selected = true;
    productNode.solutionId = solutionId;
    applyOfferSelections(nextOfferSelections);
  }

  function renderPolicyBoard(activeScenario) {
    if (!S.plan) return;
    var suggestedGrid = byId("policySuggestedGrid");
    var optionalGrid = byId("policyOptionalGrid");
    var suggestedBadge = byId("policySuggestedBadge");
    var optionalBadge = byId("policyOptionalBadge");
    if (!suggestedGrid || !optionalGrid) return;

    var areas = (S.plan.offerAreas || []).slice();
    var suggested = areas.filter(function (area) {
      return area.fitScore >= 56 || area.selectedCoverageCount > 0;
    });
    var optional = areas.filter(function (area) {
      return suggested.indexOf(area) < 0;
    });

    suggestedBadge.textContent = suggested.length + " aree suggerite";
    optionalBadge.textContent = optional.length ? optional.length + " aree da valutare" : "Nessuna area secondaria";

    function buildSelectOptions(solutions, selectedId) {
      return (solutions || []).map(function (solution) {
        return '<option value="' + esc(solution.id) + '"' + (solution.id === selectedId ? " selected" : "") + (solution.available === false ? " disabled" : "") + ">" +
          esc(solution.name + (solution.limitLabel ? " · " + solution.limitLabel : "")) +
          "</option>";
      }).join("");
    }

    function coverageRowMarkup(area, product, coverage) {
      var priority = priorityMeta(coverage.fitScore);
      var selectedSolutionId = coverage.selectedSolutionId || coverage.suggestedSolutionId || "";
      var activeSolution = (coverage.solutions || []).find(function (solution) {
        return solution.id === selectedSolutionId;
      }) || null;
      var monthlyPremium = coverage.selected
        ? coverage.selectedMonthlyPremium
        : activeSolution
        ? activeSolution.monthlyPremium
        : 0;
      return (
        '<div class="policy-row' + (coverage.selected ? " on" : "") + '">' +
        '<div class="policy-row-main">' +
        '<div class="policy-row-title">' + esc(coverage.name) + '<span class="policy-priority ' + esc(priority.key) + '">' + esc(priority.label) + "</span></div>" +
        '<div class="policy-row-copy">' + esc(coverage.description || area.reason) + "</div>" +
        "</div>" +
        '<div class="policy-row-stat"><span>Premio</span><strong>€ ' + esc(currency(monthlyPremium)) + '/mese</strong></div>' +
        '<label class="policy-select-wrap"><span>Soluzione</span><select class="policy-select" onchange="selectOfferCoverageSolution(\'' + esc(area.id) + '\', \'' + esc(product.id) + '\', \'' + esc(coverage.id) + '\', this.value)">' +
        buildSelectOptions(coverage.solutions, selectedSolutionId) +
        "</select></label>" +
        '<button class="policy-toggle' + (coverage.selected ? " on" : "") + '" onclick="toggleOfferCoverageSelection(\'' + esc(area.id) + '\', \'' + esc(product.id) + '\', \'' + esc(coverage.id) + '\')">' + esc(coverage.selected ? "Inclusa" : "Attiva") + "</button>" +
        "</div>"
      );
    }

    function productRowMarkup(area, product) {
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
        '<div class="policy-row' + (product.selected ? " on" : "") + '">' +
        '<div class="policy-row-main">' +
        '<div class="policy-row-title">' + esc(product.name) + '<span class="policy-priority ' + esc(priority.key) + '">' + esc(priority.label) + "</span></div>" +
        '<div class="policy-row-copy">' + esc(linked.length ? joinReadableList(linked.map(function (recommendation) { return shortProductLabel(recommendation); })) : area.reason) + "</div>" +
        "</div>" +
        '<div class="policy-row-stat"><span>Premio</span><strong>€ ' + esc(currency(premium)) + '/mese</strong></div>' +
        '<label class="policy-select-wrap"><span>Soluzione</span><select class="policy-select" onchange="selectOfferProductSolution(\'' + esc(area.id) + '\', \'' + esc(product.id) + '\', this.value)">' +
        buildSelectOptions(product.solutions, selectedSolutionId) +
        "</select></label>" +
        '<button class="policy-toggle' + (product.selected ? " on" : "") + '" onclick="toggleOfferProduct(\'' + esc(area.id) + '\', \'' + esc(product.id) + '\')">' + esc(product.selected ? "Inclusa" : "Attiva") + "</button>" +
        "</div>"
      );
    }

    function areaMarkup(area, bucket) {
      var rows = area.products.map(function (product) {
        if (product.presentation === "coverage-matrix") {
          return (product.coverages || []).map(function (coverage) {
            return coverageRowMarkup(area, product, coverage);
          }).join("");
        }
        return productRowMarkup(area, product);
      }).join("");
      return (
        '<div class="policy-area-compact' + (bucket === "suggested" ? " suggested" : "") + '">' +
        '<div class="policy-area-header">' +
        '<div><div class="policy-area-ey">' + esc(area.name) + '</div><div class="policy-area-title">' + esc(area.mainVisual) + '</div><div class="policy-area-copy">' + esc(area.reason) + "</div></div>" +
        '<div class="policy-area-score">' + esc(area.fitScore) + "/100</div>" +
        "</div>" +
        '<div class="policy-row-list">' + rows + "</div>" +
        "</div>"
      );
    }

    suggestedGrid.innerHTML = suggested.length ? suggested.map(function (area) { return areaMarkup(area, "suggested"); }).join("") : '<div class="policy-empty">Nessuna area davvero prioritaria su questo profilo.</div>';
    optionalGrid.innerHTML = optional.length ? optional.map(function (area) { return areaMarkup(area, "optional"); }).join("") : '<div class="policy-empty">Non ci sono altre aree secondarie da aprire adesso.</div>';
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

  function lastValue(list) {
    if (!list || !list.length) return 0;
    return Number(list[list.length - 1] || 0);
  }

  function drawScenarioPathChart(activeScenario) {
    var canvas = byId("pathC");
    if (!canvas) return;
    destroyChart("path");
    var labels = yearlyLabelsFromPath(activeScenario.withCoverage.path);
    var baseData = yearlyValues(activeScenario.base && activeScenario.base.path ? activeScenario.base.path : activeScenario.withCoverage.path);
    var noData = yearlyValues(activeScenario.noCoverage.path);
    var yesData = yearlyValues(activeScenario.withCoverage.path);
    var ctx = canvas.getContext("2d");

    var h = canvas.offsetHeight || 300;
    var redGrad = ctx.createLinearGradient(0, 0, 0, h);
    redGrad.addColorStop(0, "rgba(182,85,85,0.22)");
    redGrad.addColorStop(1, "rgba(182,85,85,0)");
    var tealGrad = ctx.createLinearGradient(0, 0, 0, h);
    tealGrad.addColorStop(0, "rgba(62,118,116,0.18)");
    tealGrad.addColorStop(1, "rgba(62,118,116,0)");

    S.ch.path = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Piano base",
            data: baseData,
            borderColor: "rgba(77,104,216,.55)",
            backgroundColor: "transparent",
            fill: false,
            tension: 0.32,
            borderWidth: 2,
            borderDash: [5, 4],
            pointRadius: 0,
            pointHoverRadius: 3
          },
          {
            label: "Sinistro scoperto",
            data: noData,
            borderColor: "#b65555",
            backgroundColor: redGrad,
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: "#b65555"
          },
          {
            label: "Sinistro coperto",
            data: yesData,
            borderColor: "#3e7674",
            backgroundColor: tealGrad,
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: "#3e7674"
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
            backgroundColor: "rgba(23,35,51,.88)",
            titleColor: "#d6e0ee",
            bodyColor: "#b8c4d4",
            padding: 12,
            cornerRadius: 10,
            callbacks: {
              label: function (context) {
                return context.dataset.label + ": € " + context.parsed.y.toLocaleString("it-IT");
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { family: "Manrope", size: 10 }, color: "#8f98a5", maxTicksLimit: 8 } },
          y: { grid: { color: "rgba(16,24,36,.06)" }, border: { dash: [4, 3] }, ticks: { font: { family: "Manrope", size: 10 }, color: "#8f98a5", callback: function (value) { return "€" + Math.round(value / 1000) + "k"; } } }
        },
        animation: { duration: 700, easing: "easeInOutQuart" }
      }
    });
  }

  function drawScenarioGapChart(activeScenario) {
    var canvas = byId("gapC");
    if (!canvas) return;
    destroyChart("gap");
    var baseCapital = lastValue(activeScenario.base && activeScenario.base.path ? activeScenario.base.path : []);
    var noCapital = lastValue(activeScenario.noCoverage.path);
    var yesCapital = lastValue(activeScenario.withCoverage.path);
    var ctx = canvas.getContext("2d");

    var baseGrad = ctx.createLinearGradient(0, 0, canvas.offsetWidth || 400, 0);
    baseGrad.addColorStop(0, "rgba(77,104,216,.6)");
    baseGrad.addColorStop(1, "rgba(77,104,216,.25)");
    var noGrad = ctx.createLinearGradient(0, 0, canvas.offsetWidth || 400, 0);
    noGrad.addColorStop(0, "rgba(182,85,85,.75)");
    noGrad.addColorStop(1, "rgba(182,85,85,.3)");
    var yesGrad = ctx.createLinearGradient(0, 0, canvas.offsetWidth || 400, 0);
    yesGrad.addColorStop(0, "rgba(62,118,116,.8)");
    yesGrad.addColorStop(1, "rgba(62,118,116,.35)");

    S.ch.gap = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Piano base", "Senza copertura", "Con copertura"],
        datasets: [
          {
            label: "Patrimonio finale",
            data: [baseCapital, noCapital, yesCapital],
            backgroundColor: [baseGrad, noGrad, yesGrad],
            borderColor: ["rgba(77,104,216,.6)", "rgba(182,85,85,.7)", "rgba(62,118,116,.7)"],
            borderWidth: 1.5,
            borderRadius: 10,
            maxBarThickness: 52
          }
        ]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(23,35,51,.88)",
            titleColor: "#d6e0ee",
            bodyColor: "#b8c4d4",
            padding: 12,
            cornerRadius: 10,
            callbacks: {
              label: function (context) {
                return "Patrimonio: € " + context.parsed.x.toLocaleString("it-IT");
              },
              afterBody: function (items) {
                var label = items && items[0] ? items[0].label : "";
                if (label === "Piano base") return ["Patrimonio atteso senza sinistro."];
                if (label === "Senza copertura") return ["Capitale eroso dallo shock senza coperture."];
                if (label === "Con copertura") return ["Capitale preservato trasferendo il rischio."];
                return [];
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: "rgba(16,24,36,.06)" },
            border: { dash: [4, 3] },
            ticks: { font: { family: "Manrope", size: 10 }, color: "#8f98a5", callback: function (value) { return "€" + Math.round(value / 1000) + "k"; } }
          },
          y: {
            grid: { display: false },
            ticks: { font: { family: "Manrope", size: 11, weight: "600" }, color: "#5f6977" }
          }
        },
        animation: { duration: 700, easing: "easeInOutQuart" }
      }
    });
  }

  function renderSimpleScenarioGraphs(activeScenario) {
    var intro = byId("scenarioSimpleIntro");
    var pathLabel = byId("simplePathLabel");
    var gapLabel = byId("simpleGapLabel");
    var finalBaseCapital = lastValue(activeScenario.base && activeScenario.base.path ? activeScenario.base.path : []);
    var finalNoCapital = lastValue(activeScenario.noCoverage.path);
    var finalYesCapital = lastValue(activeScenario.withCoverage.path);
    if (intro) {
      intro.textContent = 'Scenario "' + activeScenario.label + '" letto sull\'obiettivo "' + S.analysis.focusGoal.name + '". Il blu mostra il patrimonio atteso senza shock, il rosso il capitale eroso dal sinistro non coperto, il verde quanto resta in piedi con le coperture attivate.';
    }
    if (pathLabel) {
      pathLabel.textContent = "Le tre curve partono dallo stesso patrimonio iniziale e separano chiaramente il costo reale di restare scoperti rispetto a trasferire il rischio.";
    }
    if (gapLabel) {
      gapLabel.textContent = "Alla data obiettivo il piano base vale € " + currency(finalBaseCapital) + ", scende a € " + currency(finalNoCapital) + " con il sinistro scoperto e risale a € " + currency(finalYesCapital) + " con coperture attive.";
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

    S.analysis = FamilyAdvisorEngine.analyzeScenarios(S.plan, overrides);
    S.activeScenarioMode = (S.analysis.bundleOrder || []).length ? "bundle" : "single";
    ensureScenarioSelection(previousGoalId !== S.analysis.focusGoal.id);
    renderScenario(S.activeScenarioId);
  }

  function renderImpactHero(activeScenario) {
    var el = byId("impactHero");
    if (!el || !activeScenario || !S.analysis) return;
    var economics = scenarioEconomics(activeScenario);
    var noProb = activeScenario.noCoverage.achievement;
    var yesProb = activeScenario.withCoverage.achievement;
    var probLift = Math.max(0, yesProb - noProb);
    var noGap = activeScenario.noCoverage.goalGap;
    var yesGap = activeScenario.withCoverage.goalGap;
    var noDelay = activeScenario.noCoverage.delayYears;
    var yesDelay = activeScenario.withCoverage.delayYears;
    var premium = economics.activePremium || economics.suggestedPremium;
    var noCapital = lastValue(activeScenario.noCoverage.path);
    var yesCapital = lastValue(activeScenario.withCoverage.path);
    var capitalDelta = Math.max(0, yesCapital - noCapital);

    el.innerHTML =
      '<div class="impact-hero">' +
      '<div class="impact-hero-side no">' +
      '<div class="impact-hero-badge no">✕ Senza copertura</div>' +
      '<div><div class="impact-hero-prob-num">' + esc(noProb) + '%</div><div class="impact-hero-prob-label">Probabilità di raggiungere l\'obiettivo</div></div>' +
      '<div class="impact-hero-metrics">' +
      '<div class="impact-hero-metric"><div class="impact-hero-metric-k">Gap finanziario</div><div class="impact-hero-metric-v">' + esc(noGap ? "€ " + currency(noGap) : "—") + '</div><div class="impact-hero-metric-s">' + esc(noGap ? "Capitale mancante al target" : "Target formalmente raggiunto") + '</div></div>' +
      '<div class="impact-hero-metric"><div class="impact-hero-metric-k">Ritardo stimato</div><div class="impact-hero-metric-v">' + esc(compactDelay(noDelay) || "—") + '</div><div class="impact-hero-metric-s">Slittamento sull\'obiettivo</div></div>' +
      '</div>' +
      '</div>' +
      '<div class="impact-hero-center">' +
      '<div class="impact-hero-arrow">↑</div>' +
      '<div class="impact-hero-lift"><div class="impact-hero-lift-v">+' + esc(probLift) + ' pt</div><div class="impact-hero-lift-s">Prob. recuperata</div></div>' +
      (capitalDelta > 0 ? '<div class="impact-hero-lift"><div class="impact-hero-lift-v">+€ ' + esc(Math.round(capitalDelta / 1000) + "k") + '</div><div class="impact-hero-lift-s">Capitale salvato</div></div>' : '') +
      (premium ? '<div class="impact-hero-premium"><div class="impact-hero-premium-v">€ ' + esc(currency(premium)) + '/mese</div><div class="impact-hero-premium-s">Premio</div></div>' : '') +
      '</div>' +
      '<div class="impact-hero-side yes">' +
      '<div class="impact-hero-badge yes">✓ Con copertura</div>' +
      '<div><div class="impact-hero-prob-num">' + esc(yesProb) + '%</div><div class="impact-hero-prob-label">Probabilità di raggiungere l\'obiettivo</div></div>' +
      '<div class="impact-hero-metrics">' +
      '<div class="impact-hero-metric"><div class="impact-hero-metric-k">Gap finanziario</div><div class="impact-hero-metric-v">' + esc(yesGap ? "€ " + currency(yesGap) : "—") + '</div><div class="impact-hero-metric-s">' + esc(yesGap ? "Gap residuo dopo copertura" : "Target protetto") + '</div></div>' +
      '<div class="impact-hero-metric"><div class="impact-hero-metric-k">Ritardo stimato</div><div class="impact-hero-metric-v">' + esc(compactDelay(yesDelay) || "—") + '</div><div class="impact-hero-metric-s">Con coperture attive</div></div>' +
      '</div>' +
      '</div>' +
      '</div>';
  }

  function renderScenario(scenarioId) {
    if (!S.analysis) return;
    var collection = currentScenarioCollection();
    if (!collection[scenarioId]) return;
    S.activeScenarioId = scenarioId;
    var activeScenario = collection[scenarioId];
    renderImpactHero(activeScenario);
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
      "fEta",
      "fSt",
      "fFi",
      "fProfession",
      "fAb",
      "fRnet",
      "fRi",
      "fPat",
      "fHomeCost",
      "fFixed"
    ].forEach(function (id) {
      var node = byId(id);
      if (!node) return;
      node.addEventListener("input", renderQuestionnaireProgressCard);
      node.addEventListener("change", renderQuestionnaireProgressCard);
    });
    root.addEventListener("afterprint", function () {
      document.body.classList.remove("print-mode");
    });
  }

  function boot() {
    bindEvents();
    resetClientWorkspace(false);
    renderProposalShelf();
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
  root.toggleOfferProduct = toggleOfferProduct;
  root.toggleOfferCoverageSelection = toggleOfferCoverageSelection;
  root.selectOfferCoverageSolution = selectOfferCoverageSolution;
  root.selectOfferProductSolution = selectOfferProductSolution;
  root.setVisualGender = setVisualGender;

  document.addEventListener("DOMContentLoaded", boot);
})(window);
