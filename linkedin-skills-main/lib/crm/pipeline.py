"""CRM and Sales Pipeline Management.

Tracks prospects through clear deal stages:
DISCOVERED -> QUALIFIED -> REVIEW -> CONTACTED -> REPLIED -> QUALIFIED_LEAD -> MEETING -> PROPOSAL -> WON / LOST / NURTURE / STOPPED

Maintains immutable stage transition history, audit notes, deal values, and owners.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from ..research.prospect import Prospect
from ..storage.store import StorageBackend, get_storage


class PipelineStage(str, Enum):
    DISCOVERED = "DISCOVERED"
    QUALIFIED = "QUALIFIED"
    REVIEW = "REVIEW"
    CONTACTED = "CONTACTED"
    REPLIED = "REPLIED"
    QUALIFIED_LEAD = "QUALIFIED_LEAD"
    MEETING = "MEETING"
    PROPOSAL = "PROPOSAL"
    WON = "WON"
    LOST = "LOST"
    NURTURE = "NURTURE"
    STOPPED = "STOPPED"


@dataclass
class StageTransition:
    from_stage: str
    to_stage: str
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    reason: str = ""
    actor: str = "system"


@dataclass
class CRMRecord:
    prospect_id: str
    name: str
    company: str
    stage: str = PipelineStage.DISCOVERED.value
    owner: str = "Founder"
    source: str = "manual"
    opportunity_value: float = 0.0
    notes: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    stage_history: List[StageTransition] = field(default_factory=list)
    last_interaction: Optional[str] = None
    next_action: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["stage_history"] = [asdict(t) if isinstance(t, StageTransition) else t for t in self.stage_history]
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> CRMRecord:
        d = dict(data)
        if "stage_history" in d and isinstance(d["stage_history"], list):
            d["stage_history"] = [
                StageTransition(**t) if isinstance(t, dict) else t for t in d["stage_history"]
            ]
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


class CRMPipeline:
    """Manages CRM pipeline records and persistent transitions."""

    def __init__(self, store: Optional[StorageBackend] = None):
        self.store = store or get_storage()
        self.collection = "crm_records"

    def get_record(self, prospect_id: str) -> Optional[CRMRecord]:
        raw = self.store.get_item(self.collection, prospect_id)
        if not raw:
            return None
        return CRMRecord.from_dict(raw)

    def upsert_prospect(self, prospect: Prospect, initial_stage: Optional[str] = None) -> CRMRecord:
        existing = self.get_record(prospect.id)
        now = datetime.now(timezone.utc).isoformat()
        if existing:
            existing.name = prospect.name
            existing.company = prospect.company
            existing.updated_at = now
            self.store.save_item(self.collection, existing.prospect_id, existing.to_dict())
            return existing

        st = initial_stage or PipelineStage.DISCOVERED.value
        record = CRMRecord(
            prospect_id=prospect.id,
            name=prospect.name,
            company=prospect.company,
            stage=st,
            source=prospect.source,
            stage_history=[
                StageTransition(
                    from_stage="",
                    to_stage=st,
                    reason="Initial intake into pipeline",
                )
            ],
            next_action="Qualify against ICP",
        )
        self.store.save_item(self.collection, record.prospect_id, record.to_dict())
        return record

    def transition_stage(
        self,
        prospect_id: str,
        to_stage: Union[PipelineStage, str],
        reason: str = "",
        actor: str = "user",
    ) -> Optional[CRMRecord]:
        record = self.get_record(prospect_id)
        if not record:
            return None

        target = to_stage.value if isinstance(to_stage, PipelineStage) else str(to_stage).upper()
        now = datetime.now(timezone.utc).isoformat()

        transition = StageTransition(
            from_stage=record.stage,
            to_stage=target,
            timestamp=now,
            reason=reason,
            actor=actor,
        )
        record.stage_history.append(transition)
        record.stage = target
        record.updated_at = now
        self.store.save_item(self.collection, record.prospect_id, record.to_dict())
        return record

    def add_note(self, prospect_id: str, note_text: str) -> Optional[CRMRecord]:
        record = self.get_record(prospect_id)
        if not record:
            return None
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        record.notes.append(f"[{timestamp}] {note_text}")
        record.updated_at = datetime.now(timezone.utc).isoformat()
        self.store.save_item(self.collection, record.prospect_id, record.to_dict())
        return record

    def set_opportunity_value(self, prospect_id: str, value: float) -> Optional[CRMRecord]:
        record = self.get_record(prospect_id)
        if not record:
            return None
        record.opportunity_value = float(value)
        record.updated_at = datetime.now(timezone.utc).isoformat()
        self.store.save_item(self.collection, record.prospect_id, record.to_dict())
        return record

    def list_by_stage(self, stage: Optional[str] = None) -> List[CRMRecord]:
        items = self.store.list_items(self.collection)
        records = [CRMRecord.from_dict(i) for i in items]
        if stage:
            records = [r for r in records if r.stage.upper() == stage.upper()]
        return records

    def summary_stats(self) -> Dict[str, Any]:
        records = [CRMRecord.from_dict(i) for i in self.store.list_items(self.collection)]
        counts: Dict[str, int] = {}
        total_pipeline_value = 0.0
        for r in records:
            counts[r.stage] = counts.get(r.stage, 0) + 1
            if r.stage not in (PipelineStage.LOST.value, PipelineStage.STOPPED.value):
                total_pipeline_value += r.opportunity_value
        return {
            "total_prospects": len(records),
            "by_stage": counts,
            "pipeline_value": total_pipeline_value,
        }
