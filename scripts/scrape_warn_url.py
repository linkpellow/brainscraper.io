#!/usr/bin/env python3
"""
WARN-only Scrapegraph script. Run from Scrapegraph env:
  cd .cache/Scrapegraph-ai && uv run python ../../scripts/scrape_warn_url.py --url <url> [--prompt "override"]
Outputs JSON array of WARN rows to stdout, or {"error": "..."} on failure.
"""

import argparse
import json
import os
import sys


DEFAULT_PROMPT = """Extract a list of employers that filed WARN (Worker Adjustment and Retraining Notification) notices from this page.
For each notice provide: company or employer name, city, county or state, number of layoffs or jobs impacted, layoff or effective date, notice date if shown.
Return valid JSON only: a single array of objects. Each object must have these keys (use empty string if not found): companyName, city, stateOrCounty, layoffCount, layoffDate, noticeDate.
Do not include any text outside the JSON array."""


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape WARN data from a URL using Scrapegraph")
    parser.add_argument("--url", required=True, help="Page URL to scrape")
    parser.add_argument("--prompt", default=None, help="Override extraction prompt")
    args = parser.parse_args()

    url = args.url.strip()
    if not url.startswith(("http://", "https://")):
        out = json.dumps({"error": "URL must start with http:// or https://"})
        print(out, flush=True)
        sys.exit(1)

    prompt = (args.prompt or DEFAULT_PROMPT).strip()
    model = os.environ.get("OLLAMA_MODEL", "phi3:mini")
    if "/" not in model:
        model = f"ollama/{model}"

    try:
        from scrapegraphai.graphs import SmartScraperGraph
    except ImportError as e:
        out = json.dumps({"error": f"Scrapegraph import failed: {e}. Run from Scrapegraph env: cd .cache/Scrapegraph-ai && uv run python ../../scripts/scrape_warn_url.py ..."})
        print(out, flush=True)
        sys.exit(1)

    config = {
        "llm": {
            "model": model,
            "temperature": 0,
            "model_tokens": 4096,
            "format": "json",
        },
        "verbose": False,
        "headless": True,
    }

    try:
        graph = SmartScraperGraph(prompt=prompt, source=url, config=config)
        answer = graph.run()
    except Exception as e:
        out = json.dumps({"error": str(e)})
        print(out, flush=True)
        sys.exit(1)

    if not answer:
        out = json.dumps({"error": "No answer from scraper"})
        print(out, flush=True)
        sys.exit(1)

    # Scrapegraph can return a dict (e.g. {"content": [...]}) or a string (JSON/markdown)
    if isinstance(answer, dict):
        if "content" in answer and isinstance(answer["content"], list):
            data = answer["content"]
        elif "rows" in answer and isinstance(answer["rows"], list):
            data = answer["rows"]
        else:
            data = [answer]
        if not data:
            out = json.dumps({"error": "Scraper returned empty content"})
            print(out, flush=True)
            sys.exit(1)
    else:
        raw = answer.strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as e:
            out = json.dumps({"error": f"Scraper did not return valid JSON: {e}", "raw_preview": raw[:500]})
            print(out, flush=True)
            sys.exit(1)

    if isinstance(data, list):
        print(json.dumps(data, ensure_ascii=False), flush=True)
        return
    if isinstance(data, dict) and "error" in data:
        print(json.dumps(data), flush=True)
        sys.exit(1)
    if isinstance(data, dict) and "rows" in data:
        print(json.dumps(data["rows"], ensure_ascii=False), flush=True)
        return
    # Single object -> wrap in array
    if isinstance(data, dict):
        print(json.dumps([data], ensure_ascii=False), flush=True)
        return
    out = json.dumps({"error": "Expected JSON array or object", "got": type(data).__name__})
    print(out, flush=True)
    sys.exit(1)


if __name__ == "__main__":
    main()
