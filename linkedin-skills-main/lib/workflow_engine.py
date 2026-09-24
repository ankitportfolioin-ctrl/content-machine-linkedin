"""Central Workflow Engine for LinkedIn AI Sales & Growth Copilot.

Coordinates the end-to-end sales and growth workflow:
DISCOVER -> QUALIFY -> RESEARCH -> PERSONALIZE -> APPROVAL GATE -> CONTACT -> SEQUENCE -> INBOX -> CRM -> ANALYTICS

Enforces duplicate prevention, state persistence, audit logging, and dry-run simulation.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from .approval import ActionKind, ApprovalCard, ApprovalManager, ApprovalStatus
from .automation.policy import AutomationPolicy, OperationCategory
from .clients.backend_interface import ActionResult, get_action_backend
from .crm.pipeline import CRMPipeline, PipelineStage
from .intelligence.prospect_qualifier import ProspectQualifier
from .intelligence.prospect_researcher import ProspectResearcher
from .outreach.drafter import OutreachDrafter, OutreachMode
from .research.icp import ICP
from .research.prospect import Prospect, generate_prospect_id
from .research.prospect_discovery import discover_prospects, filter_duplicate_prospects
from .storage.store import StorageBackend, get_storage


class UnsupportedActionError(ValueError):
    """Raised when an unrecognized action kind is passed to the workflow engine."""
    pass


class WorkflowState(str, Enum):
    DISCOVERED = "DISCOVERED"
    RESEARCHING = "RESEARCHING"
    QUALIFIED = "QUALIFIED"
    READY_FOR_REVIEW = "READY_FOR_REVIEW"
    APPROVED = "APPROVED"
    CONTACTED = "CONTACTED"
    WAITING = "WAITING"
    REPLIED = "REPLIED"
    INTERESTED = "INTERESTED"
    NOT_INTERESTED = "NOT_INTERESTED"
    NURTURE = "NURTURE"
    MEETING_REQUESTED = "MEETING_REQUESTED"
    MEETING_BOOKED = "MEETING_BOOKED"
    OPPORTUNITY = "OPPORTUNITY"
    WON = "WON"
    LOST = "LOST"
    STOPPED = "STOPPED"


@dataclass
class WorkflowEvent:
    prospect_id: str
    from_state: str
    to_state: str
    actor: str  # human | ai | system
    reason: str
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class WorkflowEngine:
    """Coordinates sales and outreach workflows, ensuring every external touch is gated by human approval."""

    def __init__(
        self,
        store: Optional[StorageBackend] = None,
        dry_run: bool = False,
    ):
        self.store = store or get_storage()
        self.dry_run = dry_run
        self.pipeline = CRMPipeline(store=self.store)
        self.approval = ApprovalManager(store=self.store)
        self.qualifier = ProspectQualifier()
        self.researcher = ProspectResearcher()
        self.drafter = OutreachDrafter()
        self.events_collection = "workflow_events"
        self.prospects_collection = "prospects"

    def record_event(self, prospect_id: str, from_state: str, to_state: str, reason: str, actor: str = "ai") -> WorkflowEvent:
        event = WorkflowEvent(
            prospect_id=prospect_id,
            from_state=from_state,
            to_state=to_state,
            actor=actor,
            reason=reason,
        )
        key = f"{prospect_id}_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
        self.store.save_item(self.events_collection, key, event.to_dict())
        return event

    def save_prospect(self, prospect: Prospect) -> None:
        self.store.save_item(self.prospects_collection, prospect.id, prospect.to_dict())

    def get_prospect(self, prospect_id: str) -> Optional[Prospect]:
        data = self.store.get_item(self.prospects_collection, prospect_id)
        if not data:
            return None
        return Prospect.from_dict(data)

    def list_prospects(self) -> List[Prospect]:
        items = self.store.list_items(self.prospects_collection)
        return [Prospect.from_dict(i) for i in items]

    def run_discovery_pipeline(
        self,
        icp: ICP,
        backend: str = "demo",
        limit: int = 5,
        source_file: Optional[str] = None,
    ) -> List[Prospect]:
        """Discovers new prospects, deduplicates against existing records, qualifies, and sets up outreach."""
        # 1. Discover raw prospects
        raw_discovered = discover_prospects(criteria=icp, backend=backend, limit=limit, source_file=source_file)
        if raw_discovered == "DISCOVERY_UNAVAILABLE" or getattr(raw_discovered, "status", None) == "DISCOVERY_UNAVAILABLE":
            return raw_discovered
        
        # 2. Deduplicate
        existing = self.list_prospects()
        unique_prospects = filter_duplicate_prospects(raw_discovered, existing)

        self.qualifier = ProspectQualifier(icp=icp)
        processed: List[Prospect] = []

        for p in unique_prospects:
            # 3. Qualify
            self.record_event(p.id, "NEW", WorkflowState.RESEARCHING.value, "Prospect discovered; beginning qualification and research.")
            q_res = self.qualifier.qualify(p)

            if q_res.status == "disqualified":
                p.pipeline.stage = WorkflowState.STOPPED.value
                self.record_event(p.id, WorkflowState.RESEARCHING.value, WorkflowState.STOPPED.value, f"Disqualified: {q_res.reasons}")
                self.save_prospect(p)
                self.pipeline.upsert_prospect(p, initial_stage=WorkflowState.STOPPED.value)
                processed.append(p)
                continue

            # 4. Research
            self.researcher.research(p, user_offering=icp.offer or "organic growth systems")

            # 5. Draft Outreach
            mode = OutreachMode.CONVERSATION_STARTER if p.research.recent_activity else OutreachMode.VALUE_FIRST
            draft = self.drafter.draft(p, mode=mode, offering=icp.offer or "growth services")

            # 6. Set state to READY_FOR_REVIEW
            p.pipeline.stage = WorkflowState.READY_FOR_REVIEW.value
            self.record_event(p.id, WorkflowState.RESEARCHING.value, WorkflowState.READY_FOR_REVIEW.value, f"Qualified ({q_res.overall_fit_score}/100) and draft generated.")
            self.save_prospect(p)
            self.pipeline.upsert_prospect(p, initial_stage=WorkflowState.READY_FOR_REVIEW.value)

            # 7. Create required Human Approval Card
            action_type = ActionKind.FIRST_MESSAGE.value if p.relationship.connected else ActionKind.CONNECTION_REQUEST.value
            self.approval.create_card(
                kind=action_type,
                target=f"{p.name} ({p.company or p.headline})",
                why=f"Qualified lead ({q_res.overall_fit_score}/100). {q_res.reasons[0] if q_res.reasons else 'Matches ICP'}",
                draft=draft.first_message if p.relationship.connected else draft.connection_note,
                source_context=draft.factual_basis,
                risk_notes="Ensure message fits your authentic voice before confirming.",
                card_id=f"appr_{p.id}",
            )
            processed.append(p)

        return processed

    def execute_approved_action(self, prospect_id: str, card_id: Optional[str] = None) -> ActionResult:
        """Executes an action ONLY IF human approval has been granted."""
        cid = card_id or f"appr_{prospect_id}"
        card = self.approval.get_card(cid)
        prospect = self.get_prospect(prospect_id)

        if not prospect:
            return ActionResult(success=False, action_type="outreach", target=prospect_id, message="Prospect not found.")

        if not card:
            return ActionResult(
                success=False,
                action_type="outreach",
                target=prospect.name,
                message="Action blocked: Human approval card is missing. You must approve before executing.",
            )

        if card.status == ApprovalStatus.EXECUTED.value:
            return ActionResult(
                success=False,
                action_type=card.kind,
                target=prospect.name,
                message="Action blocked: Action has already been executed. Duplicate execution blocked.",
            )

        if card.status == ApprovalStatus.REJECTED.value:
            return ActionResult(
                success=False,
                action_type=card.kind,
                target=prospect.name,
                message="Action blocked: Action was rejected by human reviewer.",
            )

        if card.status not in (ApprovalStatus.APPROVED.value, ApprovalStatus.EDITED.value):
            return ActionResult(
                success=False,
                action_type=card.kind,
                target=prospect.name,
                message=f"Action blocked: Human approval status is '{card.status}'. You must approve before executing.",
            )

        supported_kinds = {
            ActionKind.POST.value,
            ActionKind.COMMENT.value,
            ActionKind.CONNECTION_REQUEST.value,
            ActionKind.FIRST_MESSAGE.value,
            ActionKind.FOLLOWUP.value,
        }
        if card.kind not in supported_kinds:
            raise UnsupportedActionError(f"Unsupported action kind: '{card.kind}'. Unknown action types are blocked.")

        draft_content = card.edited_draft or card.draft

        if self.dry_run:
            msg = f"[DRY RUN SIMULATION] Outreach would be dispatched to {prospect.name} ({card.kind}): '{draft_content[:100]}...'"
            self.approval.mark_executed(card.id)
            self.record_event(prospect.id, prospect.pipeline.stage, WorkflowState.CONTACTED.value, "Dry-run execution simulated.")
            prospect.pipeline.stage = WorkflowState.CONTACTED.value
            prospect.pipeline.last_action_at = datetime.now(timezone.utc).isoformat()
            self.save_prospect(prospect)
            self.pipeline.transition_stage(prospect.id, PipelineStage.CONTACTED.value, reason="Dry run simulated outreach")
            return ActionResult(success=True, action_type=card.kind, target=prospect.name, message=msg, data={"dry_run": True})

        # Explicit routing based on action kind per Phase 4
        backend = get_action_backend()
        if card.kind == "post":
            result = backend.create_post(draft_content)
        elif card.kind == "comment":
            result = backend.create_comment(prospect.linkedin_url, draft_content)
        elif card.kind == "connection_request":
            result = backend.send_connection_request(prospect.linkedin_url, draft_content)
        elif card.kind in ("first_message", "followup"):
            result = backend.send_direct_message(prospect.linkedin_url, draft_content)
        else:
            raise UnsupportedActionError(f"Unsupported action kind: '{card.kind}'")

        # Advance workflow and mark executed to prevent duplicates
        self.approval.mark_executed(card.id)
        self.record_event(prospect.id, prospect.pipeline.stage, WorkflowState.CONTACTED.value, f"Dispatched via backend '{backend.name}'")
        prospect.pipeline.stage = WorkflowState.CONTACTED.value
        prospect.pipeline.last_action_at = datetime.now(timezone.utc).isoformat()
        self.save_prospect(prospect)
        self.pipeline.transition_stage(prospect.id, PipelineStage.CONTACTED.value, reason=f"Outreach sent via {backend.name}")
        return result
