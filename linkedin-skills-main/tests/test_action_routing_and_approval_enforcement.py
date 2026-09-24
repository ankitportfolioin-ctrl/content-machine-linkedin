"""Regression tests for action routing semantics and human approval enforcement.

Verifies:
1. LinkedInActionBackend explicit methods:
   - send_connection_request
   - send_direct_message
   - create_comment
   - create_post
2. ManualBackend instruction text formatting
3. WorkflowEngine routing semantics (no create_comment fallback for DMs/connect requests)
4. Approval gate state machine:
   - pending -> blocked
   - approved -> executable
   - rejected -> blocked
   - already executed -> duplicate blocked
   - unknown action -> blocked
"""
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from lib.approval import ActionKind, ApprovalCard, ApprovalManager, ApprovalStatus
from lib.clients.backend_interface import ActionResult, LinkedInActionBackend, ManualBackend
from lib.research.prospect import Prospect
from lib.storage.store import LocalFileStore
from lib.workflow_engine import UnsupportedActionError, WorkflowEngine, WorkflowState


class MockCustomBackend(LinkedInActionBackend):
    def __init__(self):
        self.posts = []
        self.comments = []
        self.connection_requests = []
        self.direct_messages = []

    @property
    def name(self) -> str:
        return "mock_custom"

    def create_post(self, content, media_urls=None):
        self.posts.append(content)
        return ActionResult(success=True, action_type="post", target="feed", message="ok")

    def create_comment(self, post_url, comment_text):
        self.comments.append((post_url, comment_text))
        return ActionResult(success=True, action_type="comment", target=post_url, message="ok")

    def send_connection_request(self, profile_url, note):
        self.connection_requests.append((profile_url, note))
        return ActionResult(success=True, action_type="connection_request", target=profile_url, message="ok")

    def send_direct_message(self, profile_url, text):
        self.direct_messages.append((profile_url, text))
        return ActionResult(success=True, action_type="first_message", target=profile_url, message="ok")

    def create_reply(self, comment_url, reply_text):
        return ActionResult(success=True, action_type="reply", target=comment_url, message="ok")

    def create_reaction(self, target_url, reaction_type="LIKE"):
        return ActionResult(success=True, action_type="reaction", target=target_url, message="ok")

    def schedule_post(self, content, publish_at, media_urls=None):
        return ActionResult(success=True, action_type="schedule_post", target="feed", message="ok")

    def get_post(self, post_url):
        return ActionResult(success=True, action_type="get_post", target=post_url, message="ok")

    def get_comments(self, post_url):
        return ActionResult(success=True, action_type="get_comments", target=post_url, message="ok")


class TestActionRoutingAndManualBackend(unittest.TestCase):
    def setUp(self):
        self.backend = ManualBackend()

    def test_manual_backend_connection_request_format(self):
        res = self.backend.send_connection_request(
            profile_url="https://www.linkedin.com/in/satyanadella",
            note="Hi Satya, impressed by your cloud focus. Would love to connect.",
        )
        self.assertTrue(res.success)
        self.assertEqual(res.action_type, "connection_request")
        self.assertIn("Open this LinkedIn profile:\nhttps://www.linkedin.com/in/satyanadella", res.message)
        self.assertIn("Send a connection request with:\nHi Satya, impressed by your cloud focus.", res.message)
        # Ensure it does not say to comment
        self.assertNotIn("comment", res.message.lower())

    def test_manual_backend_first_message_format(self):
        res = self.backend.send_direct_message(
            profile_url="https://www.linkedin.com/in/satyanadella",
            text="Following up on our connection—wanted to share this benchmark.",
        )
        self.assertTrue(res.success)
        self.assertEqual(res.action_type, "first_message")
        self.assertIn("Open this LinkedIn profile/conversation:\nhttps://www.linkedin.com/in/satyanadella", res.message)
        self.assertIn("Send this message:\nFollowing up on our connection", res.message)
        self.assertNotIn("comment", res.message.lower())

    def test_manual_backend_comment_format(self):
        res = self.backend.create_comment(
            post_url="https://www.linkedin.com/feed/update/urn:li:activity:123456789/",
            comment_text="Insightful breakdown on API latency optimizations.",
        )
        self.assertTrue(res.success)
        self.assertEqual(res.action_type, "comment")
        self.assertIn("Open this LinkedIn post:\nhttps://www.linkedin.com/feed/update/urn:li:activity:123456789/", res.message)
        self.assertIn("Post this comment:\nInsightful breakdown on API latency optimizations.", res.message)


