function jsonResponse(env, payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(env),
    },
  });
}

function corsHeaders(env) {
  const origin = env.ALLOWED_ORIGIN || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization",
  };
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeText(String(item)).toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function estimateTokens(text) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function chunkText(text, size = 900, overlap = 180) {
  const normalized = normalizeText(text).replace(/\s+/g, " ");
  if (!normalized) {
    return [];
  }

  const chunks = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    const slice = normalized.slice(cursor, cursor + size);
    if (!slice) {
      break;
    }

    chunks.push(slice);
    if (cursor + size >= normalized.length) {
      break;
    }

    cursor += Math.max(120, size - overlap);
  }

  return chunks;
}

function uniqueId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function embeddingVectors(result) {
  if (result && Array.isArray(result.data)) {
    return result.data;
  }

  if (result && Array.isArray(result.response)) {
    return result.response;
  }

  return [];
}

async function embedTexts(env, texts) {
  const payload = texts.filter(Boolean);
  if (!payload.length) {
    return [];
  }

  const embeddings = await env.AI.run(env.RAG_EMBED_MODEL, {
    text: payload,
    truncate_inputs: true,
  });

  const vectors = embeddingVectors(embeddings);
  if (!Array.isArray(vectors) || !vectors.length) {
    throw new Error("Embedding response vuota");
  }

  return vectors;
}

