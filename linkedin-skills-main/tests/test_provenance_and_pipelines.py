"""Unit tests for authoritative claim provenance, pipelines, and discovery honesty."""
from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

# Add root to sys.path
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.content.calendar import ContentCalendar
from lib.content_pipeline import (
    bridge_content_to_sales,
    bridge_sales_to_content,
    check_source_contradictions,
    pipeline_article_to_content,
    pipeline_idea_to_content,
    switch_persona,
    validate_carousel_execution,
)
from lib.provenance import ProvenanceLevel, ValidationStatus, validate_content_claims
from lib.research.icp import ICP
from lib.research.prospect_discovery import discover_prospects, DiscoveryUnavailableResult
from lib.workflow_engine import WorkflowEngine


class TestProvenanceAndQualityGates(unittest.TestCase):
    def test_unsupported_study_claim_blocked(self):
        text = "We analyzed 40 B2B founders who crossed $1M ARR via LinkedIn."
        report = validate_content_claims(text)
        self.assertEqual(report.status, ValidationStatus.REVIEW_REQUIRED.value)
        self.assertGreaterEqual(report.unsupported_count, 1)
        unavail = [c for c in report.claims if c.provenance == ProvenanceLevel.UNAVAILABLE.value]
        self.assertTrue(len(unavail) >= 1)
        cli_out = report.render_cli()
        self.assertIn("STATUS: REVIEW_REQUIRED", cli_out)
        self.assertIn("EVIDENCE:\nUNAVAILABLE", cli_out)

    def test_unsupported_metric_delta_blocked(self):
        text = "Response rate jumps from 1.5% to 24% when using peer observations."
        report = validate_content_claims(text)
        self.assertEqual(report.status, ValidationStatus.REVIEW_REQUIRED.value)

    def test_unsupported_hiring_assertion_blocked(self):
        text = "In 2024, I hired for resume logos instead of domain velocity."
        report = validate_content_claims(text)
        self.assertEqual(report.status, ValidationStatus.REVIEW_REQUIRED.value)

    def test_verified_user_receipt_accepted(self):
        text = "We built distributed microservices serving 10M daily requests without downtime."
        receipts = ["Built distributed microservices serving 10M daily requests"]
        report = validate_content_claims(text, user_receipts=receipts)
        self.assertEqual(report.status, ValidationStatus.PASSED.value)
        self.assertEqual(report.unsupported_count, 0)

    def test_source_contradiction_gate(self):
        res = check_source_contradictions(
            title="5 High-Income Skills Worth Learning in 2026",
            body="Developing these seven skills could lead to more job opportunities.",
        )
        self.assertTrue(res["is_contradictory"])
        self.assertIn("Title claims 5 items but body explicitly specifies 7", res["reason"])

    def test_carousel_validation_enforces_quality(self):
        # Invalid: < 3 slides, filler header, duplicate body
        bad_carousel = {
            "slides": [
                {"headline": "Slide 1", "body": "Same body text."},
                {"headline": "Slide 2", "body": "Same body text."},
            ]
        }
        val_bad = validate_carousel_execution(bad_carousel)
        self.assertFalse(val_bad["isValid"])
        self.assertTrue(len(val_bad["errors"]) >= 2)

        # Valid: 3 slides with concrete headings and unique bodies
        good_carousel = {
            "slides": [
                {"headline": "Architectural Latency Drivers", "body": "Cold-start GPU virtualization introduces p99 bottlenecks."},
                {"headline": "Monotonic Gossip Consensus", "body": "Asynchronous protocols resolve split-brain cluster partitions."},
                {"headline": "Practical Production Checklist", "body": "Enforce monotonic sequence numbers before state commit."},
            ]
        }
        val_good = validate_carousel_execution(good_carousel)
        self.assertTrue(val_good["isValid"])

    def test_apify_missing_credentials_returns_discovery_unavailable(self):
        # Temporarily clear APIFY env vars
        old_token = os.environ.pop("APIFY_TOKEN", None)
        old_api_token = os.environ.pop("APIFY_API_TOKEN", None)
        try:
            res = discover_prospects(criteria=ICP(), backend="apify")
            self.assertEqual(res, "DISCOVERY_UNAVAILABLE")
            self.assertEqual(str(res), "DISCOVERY_UNAVAILABLE")
            self.assertEqual(getattr(res, "status", None), "DISCOVERY_UNAVAILABLE")
        finally:
            if old_token is not None:
                os.environ["APIFY_TOKEN"] = old_token
            if old_api_token is not None:
                os.environ["APIFY_API_TOKEN"] = old_api_token

    def test_persona_switching_and_isolation(self):
        tech = switch_persona("TECH_CREATOR", workspace_id="ws_test")
        self.assertEqual(tech["role"], "Tech Creator & Educator")
        self.assertIn("Distributed Systems", tech["contentPillars"])

        d2c = switch_persona("D2C_FOUNDER", workspace_id="ws_test")
        self.assertEqual(d2c["role"], "D2C Founder & Brand Operator")
        self.assertIn("Customer Retention", d2c["contentPillars"])
        self.assertNotIn("Distributed Systems", d2c["contentPillars"])

    def test_bidirectional_bridges(self):
        opp = bridge_sales_to_content("Your pricing seems higher than offshore alternatives.")
        self.assertIn("opportunity_id", opp)
        self.assertIn("pricing", opp["suggestedTopic"].lower())

        from lib.research.prospect import Prospect
        from lib.storage.store import get_storage
        store = get_storage()
        store.save_item("prospects", "p_seed_1", {
            "id": "p_seed_1", "name": "Elena Rostova", "job_title": "VP of Growth", "company": "FinCore", "industry": "B2B SaaS"
        })

        matches = bridge_content_to_sales("Distributed Systems Consensus")
        self.assertIn("matchedCount", matches)
        self.assertTrue(len(matches["targets"]) >= 1)


if __name__ == "__main__":
    unittest.main()