class TestApprovalEnforcementAndWorkflowRouting(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.store = LocalFileStore(base_dir=self.temp_dir)
        self.engine = WorkflowEngine(store=self.store, dry_run=False)
        self.mock_backend = MockCustomBackend()

        # Seed prospect
        self.prospect = Prospect(
            name="Elena Rostova",
            linkedin_url="https://www.linkedin.com/in/elena-rostova",
            company="FinTech Core",
            job_title="VP Engineering",
        )
        self.engine.save_prospect(self.prospect)

    def test_workflow_engine_routes_connection_request_properly(self):
        """Phase 4: connection_request must call send_connection_request, NOT create_comment."""
        card = self.engine.approval.create_card(
            kind=ActionKind.CONNECTION_REQUEST.value,
            target=self.prospect.name,
            why="Target match",
            draft="Hi Elena, let's connect.",
            card_id=f"appr_{self.prospect.id}",
        )
        self.engine.approval.resolve_card(card.id, "approved")

        with patch("lib.workflow_engine.get_action_backend", return_value=self.mock_backend):
            result = self.engine.execute_approved_action(self.prospect.id)

        self.assertTrue(result.success)
        self.assertEqual(len(self.mock_backend.connection_requests), 1)
        self.assertEqual(len(self.mock_backend.comments), 0)
        self.assertEqual(self.mock_backend.connection_requests[0][0], self.prospect.linkedin_url)
        self.assertEqual(self.mock_backend.connection_requests[0][1], "Hi Elena, let's connect.")

    def test_workflow_engine_routes_first_message_properly(self):
        """Phase 4: first_message must call send_direct_message, NOT create_comment."""
        card = self.engine.approval.create_card(
            kind=ActionKind.FIRST_MESSAGE.value,
            target=self.prospect.name,
            why="Connected prospect",
            draft="Elena, enjoyed your recent post on architecture.",
            card_id=f"appr_{self.prospect.id}",
        )
        self.engine.approval.resolve_card(card.id, "approved")

        with patch("lib.workflow_engine.get_action_backend", return_value=self.mock_backend):
            result = self.engine.execute_approved_action(self.prospect.id)

        self.assertTrue(result.success)
        self.assertEqual(len(self.mock_backend.direct_messages), 1)
        self.assertEqual(len(self.mock_backend.comments), 0)
        self.assertEqual(self.mock_backend.direct_messages[0][0], self.prospect.linkedin_url)
        self.assertEqual(self.mock_backend.direct_messages[0][1], "Elena, enjoyed your recent post on architecture.")

    def test_approval_state_pending_is_blocked(self):
        """Phase 5: Pending cards MUST NOT execute."""
        card = self.engine.approval.create_card(
            kind=ActionKind.CONNECTION_REQUEST.value,
            target=self.prospect.name,
            why="Target match",
            draft="Hi Elena",
            card_id=f"appr_{self.prospect.id}",
        )
        # Card remains pending
        result = self.engine.execute_approved_action(self.prospect.id)
        self.assertFalse(result.success)
        self.assertIn("Action blocked: Human approval status is 'pending'", result.message)

    def test_approval_state_rejected_is_blocked(self):
        """Phase 5: Rejected cards MUST NOT execute."""
        card = self.engine.approval.create_card(
            kind=ActionKind.CONNECTION_REQUEST.value,
            target=self.prospect.name,
            why="Target match",
            draft="Hi Elena",
            card_id=f"appr_{self.prospect.id}",
        )
        self.engine.approval.resolve_card(card.id, "rejected")
        result = self.engine.execute_approved_action(self.prospect.id)
        self.assertFalse(result.success)
        self.assertIn("Action blocked: Action was rejected", result.message)

    def test_approval_state_duplicate_execution_is_blocked(self):
        """Phase 5: Already executed action MUST NOT execute again."""
        card = self.engine.approval.create_card(
            kind=ActionKind.CONNECTION_REQUEST.value,
            target=self.prospect.name,
            why="Target match",
            draft="Hi Elena",
            card_id=f"appr_{self.prospect.id}",
        )
        self.engine.approval.resolve_card(card.id, "approved")

        with patch("lib.workflow_engine.get_action_backend", return_value=self.mock_backend):
            # First execution succeeds
            first_res = self.engine.execute_approved_action(self.prospect.id)
            self.assertTrue(first_res.success)

            # Second execution MUST be blocked as duplicate
            dup_res = self.engine.execute_approved_action(self.prospect.id)
            self.assertFalse(dup_res.success)
            self.assertIn("already been executed", dup_res.message)
            self.assertIn("Duplicate execution blocked", dup_res.message)

    def test_unknown_action_is_blocked(self):
        """Phase 5: Unknown action kind MUST fail safely."""
        card = self.engine.approval.create_card(
            kind="hack_account_unsupported_action",
            target=self.prospect.name,
            why="Exploit test",
            draft="Bad action",
            card_id=f"appr_{self.prospect.id}",
        )
        self.engine.approval.resolve_card(card.id, "approved")

        with self.assertRaises(UnsupportedActionError):
            self.engine.execute_approved_action(self.prospect.id)


if __name__ == "__main__":
    unittest.main()
