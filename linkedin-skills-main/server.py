"""HTTP API Application Layer for LinkedIn AI Growth Operator (Python).

Exposes standard HTTP API endpoints executing real underlying pipeline logic:
- POST /api/content/pipeline/article
- POST /api/content/pipeline/idea
- POST /api/persona/switch
- POST /api/bridge/sales-to-content
- POST /api/bridge/content-to-sales
- POST /api/content/carousel/validate
- GET  /api/health
"""
from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Dict

# Ensure ROOT is in path
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.content_pipeline import (
    bridge_content_to_sales,
    bridge_sales_to_content,
    get_current_persona,
    pipeline_article_to_content,
    pipeline_idea_to_content,
    switch_persona,
    validate_carousel_execution,
)
from lib.provenance import validate_content_claims


class GrowthOperatorApiHandler(BaseHTTPRequestHandler):
    def _send_json(self, status_code: int, data: Dict[str, Any]):
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, x-workspace-id")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, x-workspace-id")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/health":
            self._send_json(200, {"status": "ok", "runtime": "python-growth-operator"})
        elif self.path == "/api/persona/current":
            ws_id = self.headers.get("x-workspace-id", "default")
            profile = get_current_persona(workspace_id=ws_id)
            self._send_json(200, {"profile": profile})
        else:
            self._send_json(404, {"error": f"Endpoint '{self.path}' not found."})

    def do_POST(self):
        content_len = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_len).decode("utf-8") if content_len > 0 else "{}"
        try:
            payload = json.loads(raw_body)
        except Exception:
            payload = {}

        ws_id = self.headers.get("x-workspace-id", "default")

        # 1. POST /api/content/pipeline/article
        if self.path == "/api/content/pipeline/article":
            url = payload.get("url")
            if not url:
                return self._send_json(400, {"error": "Missing 'url' in payload."})
            voice_profile = payload.get("voiceProfile") or get_current_persona(ws_id)
            fallback = payload.get("fallbackArticle")
            res = pipeline_article_to_content(url, voice_profile=voice_profile, fallback_article=fallback)
            return self._send_json(200, res)

        # 2. POST /api/content/pipeline/idea
        elif self.path == "/api/content/pipeline/idea":
            idea = payload.get("idea")
            if not idea:
                return self._send_json(400, {"error": "Missing 'idea' in payload."})
            voice_profile = payload.get("voiceProfile") or get_current_persona(ws_id)
            res = pipeline_idea_to_content(idea, voice_profile=voice_profile)
            return self._send_json(200, res)

        # 3. POST /api/persona/switch
        elif self.path == "/api/persona/switch":
            persona = payload.get("persona")
            if not persona or persona.upper() not in ("TECH_CREATOR", "D2C_FOUNDER"):
                return self._send_json(400, {"error": "persona must be TECH_CREATOR or D2C_FOUNDER."})
            try:
                profile = switch_persona(persona, workspace_id=ws_id)
                return self._send_json(200, {"success": True, "persona": persona, "profile": profile})
            except Exception as e:
                return self._send_json(500, {"error": str(e)})

        # 4. POST /api/bridge/sales-to-content
        elif self.path == "/api/bridge/sales-to-content":
            objection = payload.get("objectionText")
            if not objection:
                return self._send_json(400, {"error": "Missing 'objectionText' in payload."})
            opp = bridge_sales_to_content(
                objection_text=objection,
                prospect_name=payload.get("prospectName"),
                company=payload.get("company"),
            )
            return self._send_json(200, {"success": True, "opportunity": opp})

        # 5. POST /api/bridge/content-to-sales
        elif self.path == "/api/bridge/content-to-sales":
            topic = payload.get("contentTopic")
            if not topic:
                return self._send_json(400, {"error": "Missing 'contentTopic' in payload."})
            res = bridge_content_to_sales(topic, content_text=payload.get("contentText"))
            return self._send_json(200, res)

        # 6. POST /api/content/carousel/validate
        elif self.path == "/api/content/carousel/validate":
            execution = payload.get("execution") or {}
            val = validate_carousel_execution(execution)
            return self._send_json(200, val)

        else:
            self._send_json(404, {"error": f"Endpoint '{self.path}' not found."})


def run_server(port: int = 3000):
    server_address = ("", port)
    httpd = HTTPServer(server_address, GrowthOperatorApiHandler)
    print(f"🚀 LinkedIn Growth Operator HTTP server listening on http://localhost:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
        httpd.server_close()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 3000
    run_server(port)
