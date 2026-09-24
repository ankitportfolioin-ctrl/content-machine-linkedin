"""Outreach sequence orchestration engine.

Enforces cadence, waiting intervals, and stop conditions for polite, human-reviewed follow-ups:
- Day 0: Initial approved outreach
- Wait (e.g. 3-4 days)
- If response detected -> Stop sequence, classify response, transfer to Inbox
- If no response -> Day 3 follow-up draft suggestion
- Day 7 -> Alternate context/value suggestion
- Day 14 -> Move to NURTURE or STOPPED

Zero spam. Never sends automated blasts.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from ..research.prospect import Prospect


@dataclass
class SequenceConfig:
    max_followups: int = 2
    min_wait_days_first_followup: int = 3
    min_wait_days_second_followup: int = 4
    nurture_threshold_days: int = 14
    timezone: str = "UTC"
    respect_business_hours: bool = True
    stop_on_response: bool = True
    excluded_domains: List[str] = field(default_factory=list)


@dataclass
class SequenceStep:
    step_number: int  # 0 (initial), 1 (first follow-up), 2 (alternate value), 3 (close/nurture)
    name: str
    target_prospect_id: str
    action_type: str  # connection_request | first_message | followup | nurture_archive
    suggested_date: str
    status: str       # pending_review | approved | completed | skipped | stopped
    reason: str
    draft: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class OutreachSequenceEngine:
    """Manages multi-touch sequence progression with strict stop conditions."""

    def __init__(self, config: Optional[SequenceConfig] = None):
        self.config = config or SequenceConfig()

    def evaluate_next_step(
        self,
        prospect: Prospect,
        current_time: Optional[datetime] = None,
    ) -> SequenceStep:
        """Determines the next required sequence step or recommends stopping."""
        now = current_time or datetime.now(timezone.utc)
        stage = prospect.pipeline.stage.lower()

        # Stop condition 1: Excluded prospect
        for domain in self.config.excluded_domains:
            if domain and domain.lower() in (prospect.company_url or "").lower():
                return SequenceStep(
                    step_number=-1,
                    name="STOPPED",
                    target_prospect_id=prospect.id,
                    action_type="stopped",
                    suggested_date=now.isoformat(),
                    status="stopped",
                    reason=f"Prospect company domain matches exclusion rule: {domain}",
                )

        # Stop condition 2: Already replied or advanced in pipeline
        if stage in ("replied", "interested", "meeting_requested", "meeting_booked", "opportunity", "won"):
            return SequenceStep(
                step_number=99,
                name="CONVERSATION_ACTIVE",
                target_prospect_id=prospect.id,
                action_type="inbox_reply",
                suggested_date=now.isoformat(),
                status="completed",
                reason=f"Prospect responded; sequence stopped to handle active conversation (stage: {stage}).",
            )

        if stage in ("not_interested", "lost", "stopped"):
            return SequenceStep(
                step_number=-1,
                name="SEQUENCE_TERMINATED",
                target_prospect_id=prospect.id,
                action_type="stopped",
                suggested_date=now.isoformat(),
                status="stopped",
                reason=f"Sequence ended due to pipeline status: {stage}",
            )

        # Stage: Discovered or Qualified -> Step 0: Initial Outreach
        if stage in ("discovered", "qualified", "ready_for_review"):
            draft_text = prospect.outreach.first_message or prospect.outreach.connection_draft
            return SequenceStep(
                step_number=0,
                name="INITIAL_OUTREACH",
                target_prospect_id=prospect.id,
                action_type="first_message" if prospect.relationship.connected else "connection_request",
                suggested_date=now.isoformat(),
                status="pending_review",
                reason="Initial approved outreach ready for review",
                draft=draft_text,
            )

        # Stage: Contacted -> Check elapsed time
        last_action = prospect.pipeline.last_action_at
        if not last_action:
            elapsed_days = 0
        else:
            try:
                last_dt = datetime.fromisoformat(last_action.replace("Z", "+00:00"))
                elapsed_days = (now - last_dt).days
            except Exception:
                elapsed_days = 0

        # Follow-up 1 check
        if elapsed_days >= self.config.min_wait_days_first_followup and elapsed_days < (self.config.min_wait_days_first_followup + self.config.min_wait_days_second_followup):
            draft = prospect.outreach.followup_drafts[0] if prospect.outreach.followup_drafts else "Circling back on my previous note."
            return SequenceStep(
                step_number=1,
                name="FOLLOWUP_TOUCH_1",
                target_prospect_id=prospect.id,
                action_type="followup",
                suggested_date=now.isoformat(),
                status="pending_review",
                reason=f"Day {elapsed_days}: No response received after initial message. Suggesting gentle check-in.",
                draft=draft,
            )

        # Follow-up 2 check
        total_wait = self.config.min_wait_days_first_followup + self.config.min_wait_days_second_followup
        if elapsed_days >= total_wait and elapsed_days < self.config.nurture_threshold_days:
            first_name = prospect.name.split()[0] if prospect.name else "there"
            draft = f"Hi {first_name}, sharing one final resource before stepping back: {prospect.research.summary[:100]}."
            return SequenceStep(
                step_number=2,
                name="FOLLOWUP_TOUCH_2_ALTERNATE_VALUE",
                target_prospect_id=prospect.id,
                action_type="followup",
                suggested_date=now.isoformat(),
                status="pending_review",
                reason=f"Day {elapsed_days}: Second follow-up window open. Providing alternate value teardown.",
                draft=draft,
            )

        # Nurture / Stop check
        if elapsed_days >= self.config.nurture_threshold_days:
            return SequenceStep(
                step_number=3,
                name="MOVE_TO_NURTURE",
                target_prospect_id=prospect.id,
                action_type="nurture_archive",
                suggested_date=now.isoformat(),
                status="pending_review",
                reason=f"Day {elapsed_days}: Reached nurture threshold ({self.config.nurture_threshold_days} days). Gracefully moving to long-term nurture.",
            )

        # Still within waiting period
        return SequenceStep(
            step_number=0,
            name="WAITING_INTERVAL",
            target_prospect_id=prospect.id,
            action_type="waiting",
            suggested_date=(now + timedelta(days=self.config.min_wait_days_first_followup - elapsed_days)).isoformat(),
            status="waiting",
            reason=f"Waiting period active ({elapsed_days}/{self.config.min_wait_days_first_followup} days elapsed). Respecting prospect space.",
        )
