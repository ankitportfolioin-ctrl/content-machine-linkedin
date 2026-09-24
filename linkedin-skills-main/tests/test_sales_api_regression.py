"""Regression tests for sales_api bridge endpoints.

Verifies:
1. Prospect research endpoint returns expected fields matching ResearchResult:
   - Uses canonical ResearchResult fields: profile_summary, relevant_signals, personalization_points
   - No AttributeError is raised
2. CRM listing endpoint:
   - Returns all CRM prospects when stage parameter is omitted (or None / empty)
   - Returns only prospects matching the specified stage when stage parameter is provided (e.g., READY_FOR_REVIEW)
"""
from __future__ import annotations

import shutil
import tempfile
import unittest
from unittest.mock import patch

from lib.crm.pipeline import CRMPipeline, PipelineStage
from lib.intelligence.prospect_researcher import ResearchResult
from lib.research.prospect import Prospect
from lib.sales_api import cmd_crm_list, cmd_research_prospect
from lib.storage.store import LocalFileStore
from lib.workflow_engine import WorkflowEngine


class TestSalesApiRegression(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.store = LocalFileStore(base_dir=self.test_dir)
        self.engine = WorkflowEngine(store=self.store, dry_run=True)
        self.crm = CRMPipeline(store=self.store)

    def tearDown(self):
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_research_prospect_schema_matches_research_result(self):
        """Verifies cmd_research_prospect returns canonical ResearchResult fields without AttributeError."""
        p = Prospect(
            name="Elena Rostova",
            company="Nexis Analytics",
            job_title="VP of Engineering",
            industry="B2B SaaS",
            location="Berlin, Germany",
        )
        p.research.recent_activity = [
            "Shared article on migrating distributed systems to micro-frontends.",
            "Commented on optimizing Postgres connection pooling in high-throughput clusters.",
        ]
        self.engine.save_prospect(p)

        with patch("lib.sales_api.get_engine", return_value=self.engine):
            result = cmd_research_prospect({"prospect_id": p.id, "offering": "Developer productivity tools"})

        # Must be valid dictionary matching canonical ResearchResult schema
        self.assertIsInstance(result, dict)
        self.assertIn("profile_summary", result)
        self.assertIn("relevant_signals", result)
        self.assertIn("personalization_points", result)

        self.assertIsInstance(result["profile_summary"], str)
        self.assertTrue(len(result["profile_summary"]) > 0)
        self.assertIsInstance(result["relevant_signals"], list)
        self.assertTrue(len(result["relevant_signals"]) > 0)
        self.assertIsInstance(result["personalization_points"], list)
        self.assertTrue(len(result["personalization_points"]) > 0)

        # Ensure deprecated / non-canonical fields are not expected
        self.assertNotIn("company_summary", result)
        self.assertNotIn("likely_priorities", result)
        self.assertNotIn("recent_post_hook", result)

        # Verify prospect research record was properly updated in storage
        updated_p = self.engine.get_prospect(p.id)
        self.assertIsNotNone(updated_p)
        self.assertEqual(updated_p.research.summary, result["profile_summary"])
        self.assertEqual(updated_p.research.relevant_topics, result["relevant_signals"])
        self.assertEqual(updated_p.research.personalization_points, result["personalization_points"])

    def test_crm_list_unfiltered_returns_all_records(self):
        """Verifies cmd_crm_list returns all records when stage is omitted or empty."""
        p1 = Prospect(name="Prospect One", company="Alpha Corp")
        p2 = Prospect(name="Prospect Two", company="Beta Corp")
        p3 = Prospect(name="Prospect Three", company="Gamma Corp")

        self.crm.upsert_prospect(p1, initial_stage=PipelineStage.DISCOVERED.value)
        self.crm.upsert_prospect(p2, initial_stage=PipelineStage.QUALIFIED.value)
        self.crm.upsert_prospect(p3, initial_stage="READY_FOR_REVIEW")

        with patch("lib.sales_api.get_storage", return_value=self.store):
            # 1. Empty payload
            all_records = cmd_crm_list({})
            self.assertEqual(len(all_records), 3)

            # 2. None stage
            records_none = cmd_crm_list({"stage": None})
            self.assertEqual(len(records_none), 3)

            # 3. Empty string stage
            records_empty = cmd_crm_list({"stage": ""})
            self.assertEqual(len(records_empty), 3)

            # 4. "ALL" stage
            records_all = cmd_crm_list({"stage": "ALL"})
            self.assertEqual(len(records_all), 3)

            returned_ids = {r["prospect_id"] for r in all_records}
            self.assertEqual(returned_ids, {p1.id, p2.id, p3.id})

    def test_crm_list_filtered_by_stage(self):
        """Verifies cmd_crm_list filters records accurately when stage is specified."""
        p_review = Prospect(name="Review Lead", company="Delta Corp")
        p_won = Prospect(name="Won Deal", company="Epsilon Corp")
        p_contacted = Prospect(name="Contacted Lead", company="Zeta Corp")

        self.crm.upsert_prospect(p_review, initial_stage="READY_FOR_REVIEW")
        self.crm.upsert_prospect(p_won, initial_stage=PipelineStage.WON.value)
        self.crm.upsert_prospect(p_contacted, initial_stage=PipelineStage.CONTACTED.value)

        with patch("lib.sales_api.get_storage", return_value=self.store):
            # Filter for READY_FOR_REVIEW
            review_results = cmd_crm_list({"stage": "READY_FOR_REVIEW"})
            self.assertEqual(len(review_results), 1)
            self.assertEqual(review_results[0]["prospect_id"], p_review.id)
            self.assertEqual(review_results[0]["stage"], "READY_FOR_REVIEW")

            # Filter case-insensitively
            review_lower = cmd_crm_list({"stage": "ready_for_review"})
            self.assertEqual(len(review_lower), 1)
            self.assertEqual(review_lower[0]["prospect_id"], p_review.id)

            # Filter for WON
            won_results = cmd_crm_list({"stage": "WON"})
            self.assertEqual(len(won_results), 1)
            self.assertEqual(won_results[0]["prospect_id"], p_won.id)
            self.assertEqual(won_results[0]["stage"], "WON")

            # Filter for non-existent stage returns empty list
            empty_results = cmd_crm_list({"stage": "NON_EXISTENT_STAGE"})
            self.assertEqual(empty_results, [])


if __name__ == "__main__":
    unittest.main()
