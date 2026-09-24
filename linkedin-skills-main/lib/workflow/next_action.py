"""Next Action Engine (AI Inbox Orchestrator).

Answers the key operational question: "What should I do next?"
Evaluates current prospect state, recent messages, conversation context, and business goals
to produce actionable, prioritized recommendations with explicit human approval gates.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from ..intelligence.response_classifier import ClassificationResult, ResponseCategory, ResponseClassifier
from ..research.prospect import Prospect


@dataclass
class NextActionRecommendation:
    prospect_id: str
    prospect_name: str
    prospect_company: str
    current_stage: str
    action_title: str
    why: str
    suggested_draft: str
    urgency: str  # HIGH | MEDIUM | LOW
    approval_required: bool
    target_url: str = ""
    action_type: str = "review_draft"  # review_draft | send_reply | book_meeting | archive_nurture | manual_review
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class NextActionEngine:
    """Calculates prioritized next actions across active prospects and inbox messages."""

    def __init__(self, classifier: Optional[ResponseClassifier] = None):
        self.classifier = classifier or ResponseClassifier()

    def evaluate_prospect(
        self,
        prospect: Prospect,
        latest_inbound_message: Optional[str] = None,
        business_objective: str = "book qualified discovery calls",
        voice_profile: Optional[Dict[str, Any]] = None,
    ) -> NextActionRecommendation:
        """Generate a next action recommendation for a single prospect."""
        stage = prospect.pipeline.stage.lower()
        first_name = prospect.name.split()[0] if prospect.name else "there"

        vp = voice_profile or {}
        user_name = vp.get("authorName") or vp.get("userName") or ""
        sign_off = f"Best,\n{user_name}" if user_name else "Best"
        talk_soon = f"Talk soon,\n{user_name}" if user_name else "Talk soon"
        calendar_link = vp.get("primaryLink") or ""
        offering = (vp.get("contentPillars") and vp.get("contentPillars")[0]) or vp.get("role") or "practical workflow operations"

        # Case 1: Inbound message received
        if latest_inbound_message:
            classification = self.classifier.classify(latest_inbound_message)
            cat = classification.classification

            if cat == ResponseCategory.MEETING_REQUEST.value:
                link_text = f"Here is a direct link to find a time that fits your calendar:\n{calendar_link}\n\n" if calendar_link else "What day and time work best for a quick 15-minute chat?\n\n"
                draft = (
                    f"Hi {first_name},\n\n"
                    f"Sounds great. I'm looking forward to speaking. {link_text}"
                    f"{talk_soon}"
                )
                return NextActionRecommendation(
                    prospect_id=prospect.id,
                    prospect_name=prospect.name,
                    prospect_company=prospect.company,
                    current_stage=stage,
                    action_title="Send meeting booking link & confirm slot",
                    why=f"Prospect requested a call: '{latest_inbound_message[:80]}'",
                    suggested_draft=draft,
                    urgency="HIGH",
                    approval_required=True,
                    target_url=prospect.linkedin_url,
                    action_type="book_meeting",
                )

            if cat == ResponseCategory.PRICING.value:
                draft = (
                    f"Hi {first_name},\n\n"
                    f"Our typical engagements are tailored to your operational scope, usually starting with a focused pilot. "
                    f"Usually we do a quick 15-minute alignment chat to understand your current setup first. "
                    f"Does that make sense, or would you prefer a high-level summary overview document first?\n\n"
                    f"{sign_off}"
                )
                return NextActionRecommendation(
                    prospect_id=prospect.id,
                    prospect_name=prospect.name,
                    prospect_company=prospect.company,
                    current_stage=stage,
                    action_title="Approve pricing & qualification reply",
                    why=f"Prospect asked about pricing: '{latest_inbound_message[:80]}'",
                    suggested_draft=draft,
                    urgency="HIGH",
                    approval_required=True,
                    target_url=prospect.linkedin_url,
                    action_type="send_reply",
                )

            if cat == ResponseCategory.QUESTION.value:
                draft = (
                    f"Hi {first_name},\n\n"
                    f"Great question. We focus on {offering} to eliminate friction and improve execution. "
                    f"Happy to share our practical notes or a quick overview if useful.\n\n"
                    f"{sign_off}"
                )
                return NextActionRecommendation(
                    prospect_id=prospect.id,
                    prospect_name=prospect.name,
                    prospect_company=prospect.company,
                    current_stage=stage,
                    action_title="Answer prospect question",
                    why=f"Prospect asked for clarification: '{latest_inbound_message[:80]}'",
                    suggested_draft=draft,
                    urgency="HIGH",
                    approval_required=True,
                    target_url=prospect.linkedin_url,
                    action_type="send_reply",
                )

            if cat == ResponseCategory.NEGATIVE.value:
                return NextActionRecommendation(
                    prospect_id=prospect.id,
                    prospect_name=prospect.name,
                    prospect_company=prospect.company,
                    current_stage=stage,
                    action_title="Archive prospect and update CRM to STOPPED",
                    why="Prospect requested no further communication or expressed disinterest.",
                    suggested_draft="",
                    urgency="LOW",
                    approval_required=False,
                    target_url=prospect.linkedin_url,
                    action_type="archive_nurture",
                )

            if cat == ResponseCategory.NEEDS_HUMAN.value:
                return NextActionRecommendation(
                    prospect_id=prospect.id,
                    prospect_name=prospect.name,
                    prospect_company=prospect.company,
                    current_stage=stage,
                    action_title="Manual review required",
                    why="Message is complex or sensitive; automated drafts are withheld to preserve relationship quality.",
                    suggested_draft="",
                    urgency="HIGH",
                    approval_required=True,
                    target_url=prospect.linkedin_url,
                    action_type="manual_review",
                )

        # Case 2: Outbound pipeline progression
        if stage in ("discovered", "qualified", "ready_for_review"):
            draft = prospect.outreach.first_message or prospect.outreach.connection_draft
            return NextActionRecommendation(
                prospect_id=prospect.id,
                prospect_name=prospect.name,
                prospect_company=prospect.company,
                current_stage=stage,
                action_title="Review and approve initial outreach",
                why=f"Prospect qualified with score {prospect.qualification.score}/100. Personalized draft ready.",
                suggested_draft=draft,
                urgency="MEDIUM",
                approval_required=True,
                target_url=prospect.linkedin_url,
                action_type="review_draft",
            )

        # Case 3: Waiting or Nurture
        return NextActionRecommendation(
            prospect_id=prospect.id,
            prospect_name=prospect.name,
            prospect_company=prospect.company,
            current_stage=stage,
            action_title="Monitor for replies",
            why=f"Prospect in stage '{stage}'. No immediate manual action required.",
            suggested_draft="",
            urgency="LOW",
            approval_required=False,
            target_url=prospect.linkedin_url,
            action_type="monitor",
        )
