"""Approval gate system for the LinkedIn AI Sales & Growth Copilot.

Enforces human-in-the-loop review for all consequential actions:
- connection_request
- first_message
- followup
- post
- comment
- reply
- reaction
- profile_change

Maintains full backwards compatibility with existing `render_approval_card(...)` callers.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from .storage.store import get_storage


class ActionKind(str, Enum):
    POST = "post"
    COMMENT = "comment"
    REPLY = "reply"
    REACTION = "reaction"
    CONNECTION_REQUEST = "connection_request"
    FIRST_MESSAGE = "first_message"
    FOLLOWUP = "followup"
    PROFILE_CHANGE = "profile_change"


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    EDITED = "edited"
    REJECTED = "rejected"
    EXECUTED = "executed"


@dataclass
class ApprovalCard:
    id: str
    kind: str
    target: str
    why: str
    draft: str
    source_context: str
    risk_notes: str = "Ensure tone matches your authentic voice before confirming."
    status: str = ApprovalStatus.PENDING.value
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    resolved_at: Optional[str] = None
    edited_draft: Optional[str] = None
    workspace_id: str = "default"
    owner: str = "Founder"

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ApprovalCard:
        valid_keys = {"id", "kind", "target", "why", "draft", "source_context", "risk_notes", "status", "created_at", "resolved_at", "edited_draft", "workspace_id", "owner"}
        filtered = {k: v for k, v in data.items() if k in valid_keys}
        return cls(**filtered)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def render_markdown(self) -> str:
        """Render a standardized human review card in markdown."""
        lines = [
            f"## 📋 Approval Required — {self.kind.upper()}",
            "",
            f"**Target:** {self.target}",
            f"**Why this action:** {self.why}",
            f"**Source Context:** {self.source_context}",
            f"**Risk Notes:** {self.risk_notes}",
            "",
            "**Draft Content:**",
            "",
        ]
        for pl in (self.edited_draft or self.draft).splitlines() or [""]:
            lines.append(f"> {pl}")
        lines.append("")
        lines.append(f"**Chars:** {len(self.edited_draft or self.draft)}")
        lines.append("")
        lines.append("Actions: Reply **APPROVE** to proceed, **EDIT [new text]** to modify, or **REJECT** to cancel.")
        return "\n".join(lines)


class ApprovalManager:
    """Manages creation, retrieval, and resolution of approval cards."""

    def __init__(self, store=None):
        self.store = store or get_storage()
        self.collection = "approval_cards"

    def create_card(
        self,
        kind: str,
        target: str,
        why: str,
        draft: str,
        source_context: str = "",
        risk_notes: str = "",
        card_id: Optional[str] = None,
    ) -> ApprovalCard:
        import hashlib
        if not card_id:
            raw = f"{kind}:{target}:{datetime.now(timezone.utc).isoformat()}"
            card_id = f"appr_{hashlib.sha256(raw.encode()).hexdigest()[:10]}"

        card = ApprovalCard(
            id=card_id,
            kind=kind,
            target=target,
            why=why,
            draft=draft,
            source_context=source_context,
            risk_notes=risk_notes or "Review carefully prior to live publishing.",
        )
        self.store.save_item(self.collection, card.id, card.to_dict())
        return card

    def get_card(self, card_id: str) -> Optional[ApprovalCard]:
        data = self.store.get_item(self.collection, card_id)
        if not data:
            return None
        return ApprovalCard.from_dict(data)

    def list_pending(self) -> List[ApprovalCard]:
        items = self.store.list_items(self.collection)
        cards = [ApprovalCard.from_dict(i) for i in items if i.get("status") == ApprovalStatus.PENDING.value]
        return sorted(cards, key=lambda c: c.created_at, reverse=True)

    def resolve_card(self, card_id: str, decision: str, edited_text: Optional[str] = None) -> Optional[ApprovalCard]:
        card = self.get_card(card_id)
        if not card:
            return None
        dec_clean = decision.lower().strip()
        now = datetime.now(timezone.utc).isoformat()
        if dec_clean in ("approve", "approved", "yes", "post"):
            card.status = ApprovalStatus.APPROVED.value
        elif dec_clean in ("reject", "rejected", "no"):
            card.status = ApprovalStatus.REJECTED.value
        elif dec_clean in ("edit", "edited") or edited_text:
            card.status = ApprovalStatus.EDITED.value
            card.edited_draft = edited_text or card.draft
        card.resolved_at = now
        self.store.save_item(self.collection, card.id, card.to_dict())
        return card

    def mark_executed(self, card_id: str) -> Optional[ApprovalCard]:
        card = self.get_card(card_id)
        if not card:
            return None
        card.status = ApprovalStatus.EXECUTED.value
        card.resolved_at = datetime.now(timezone.utc).isoformat()
        self.store.save_item(self.collection, card.id, card.to_dict())
        return card


def render_approval_card(
    *,
    kind: str,  # "post" | "comment" | "reply" | "reaction" | "connection_request" | "first_message"
    preview_text: str,
    target_url: Optional[str] = None,
    reaction_type: Optional[str] = None,
    char_count: Optional[int] = None,
    extra_context: Optional[dict] = None,
    why: Optional[str] = None,
    risk_notes: Optional[str] = None,
) -> str:
    """Format a standardized approval card for the user to review.

    Maintains backwards compatibility with existing skills and test contracts.
    """
    lines = [f"## Draft ready for approval — {kind}", ""]
    if target_url:
        lines.append(f"**Target:** {target_url}")
    if reaction_type:
        lines.append(f"**Reaction:** `{reaction_type}`")
    if why:
        lines.append(f"**Why this action:** {why}")
    if char_count is None:
        char_count = len(preview_text)
    lines.append(f"**Chars:** {char_count}")
    lines.append("")
    lines.append("**Preview:**")
    lines.append("")
    for pl in preview_text.splitlines() or [""]:
        lines.append(f"> {pl}")
    lines.append("")
    if extra_context:
        lines.append("**Context:**")
        for k, v in extra_context.items():
            lines.append(f"- **{k}**: {v}")
        lines.append("")
    if risk_notes:
        lines.append(f"**Risk / Notes:** {risk_notes}")
        lines.append("")
    lines.append("Reply **post** / **yes** to publish, or suggest edits.")
    return "\n".join(lines)
