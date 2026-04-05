#!/usr/bin/env python3
import argparse
import json
import math
import sys
import urllib.request
from pathlib import Path


DEFAULT_ENDPOINT = "https://simulatore-rag-api.alquati99.workers.dev/api/rag/ingest"
DEFAULT_SOURCE = (
    Path(__file__).resolve().parents[1]
    / "cloudflare"
    / "rag-worker"
    / "seed"
    / "knowledge-base.json"
)


def load_documents(path):
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    documents = payload.get("documents")
    if not isinstance(documents, list) or not documents:
        raise ValueError(f"Nessun documento valido trovato in {path}")
    return documents


def post_batch(endpoint, documents, timeout):
    body = json.dumps({"documents": documents}, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "familyadvisor-rag-ingest/1.0",
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8"))

    return payload


def main():
    parser = argparse.ArgumentParser(
        description="Carica in batch la knowledge base sul worker RAG Cloudflare."
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE,
        help="File JSON con chiave documents",
    )
    parser.add_argument(
        "--endpoint",
        default=DEFAULT_ENDPOINT,
        help="Endpoint /api/rag/ingest del worker",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=25,
        help="Numero documenti per chiamata; il worker oggi ne accetta max 25",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=120,
        help="Timeout in secondi per singola richiesta",
    )
    args = parser.parse_args()

    documents = load_documents(args.source)
    total = len(documents)
    batch_size = max(1, min(args.batch_size, 25))
    total_batches = math.ceil(total / batch_size)
    ingested = 0

    for index in range(total_batches):
        start = index * batch_size
        end = start + batch_size
        batch = documents[start:end]
        response = post_batch(args.endpoint, batch, args.timeout)
        ingested += int(response.get("ingested", 0))
        print(
            json.dumps(
                {
                    "batch": index + 1,
                    "total_batches": total_batches,
                    "requested_documents": len(batch),
                    "ingested_documents": response.get("ingested", 0),
                },
                ensure_ascii=False,
            )
        )

    print(
        json.dumps(
            {
                "source": str(args.source),
                "endpoint": args.endpoint,
                "documents": total,
                "batch_size": batch_size,
                "batches": total_batches,
                "ingested": ingested,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)
