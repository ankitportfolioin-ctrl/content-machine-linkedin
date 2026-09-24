"""Content Calendar & Planning Engine.

Integrates with existing content skills:
- linkedin-content-planner
- linkedin-post-writer
- linkedin-hook-extractor
- linkedin-humanizer
- linkedin-repurposer

Organizes weekly editorial schedules across core content pillars with universal provenance gating.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from ..approval import ActionKind, ApprovalManager
from ..provenance import ProvenanceLevel, ValidationStatus, validate_content_claims
from ..storage.store import StorageBackend, get_storage


class ContentPillar(str, Enum):
    TACTICAL_HOW_TO = "TACTICAL_HOW_TO"          # Playbooks, frameworks, tactical steps
    CONTRARIAN_OPINION = "CONTRARIAN_OPINION"    # Challenging conventional wisdom
    CASE_STUDY = "CASE_STUDY"                    # Real metrics, before/after teardown
    PERSONAL_LESSON = "PERSONAL_LESSON"          # Founder journey, transparent failure/win
    INDUSTRY_BREAKDOWN = "INDUSTRY_BREAKDOWN"    # Macro trends, curation, analysis


@dataclass
class ScheduledContentDraft:
    id: str
    pillar: str
    target_date: str
    topic: str
    hook: str
    body: str
    call_to_action: str
    full_text: str
    status: str = "draft"  # draft | ready_for_review | review_required | approved | scheduled | published | rejected
    provenance_status: str = "PASSED"  # PASSED | REVIEW_REQUIRED
    unsupported_claims: List[Dict[str, Any]] = field(default_factory=list)
    approval_card_id: Optional[str] = None
    media_url: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class ContentCalendar:
    """Manages weekly post editorial queues, approvals, and pillar distribution with provenance gates."""

    def __init__(self, store: Optional[StorageBackend] = None):
        self.store = store or get_storage()
        self.collection = "content_calendar"
        self.approval = ApprovalManager(store=self.store)

    def create_weekly_plan(
        self,
        core_theme: str = "Founder-led B2B Distribution",
        start_date: Optional[str] = None,
        user_receipts: Optional[List[str]] = None,
        source_docs: Optional[List[Dict[str, Any]]] = None,
    ) -> List[ScheduledContentDraft]:
        """Generate a 5-day content editorial plan across alternating pillars with provenance verification."""
        base_dt = datetime.fromisoformat(start_date) if start_date else datetime.now(timezone.utc)
        
        # Grounded editorial frameworks strictly avoiding fabricated statistics, fake founder counts, and invented hiring
        plan_templates = [
            (
                ContentPillar.CONTRARIAN_OPINION.value,
                "Why outbound automation tools burn accounts",
                "Most teams think outbound fails because of deliverability.\n\nIt usually fails because nobody bothered to read the prospect's profile.",
                "Here is what happens when you switch from 500 automated blasts to 15 peer-level observations per week:\n\n1. Zero connection blocks and eliminated spam flags\n2. Meaningful executive peer dialogue\n3. The prospect actually thanks you for reaching out\n\nQuality is the only scalable moat left on LinkedIn.",
                "Are you optimizing for volume or relevance this quarter?",
            ),
            (
                ContentPillar.CASE_STUDY.value,
                "Teardown: Scaling organic inbound without paid ads",
                "Analyzing sustainable organic inbound architecture without paid ad spend.",
                "High-signal B2B founder growth consistently follows these 3 non-negotiables:\n\n• Documented client objections verbatim in a 'Story Bank'\n• Published recurring teardowns with specific architectural trade-offs\n• Commented thoughtfully on prospective buyer posts daily before pitching\n\nNo hacks. Just consistent execution of high-signal craft.",
                "Which of these 3 habits is hardest for your team to maintain?",
            ),
            (
                ContentPillar.TACTICAL_HOW_TO.value,
                "The 4-part structure of a high-converting LinkedIn hook",
                "Your hook determines the initial read-through rate of your post. Here is the framework:",
                "1. The Pattern Interrupt: State a counter-intuitive observation\n2. The Stakes: Clarify why ignoring this costs engineering time or revenue\n3. The Bridge: Transition to your methodology\n4. The Proof: Specific verifiable result or mechanism\n\nTest your next post with this structure and watch audience retention climb.",
                "Save this framework for your next draft.",
            ),
            (
                ContentPillar.PERSONAL_LESSON.value,
                "The biggest mistake when hiring for early growth",
                "A foundational lesson when assembling an early growth team:",
                "Hiring for brand-name resume logos often underperforms domain velocity and rapid field testing.\nStrategy decks produce zero closed meetings if field execution lacks speed.\n\nWhat matters in the field:\n- Someone who builds and iterates directly in customer workflows\n- Comfort with ambiguity and rapid testing\n- Genuine empathy for the customer's operational bottlenecks",
                "What is the single biggest lesson you've learned hiring for growth?",
            ),
            (
                ContentPillar.INDUSTRY_BREAKDOWN.value,
                "How B2B buyer behavior changed permanently this year",
                "Buyers no longer respond to cold pitch decks.",
                "They research you on LinkedIn before they ever open your email.\n\nYour profile is not a resume. It's your executive landing page.\nYour content is not noise. It's your ongoing sales presentation.\n\nIf you aren't visible where your buyers hang out, you don't exist to them.",
                "When was the last time you refreshed your personal profile messaging?",
            ),
        ]

        items: List[ScheduledContentDraft] = []
        for i, (pillar, topic, hook, body, cta) in enumerate(plan_templates):
            target_date = (base_dt + timedelta(days=i)).strftime("%Y-%m-%d")
            draft_id = f"post_{target_date.replace('-', '')}_{i}"
            full_text = f"{hook}\n\n{body}\n\n{cta}"

            # Universal Provenance Gate
            report = validate_content_claims(
                full_text,
                user_receipts=user_receipts,
                source_docs=source_docs,
            )

            is_review_required = report.status == ValidationStatus.REVIEW_REQUIRED.value
            status_val = "review_required" if is_review_required else "ready_for_review"

            # Create approval card
            risk_notes = "Ensure hook and CTA reflect your authentic voice before approving."
            if is_review_required:
                risk_notes = "REVIEW REQUIRED: Unsupported factual claims detected. Review or provide receipts."

            card = self.approval.create_card(
                kind=ActionKind.POST.value,
                target="LinkedIn Personal Profile",
                why=f"Weekly theme '{core_theme}' — Pillar: {pillar}",
                draft=full_text,
                source_context=f"Content Pillar: {pillar} | Topic: {topic} | Provenance: {report.status}",
                risk_notes=risk_notes,
                card_id=f"appr_{draft_id}",
            )

            draft = ScheduledContentDraft(
                id=draft_id,
                pillar=pillar,
                target_date=target_date,
                topic=topic,
                hook=hook,
                body=body,
                call_to_action=cta,
                full_text=full_text,
                status=status_val,
                provenance_status=report.status,
                unsupported_claims=[c.to_dict() for c in report.claims if c.provenance == ProvenanceLevel.UNAVAILABLE.value],
                approval_card_id=card.id,
            )
            self.store.save_item(self.collection, draft.id, draft.to_dict())
            items.append(draft)

        return items

    def list_drafts(self) -> List[ScheduledContentDraft]:
        items = self.store.list_items(self.collection)
        return [ScheduledContentDraft(**i) for i in items]
