"""Human-in-the-Loop Automation Safety Policy.

Defines non-negotiable boundaries for the LinkedIn AI Sales & Growth Copilot.
Prevents account bans, spam violations, and brand reputation risks.
"""
from __future__ import annotations

from enum import Enum
from typing import Dict, List, Tuple


class OperationCategory(str, Enum):
    SAFE_TO_AUTOMATE = "SAFE_TO_AUTOMATE"
    USER_APPROVAL_REQUIRED = "USER_APPROVAL_REQUIRED"
    NEVER_AUTOMATE = "NEVER_AUTOMATE"


SAFE_OPERATIONS = {
    "prospect_discovery",
    "qualification_scoring",
    "research_synthesis",
    "draft_generation",
    "response_classification",
    "analytics_aggregation",
    "daily_briefing_generation",
    "next_action_calculation",
    "crm_recommendation",
}

APPROVAL_REQUIRED_OPERATIONS = {
    "connection_request",
    "first_message",
    "followup_message",
    "post_publish",
    "comment_publish",
    "reply_publish",
    "reaction_publish",
    "profile_update",
    "crm_deal_close",
}

FORBIDDEN_OPERATIONS = {
    "mass_unsolicited_messaging",
    "browser_cookie_extraction",
    "fake_browser_human_imitation",
    "silent_background_publishing",
    "auto_reply_to_legal_disputes",
    "credential_harvesting",
    "mass_connection_spam",
}


class AutomationPolicy:
    """Enforces execution boundaries across all actions."""

    @staticmethod
    def categorize(operation_name: str) -> OperationCategory:
        op = operation_name.lower().strip()
        if op in FORBIDDEN_OPERATIONS:
            return OperationCategory.NEVER_AUTOMATE
        if op in APPROVAL_REQUIRED_OPERATIONS:
            return OperationCategory.USER_APPROVAL_REQUIRED
        if op in SAFE_OPERATIONS:
            return OperationCategory.SAFE_TO_AUTOMATE
        # Default safety principle: unknown operations require approval
        return OperationCategory.USER_APPROVAL_REQUIRED

    @staticmethod
    def can_auto_execute(operation_name: str) -> bool:
        return AutomationPolicy.categorize(operation_name) == OperationCategory.SAFE_TO_AUTOMATE

    @staticmethod
    def is_strictly_forbidden(operation_name: str) -> bool:
        return AutomationPolicy.categorize(operation_name) == OperationCategory.NEVER_AUTOMATE


def evaluate_operation_safety(operation_name: str) -> Tuple[bool, str]:
    """Check if an operation may proceed without a human review prompt.

    Returns:
        (allowed_without_human, rationale)
    """
    category = AutomationPolicy.categorize(operation_name)
    if category == OperationCategory.NEVER_AUTOMATE:
        return False, f"Operation '{operation_name}' is strictly FORBIDDEN by safety policy to protect account integrity."
    if category == OperationCategory.USER_APPROVAL_REQUIRED:
        return False, f"Operation '{operation_name}' requires explicit user approval before execution."
    return True, f"Operation '{operation_name}' is safe to perform asynchronously."