async function upsertDocument(env, document) {
  const now = new Date().toISOString();
  const documentId = normalizeText(document.id) || uniqueId("doc");
  const title = normalizeText(document.title);
  const text = normalizeText(document.text);

  if (!title || !text) {
    throw new Error("Ogni documento deve avere title e text");
  }

  const tags = normalizeTags(document.tags);
  const sourceType = normalizeText(document.sourceType) || "internal_note";
  const sourceUrl = normalizeText(document.sourceUrl) || null;
  const category = normalizeText(document.category) || "generic";
  const city = normalizeText(document.city) || null;
  const chunks = chunkText(text);

  if (!chunks.length) {
    throw new Error(`Documento ${title} vuoto dopo il chunking`);
  }

  const chunkVectors = await embedTexts(env, chunks);
  const vectorBatch = [];

  await env.DB.prepare(
    `INSERT INTO rag_documents (
      document_id,
      title,
      source_type,
      source_url,
      category,
      city,
      tags_json,
      content_hash,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(document_id) DO UPDATE SET
      title = excluded.title,
      source_type = excluded.source_type,
      source_url = excluded.source_url,
      category = excluded.category,
      city = excluded.city,
      tags_json = excluded.tags_json,
      content_hash = excluded.content_hash,
      updated_at = excluded.updated_at`
  )
    .bind(
      documentId,
      title,
      sourceType,
      sourceUrl,
      category,
      city,
      JSON.stringify(tags),
      `${text.length}:${estimateTokens(text)}`,
      now,
      now
    )
    .run();

  await env.DB.prepare("DELETE FROM rag_chunks WHERE document_id = ?")
    .bind(documentId)
    .run();

  for (let index = 0; index < chunks.length; index += 1) {
    const chunkId = `${documentId}::${index}`;
    const chunk = chunks[index];
    const metadata = {
      documentId,
      title,
      category,
      city,
      sourceType,
      sourceUrl,
      tags: tags.join(","),
      chunkIndex: index,
    };

    await env.DB.prepare(
      `INSERT INTO rag_chunks (
        chunk_id,
        document_id,
        chunk_index,
        content,
        token_estimate,
        metadata_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        chunkId,
        documentId,
        index,
        chunk,
        estimateTokens(chunk),
        JSON.stringify(metadata),
        now
      )
      .run();

    vectorBatch.push({
      id: chunkId,
      values: chunkVectors[index],
      metadata,
    });
  }

  await env.KNOWLEDGE_INDEX.upsert(vectorBatch);

  return {
    documentId,
    title,
    chunks: chunks.length,
    category,
    city,
  };
}

function extractAnswerContent(result) {
  return (
    result?.response ||
    result?.result?.response ||
    result?.choices?.[0]?.message?.content ||
    result?.result?.choices?.[0]?.message?.content ||
    ""
  );
}

function parseStructuredJson(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return null;
  }

  try {
    return JSON.parse(normalized);
  } catch {}

  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(normalized.slice(start, end + 1));
    } catch {}
  }

  return null;
}

async function fetchChunkTexts(env, ids) {
  if (!ids.length) {
    return new Map();
  }

  const placeholders = ids.map(() => "?").join(", ");
  const stmt = env.DB.prepare(
    `SELECT chunk_id, content FROM rag_chunks WHERE chunk_id IN (${placeholders})`
  ).bind(...ids);
  const rows = await stmt.all();
  const map = new Map();

  for (const row of rows.results || []) {
    map.set(row.chunk_id, row.content);
  }

  return map;
}

async function retrieveContext(env, queryText, topK) {
  const [queryVector] = await embedTexts(env, [queryText]);
  const matches = await env.KNOWLEDGE_INDEX.query(queryVector, {
    topK,
    returnMetadata: "all",
  });

  const vectorMatches = matches?.matches || [];
  const chunkIds = vectorMatches.map((match) => match.id);
  const chunkTextMap = await fetchChunkTexts(env, chunkIds);

  return vectorMatches
    .map((match, index) => {
      const metadata = match.metadata || {};
      const content = chunkTextMap.get(match.id) || "";
      if (!content) {
        return null;
      }

      return {
        rank: index + 1,
        chunkId: match.id,
        score: Number(match.score || 0),
        title: metadata.title || "Documento",
        category: metadata.category || "generic",
        city: metadata.city || null,
        sourceType: metadata.sourceType || "internal_note",
        sourceUrl: metadata.sourceUrl || null,
        content,
      };
    })
    .filter(Boolean);
}

async function retrieveContextMulti(env, queries, topKPerQuery, finalLimit) {
  const merged = new Map();

  for (const queryText of queries.filter(Boolean)) {
    const items = await retrieveContext(env, queryText, topKPerQuery);
    for (const item of items) {
      const existing = merged.get(item.chunkId);
      if (!existing || item.score > existing.score) {
        merged.set(item.chunkId, item);
      }
    }
  }

  return Array.from(merged.values())
    .sort((left, right) => right.score - left.score)
    .slice(0, finalLimit)
    .map((item, index) => ({
      ...item,
      rank: index + 1,
    }));
}

function buildContextBlock(contextItems) {
  return contextItems
    .map((item) => {
      return [
        `[${item.rank}] ${item.title}`,
        `categoria: ${item.category}`,
        item.city ? `citta: ${item.city}` : null,
        `testo: ${item.content}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function buildContextMeta(env, contextItems) {
  return {
    citations: contextItems.map((item) => ({
      ref: item.rank,
      title: item.title,
      category: item.category,
      city: item.city,
      sourceType: item.sourceType,
      sourceUrl: item.sourceUrl,
      chunkId: item.chunkId,
      score: item.score,
    })),
    matches: contextItems.map((item) => ({
      chunkId: item.chunkId,
      title: item.title,
      score: item.score,
      category: item.category,
      city: item.city,
    })),
    models: {
      llm: env.RAG_LLM_MODEL,
      embedding: env.RAG_EMBED_MODEL,
    },
  };
}

async function runRagCompletion(env, systemPrompt, userPrompt, maxTokens = 550) {
  const llmResult = await env.AI.run(env.RAG_LLM_MODEL, {
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: maxTokens,
  });

  return normalizeText(extractAnswerContent(llmResult));
}

async function handleQuery(request, env) {
  const body = await parseJson(request);
  if (!body) {
    return jsonResponse(env, { error: "Body JSON non valido" }, 400);
  }

  const question = normalizeText(body.question);
  const audience = normalizeText(body.audience) || "advisor";
  const topK = Math.min(10, Math.max(2, toInt(body.topK, toInt(env.RAG_TOP_K, 6))));

  if (!question) {
    return jsonResponse(env, { error: "question obbligatoria" }, 400);
  }

  const contextItems = await retrieveContext(env, question, topK);

  if (!contextItems.length) {
    return jsonResponse(env, {
      answer:
        "Non ho ancora abbastanza contesto nel knowledge base per rispondere bene a questa domanda.",
      citations: [],
      matches: [],
    });
  }

  const contextBlock = buildContextBlock(contextItems);

  const systemPrompt = [
    "Sei l'assistente RAG del simulatore assicurativo FamilyAdvisor.",
    "Rispondi in italiano, con tono chiaro e professionale.",
    "Usa solo il contesto recuperato.",
    "Non inventare premi, benchmark o regole che non sono nel contesto.",
    "Se il contesto contiene gia un benchmark numerico pertinente, apri la risposta dando subito il numero e la sua unita di misura.",
    "Non dire che non puoi rispondere se il contesto offre almeno un benchmark utile; chiarisci semmai quali elementi aggiuntivi servirebbero per affinare la stima.",
    "Se il contesto non basta davvero, dillo chiaramente.",
    "Non sostituirti al motore matematico: il motore deterministico resta il riferimento per punteggi e simulazioni.",
    audience === "client"
      ? "Scrivi per un cliente finale, con frasi semplici e molto concrete."
      : "Scrivi per un consulente assicurativo, con spiegazione sintetica ma rigorosa.",
  ].join(" ");

  const userPrompt = [
    `Domanda: ${question}`,
    "",
    "Contesto recuperato:",
    contextBlock,
    "",
    "Restituisci una risposta sintetica con massimo 3 paragrafi e cita tra parentesi quadre i riferimenti [1], [2] quando usi un passaggio del contesto.",
    "Se la domanda chiede 'quanto costa', 'qual e il benchmark' o 'quanto serve', rispondi nel primo periodo con il numero principale ricavabile dal contesto.",
  ].join("\n");

  const answer = await runRagCompletion(env, systemPrompt, userPrompt, 550);

  return jsonResponse(
    env,
    Object.assign(
      {
        answer,
      },
      buildContextMeta(env, contextItems)
    )
  );
}

async function handleIntake(request, env) {
  const body = await parseJson(request);
  if (!body) {
    return jsonResponse(env, { error: "Body JSON non valido" }, 400);
  }

  const note = normalizeText(body.note);
  const profileSummary = normalizeText(body.profileSummary);
  const retrievalHint = normalizeText(body.retrievalHint);
  const missingFields = Array.isArray(body.missingFields)
    ? body.missingFields
        .map((item) => normalizeText(String(item)))
        .filter(Boolean)
        .slice(0, 5)
    : [];
  const topK = Math.min(8, Math.max(3, toInt(body.topK, 5)));
  const queryText = [retrievalHint, profileSummary, note, missingFields.join(" ")].filter(Boolean).join(" \n ");

  if (!queryText) {
    return jsonResponse(env, { error: "note o profileSummary obbligatori" }, 400);
  }

  const contextItems = await retrieveContextMulti(
    env,
    [retrievalHint, profileSummary, note, queryText],
    Math.max(3, Math.min(5, topK)),
    topK
  );

  if (!contextItems.length) {
    return jsonResponse(env, {
      summary: profileSummary || note,
      benchmark: "",
      nextQuestion: missingFields.length
        ? "Per completare il questionario chiederei prima " + missingFields[0] + "."
        : "",
      missingFields,
      citations: [],
      matches: [],
      models: {
        llm: env.RAG_LLM_MODEL,
        embedding: env.RAG_EMBED_MODEL,
      },
    });
  }

  const contextBlock = buildContextBlock(contextItems);
  const systemPrompt = [
    "Sei l'assistente intake RAG del simulatore assicurativo FamilyAdvisor.",
    "Aiuti un consulente a leggere appunti cliente prima di aprire il questionario.",
    "Usa solo il contesto recuperato e i dati ricevuti.",
    "Non parlare di polizze o raccomandazioni di prodotto se non richiesto esplicitamente.",
    "Non chiedere dati che sono gia presenti negli appunti o nel profilo strutturato.",
    "Se nel contesto trovi benchmark obiettivo casa, benchmark studi figli o benchmark legati alla citta del cliente, preferiscili ai benchmark nazionali generici su reddito o patrimonio.",
    "Restituisci solo JSON valido.",
    "Formato obbligatorio: {\"summary\":\"...\",\"benchmark\":\"...\",\"nextQuestion\":\"...\",\"missingFields\":[\"...\"]}.",
    "summary: massimo 2 frasi, tono consulenziale, focalizzata sul caso.",
    "benchmark: massimo 1 frase con al massimo 2 numeri reali tratti dal contesto; se non c'e un benchmark utile lascia stringa vuota.",
    "nextQuestion: una sola domanda breve e naturale che aiuta il consulente a completare il profilo, preferendo il primo campo davvero mancante.",
    "missingFields: massimo 3 elementi, in italiano, solo se davvero mancanti o utili a migliorare la stima.",
  ].join(" ");

  const userPrompt = [
    `Appunti grezzi: ${note || "n.d."}`,
    `Profilo strutturato finora: ${profileSummary || "n.d."}`,
    `Campi mancanti gia rilevati: ${missingFields.join(", ") || "nessuno"}`,
    "",
    "Contesto recuperato:",
    contextBlock,
    "",
    "Restituisci solo il JSON richiesto.",
  ].join("\n");

  const raw = await runRagCompletion(env, systemPrompt, userPrompt, 320);
  const parsed = parseStructuredJson(raw) || {};
  const resolvedMissingFields = Array.isArray(parsed.missingFields)
    ? parsed.missingFields
        .map((item) => normalizeText(String(item)))
        .filter(Boolean)
        .slice(0, 3)
    : missingFields.slice(0, 3);
  const fallbackQuestion = resolvedMissingFields.length
    ? "Qual e il prossimo dato chiave che vuoi verificare per primo?"
    : "Qual e il prossimo dato che vuoi confermare nel questionario?";
  const parsedQuestion = normalizeText(parsed.nextQuestion);
  const questionMatchesMissing = resolvedMissingFields.some((item) =>
    normalizeText(parsedQuestion).toLowerCase().includes(item.toLowerCase())
  );
  const deterministicQuestion = resolvedMissingFields.length
    ? `Mi aiuta a completare ${resolvedMissingFields[0]}?`
    : fallbackQuestion;

  return jsonResponse(
    env,
    Object.assign(
      {
        summary: normalizeText(parsed.summary) || profileSummary || note,
        benchmark: normalizeText(parsed.benchmark),
        nextQuestion: parsedQuestion && (!resolvedMissingFields.length || questionMatchesMissing)
          ? parsedQuestion
          : deterministicQuestion,
        missingFields: resolvedMissingFields,
      },
      buildContextMeta(env, contextItems)
    )
  );
}

async function handleIngest(request, env) {
  const body = await parseJson(request);
  if (!body || !Array.isArray(body.documents) || !body.documents.length) {
    return jsonResponse(
      env,
      { error: "documents deve essere un array non vuoto" },
      400
    );
  }

  const results = [];

  for (const document of body.documents.slice(0, 25)) {
    const ingested = await upsertDocument(env, document);
    results.push(ingested);
  }

  return jsonResponse(env, {
    ingested: results.length,
    results,
  });
}

async function handleListDocuments(env) {
  const rows = await env.DB.prepare(
    `SELECT
      d.document_id,
      d.title,
      d.category,
      d.city,
      d.source_type,
      d.source_url,
      d.updated_at,
      COUNT(c.chunk_id) AS chunk_count
    FROM rag_documents d
    LEFT JOIN rag_chunks c ON c.document_id = d.document_id
    GROUP BY
      d.document_id,
      d.title,
      d.category,
      d.city,
      d.source_type,
      d.source_url,
      d.updated_at
    ORDER BY d.updated_at DESC
    LIMIT 100`
  ).all();

  return jsonResponse(env, {
    documents: rows.results || [],
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse(env, {
        ok: true,
        service: "simulatore-rag-api",
        llmModel: env.RAG_LLM_MODEL,
        embeddingModel: env.RAG_EMBED_MODEL,
      });
    }

    try {
      if (request.method === "POST" && url.pathname === "/api/rag/query") {
        return await handleQuery(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/rag/intake") {
        return await handleIntake(request, env);
      }

      if (request.method === "POST" && url.pathname === "/api/rag/ingest") {
        return await handleIngest(request, env);
      }

      if (request.method === "GET" && url.pathname === "/api/rag/documents") {
        return await handleListDocuments(env);
      }
    } catch (error) {
      return jsonResponse(
        env,
        {
          error: error instanceof Error ? error.message : "Errore inatteso",
        },
        500
      );
    }

    return jsonResponse(env, { error: "Not found" }, 404);
  },
};
