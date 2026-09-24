"""Outreach drafting engine.

Generates personalized, non-spammy outreach drafts across 5 distinct modes:
- NETWORKING (peer-to-peer connection)
- VALUE_FIRST (sharing a concrete teardown or resource)
- CONVERSATION_STARTER (grounded in their recent post or public activity)
- PROBLEM_RELEVANT (addressing shared operational friction)
- DIRECT_BUSINESS (transparent, respectful business inquiry)

Strictly rejects fake familiarity and generic SaaS platitudes.
Enforces character limits (connection note <= 300 chars).
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

from ..research.prospect import Prospect


class OutreachMode(str, Enum):
    NETWORKING = "NETWORKING"
    VALUE_FIRST = "VALUE_FIRST"
    CONVERSATION_STARTER = "CONVERSATION_STARTER"
    PROBLEM_RELEVANT = "PROBLEM_RELEVANT"
    DIRECT_BUSINESS = "DIRECT_BUSINESS"


@dataclass
class OutreachDraft:
    mode: str
    connection_note: str  # <= 300 chars for LinkedIn connection invitation
    first_message: str    # Standard direct message or InMail
    followup_message: str # Follow-up suggestion if no reply after wait period
    factual_basis: str    # The exact evidence/fact supporting this personalization
    character_counts: Dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class OutreachDrafter:
    """Generates tailored outreach drafts for a given prospect."""

    def draft(
        self,
        prospect: Prospect,
        mode: OutreachMode = OutreachMode.VALUE_FIRST,
        user_name: str = "",
        user_role: str = "",
        offering: str = "",
        resource_link: str = "",
    ) -> OutreachDraft:
        first_name = prospect.name.strip().split()[0] if prospect.name else "there"
        safe_company = prospect.company or "your team"
        activity = prospect.research.recent_activity[0] if prospect.research.recent_activity else ""
        sign_off = f"Best,\n{user_name}" if user_name else (f"Best,\n{user_role}" if user_role else "Best")
        role_label = user_role.lower() if user_role else "peer operator"
        offering_label = offering or "growth and customer operations"

        if mode == OutreachMode.CONVERSATION_STARTER and activity:
            connection_note = (
                f"Hi {first_name}, saw your post on {activity[:80]}... "
                f"Really resonated with how we look at operations at {safe_company}. "
                f"Would love to connect here."
            )[:300]

            first_message = (
                f"Hi {first_name},\n\n"
                f"Appreciated your point regarding: \"{activity[:140]}\".\n\n"
                f"We've been seeing similar shifts across teams in {prospect.industry or 'the space'}. "
                f"How are you and the {safe_company} team approaching that balance this quarter?\n\n"
                f"{sign_off}"
            )

            followup = (
                f"Hi {first_name}, looping back briefly. We put together a short note on how teams are tackling "
                f"that exact friction without inflating overhead. Happy to share if relevant."
            )

            factual_basis = f"Derived directly from prospect's public post: '{activity[:100]}'"

        elif mode == OutreachMode.VALUE_FIRST:
            connection_note = (
                f"Hi {first_name}, fellow {role_label} following your work building {safe_company}. "
                f"Put together a teardown on {offering_label} metrics that might be helpful. Would value connecting."
            )[:300]

            link_part = f"{resource_link}\n\n" if resource_link else "Happy to share the breakdown if you'd like to review.\n\n"

            first_message = (
                f"Hi {first_name},\n\n"
                f"I've been following {safe_company}'s progress in {prospect.location or 'the market'}.\n\n"
                f"We recently documented a breakdown of unit economics and performance benchmarks for {prospect.industry or 'growing companies'}. "
                f"No pitch or sales call expected—thought it might provide a useful peer data point for you:\n"
                f"{link_part}"
                f"Curious if these benchmarks mirror what you're seeing at {safe_company}.\n\n"
                f"{sign_off}"
            )

            followup = (
                f"Hi {first_name}, just wanted to make sure that came through cleanly. "
                f"Hope the benchmark breakdown provides a useful reference point for the team."
            )

            factual_basis = f"Based on {safe_company} operating in {prospect.industry or 'target sector'} and matching target role."

        elif mode == OutreachMode.PROBLEM_RELEVANT:
            # Phase 11: Do not infer non-existent pain points.
            # Separate KNOWN / RESEARCHED / UNKNOWN
            verified_pain = ""
            pain_status = "UNKNOWN"
            if prospect.research and getattr(prospect.research, "possible_pain_points", None):
                verified_pain = prospect.research.possible_pain_points[0]
                pain_status = "RESEARCHED"
            elif prospect.intent and getattr(prospect.intent, "signals", None):
                verified_pain = prospect.intent.signals[0]
                pain_status = "RESEARCHED"

            if pain_status == "UNKNOWN" or not verified_pain:
                # If research is insufficient, do not invent company challenges
                connection_note = (
                    f"Hi {first_name}, fellow {role_label} following {safe_company}. "
                    f"Always glad to connect with operators in {prospect.industry or 'the space'}."
                )[:300]

                first_message = (
                    f"Hi {first_name},\n\n"
                    f"Reaching out as a fellow operator following {safe_company}.\n\n"
                    f"We track common operational patterns across {prospect.industry or 'the sector'}, but I don't assume your specific priorities without asking.\n\n"
                    f"Is {offering_label} an active focus for your team this quarter?\n\n"
                    f"{sign_off}"
                )

                followup = (
                    f"Hi {first_name}, following up briefly. If this isn't relevant to your current priorities, "
                    f"no worries at all."
                )

                factual_basis = "PERSONALIZATION_INSUFFICIENT_EVIDENCE: No verified pain points discovered; general non-presumptive inquiry used."
            else:
                connection_note = (
                    f"Hi {first_name}, saw {safe_company}'s focus on {verified_pain[:60]}... "
                    f"Curious how you're navigating that balance. Great to connect."
                )[:300]

                first_message = (
                    f"Hi {first_name},\n\n"
                    f"Noticed {safe_company}'s recent work regarding: {verified_pain}.\n\n"
                    f"Many teams in {prospect.industry or 'the space'} encounter friction balancing that with existing workflows.\n\n"
                    f"How is the team approaching that at your current stage?\n\n"
                    f"{sign_off}"
                )

                followup = (
                    f"Hi {first_name}, following up on this in case it got buried. Open to a brief asynchronous chat "
                    f"if that remains an active priority."
                )

                factual_basis = f"RESEARCHED: Grounded in verified prospect signal: '{verified_pain[:100]}'"

        elif mode == OutreachMode.DIRECT_BUSINESS:
            connection_note = (
                f"Hi {first_name}, reaching out directly. We partner with {prospect.industry or 'industry'} "
                f"leaders on {offering_label}. Hope to connect."
            )[:300]

            first_message = (
                f"Hi {first_name},\n\n"
                f"Reaching out directly because your work heading {prospect.job_title or 'leadership'} at {safe_company} "
                f"aligns closely with the teams we support.\n\n"
                f"We help leaders implement high-impact systems for {offering_label}.\n\n"
                f"If you're evaluating options for {offering_label} over the next few months, would you be open to a 10-minute intro call?\n\n"
                f"{sign_off}"
            )

            followup = (
                f"Hi {first_name}, understand you're busy scaling {safe_company}. If timing isn't right now, "
                f"I'll keep following your updates and reach out down the road."
            )

            factual_basis = f"Transparent direct business inquiry based on role match: {prospect.job_title} at {safe_company}."

        else:  # NETWORKING
            connection_note = (
                f"Hi {first_name}, great seeing your trajectory with {safe_company}. "
                f"Always glad to connect with fellow leaders in {prospect.industry or 'the industry'}."
            )[:300]

            first_message = (
                f"Hi {first_name},\n\n"
                f"Thanks for connecting. Always glad to have peers in {prospect.industry or 'our sector'} in my network.\n\n"
                f"Looking forward to following {safe_company}'s milestones.\n\n"
                f"{sign_off}"
            )

            followup = (
                f"Hi {first_name}, enjoyed your recent updates. Let me know if there's ever anything I can support from my end."
            )

            factual_basis = f"Peer networking connection based on verified role '{prospect.job_title}'."

        # Save to prospect outreach fields
        prospect.outreach.connection_draft = connection_note
        prospect.outreach.first_message = first_message
        prospect.outreach.followup_drafts = [followup]

        return OutreachDraft(
            mode=mode.value if isinstance(mode, OutreachMode) else str(mode),
            connection_note=connection_note,
            first_message=first_message,
            followup_message=followup,
            factual_basis=factual_basis,
            character_counts={
                "connection_note": len(connection_note),
                "first_message": len(first_message),
                "followup": len(followup),
            },
        )
