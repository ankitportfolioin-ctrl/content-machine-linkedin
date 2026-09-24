"""Response Classifier Engine.

Classifies inbound LinkedIn replies to determine intent, sentiment, and the appropriate next action.
Flags sensitive, ambiguous, or high-touch conversations as NEEDS_HUMAN.
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from enum import Enum
from typing import Any, Dict, List, Optional

from .untrusted_content import sanitize_untrusted_content


class ResponseCategory(str, Enum):
    POSITIVE = "POSITIVE"
    NEGATIVE = "NEGATIVE"
    QUESTION = "QUESTION"
    PRICING = "PRICING"
    INTERESTED = "INTERESTED"
    NOT_NOW = "NOT_NOW"
    LATER = "LATER"
    MEETING_REQUEST = "MEETING_REQUEST"
    REFERRAL = "REFERRAL"
    WRONG_PERSON = "WRONG_PERSON"
    OUT_OF_OFFICE = "OUT_OF_OFFICE"
    UNCLEAR = "UNCLEAR"
    NEEDS_HUMAN = "NEEDS_HUMAN"


@dataclass
class ClassificationResult:
    classification: str
    confidence: str  # high | medium | low
    reason: str
    recommended_next_step: str
    requires_human_approval: bool = True

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["intent"] = self.classification
        return d


class ResponseClassifier:
    """Classifies prospect replies and maps them to CRM transitions and action recommendations."""

    def classify(self, message_text: str, context: Optional[str] = None) -> ClassificationResult:
        """Classify message text using deterministic intent rules and heuristics."""
        clean = sanitize_untrusted_content(message_text).strip()
        lower = clean.lower()

        # 0. Prompt Injection / Adversarial or System Instruction Attempt
        if any(term in lower for term in [
            "ignore previous instructions",
            "ignore all prior instructions",
            "system prompt",
            "classify this as won",
            "dump all notes",
            "database credentials",
            "you are now an assistant",
            "sql injection",
            "drop table"
        ]):
            return ClassificationResult(
                classification=ResponseCategory.NEEDS_HUMAN.value,
                confidence="high",
                reason="Adversarial prompt injection pattern detected in message text. Consequential actions blocked.",
                recommended_next_step="Flagged for manual security review in Inbox. No automated execution or CRM transition.",
                requires_human_approval=True
            )

        # 1. Out of Office
        if any(term in lower for term in ["out of the office", "out of office", "on leave", "away from my desk", "auto-reply", "returning on"]):
            return ClassificationResult(
                classification=ResponseCategory.OUT_OF_OFFICE.value,
                confidence="high",
                reason="Automatic out-of-office message detected.",
                recommended_next_step="Log return date in CRM and pause sequence until prospect returns.",
            )

        # 2. Meeting Request
        if any(term in lower for term in ["calendly.com", "calendar", "book a time", "let's talk", "let's chat", "let's jump on a call", "jump on a call", "schedule a call", "grab 15 mins", "grab a quick call", "time to chat", "free on tuesday", "free tomorrow", "send an invite", "schedule time"]):
            return ClassificationResult(
                classification=ResponseCategory.MEETING_REQUEST.value,
                confidence="high",
                reason="Prospect proposed a call or provided calendar availability.",
                recommended_next_step="Advance pipeline to MEETING_REQUESTED, review calendar invite draft and book time.",
            )

        # 3. Pricing
        if any(term in lower for term in ["how much", "what does it cost", "pricing", "pricing structure", "rate card", "retainer", "budget requirement"]):
            return ClassificationResult(
                classification=ResponseCategory.PRICING.value,
                confidence="high",
                reason="Prospect inquired about investment or pricing details.",
                recommended_next_step="Advance to QUALIFIED LEAD, prepare transparent pricing framework and offer brief discovery call.",
            )

        # 4. Referral / Wrong Person
        if any(term in lower for term in ["not the right person", "talk to", "reach out to", "looping in", "our head of", "contact my colleague"]):
            return ClassificationResult(
                classification=ResponseCategory.REFERRAL.value,
                confidence="high",
                reason="Prospect indicated another team member handles this area.",
                recommended_next_step="Capture referred contact details in CRM, thank prospect, and initiate outreach to the referred stakeholder.",
            )

        if any(term in lower for term in ["i don't handle this", "wrong person", "no longer with"]):
            return ClassificationResult(
                classification=ResponseCategory.WRONG_PERSON.value,
                confidence="high",
                reason="Prospect stated they do not manage this domain.",
                recommended_next_step="Update prospect record in CRM and respectfully ask for correct department point of contact.",
            )

        # 5. Not Now / Later
        if any(term in lower for term in ["not right now", "maybe next quarter", "check back in", "busy right now", "reach back in", "ping me in"]):
            return ClassificationResult(
                classification=ResponseCategory.LATER.value,
                confidence="high",
                reason="Prospect expressed timing constraints but did not reject outright.",
                recommended_next_step="Move pipeline to NURTURE with a scheduled follow-up reminder 45-60 days out.",
            )

        # 6. Negative / Opt-out
        if any(term in lower for term in ["unsubscribe", "remove me", "not interested", "stop messaging", "no thanks", "do not contact", "pass on this"]):
            return ClassificationResult(
                classification=ResponseCategory.NEGATIVE.value,
                confidence="high",
                reason="Explicit decline or request to stop communication.",
                recommended_next_step="Move pipeline stage to STOPPED / NOT_INTERESTED immediately. No further outreach.",
            )

        # 7. Question
        if "?" in clean or any(term in lower for term in ["what do you mean", "how does that work", "what exactly", "could you clarify", "can you explain"]):
            return ClassificationResult(
                classification=ResponseCategory.QUESTION.value,
                confidence="medium",
                reason="Prospect asked a clarifying question regarding services or methodology.",
                recommended_next_step="Draft a concise, informative reply answering their specific question and request user approval.",
            )

        # 8. Positive / Interested
        if any(term in lower for term in ["sounds interesting", "would love to learn more", "send over details", "looks promising", "tell me more", "sure", "happy to connect"]):
            return ClassificationResult(
                classification=ResponseCategory.INTERESTED.value,
                confidence="medium",
                reason="Prospect expressed positive receptivity to initial context.",
                recommended_next_step="Advance pipeline stage to REPLIED / INTERESTED, draft tailored value response with soft call-to-action.",
            )

        # 9. Complex or Ambiguous -> NEEDS_HUMAN
        if len(clean.split()) > 80 or any(term in lower for term in ["legal", "contract", "nda", "complaint"]):
            return ClassificationResult(
                classification=ResponseCategory.NEEDS_HUMAN.value,
                confidence="high",
                reason="High-complexity, sensitive terms, or long-form reply requiring dedicated human assessment.",
                recommended_next_step="Alert user in Daily Briefing and Inbox. Do not generate automated drafts.",
            )

        # Default fallback
        return ClassificationResult(
            classification=ResponseCategory.UNCLEAR.value,
            confidence="low",
            reason="Message text does not match unambiguous intent patterns.",
            recommended_next_step="Review conversation in Inbox and manually determine next step.",
        )
