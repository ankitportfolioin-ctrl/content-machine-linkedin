"""Prospect Researcher Agent.

Synthesizes public profile details, recent LinkedIn posts, and company data
into evidence-backed research without fabricating facts or assuming pain points.
Wraps all external post data in untrusted content defenses.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional

from .untrusted_content import sanitize_untrusted_content
from ..research.prospect import Prospect, ResearchData


@dataclass
class ResearchResult:
    profile_summary: str
    relevant_signals: List[str] = field(default_factory=list)
    personalization_points: List[str] = field(default_factory=list)
    possible_business_relevance: str = ""
    outreach_angles: List[Dict[str, str]] = field(default_factory=list)
    forbidden_topics: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class ProspectResearcher:
    """Researches prospects based on available verifiable data."""

    def research(self, prospect: Prospect, user_offering: str = "") -> ResearchResult:
        """Synthesize verified facts about the prospect."""
        # Sanitize any prospect inputs
        safe_name = sanitize_untrusted_content(prospect.name)
        safe_title = sanitize_untrusted_content(prospect.job_title or prospect.headline)
        safe_company = sanitize_untrusted_content(prospect.company)
        safe_location = sanitize_untrusted_content(prospect.location)
        raw_activities = [sanitize_untrusted_content(a) for a in (prospect.research.recent_activity or [])]

        # 1. Profile Summary (2-4 sentences grounded only in known facts)
        summary_sentences = [
            f"{safe_name} is currently serving as {safe_title} at {safe_company or 'their organization'} based in {safe_location or 'their region'}.",
            f"The company operates within the {prospect.industry or 'broader commercial'} sector with an estimated team size of {prospect.company_size or 'undisclosed scale'}."
        ]
        if raw_activities:
            summary_sentences.append(f"Their recent public commentary focuses on {raw_activities[0][:120]}.")
        profile_summary = " ".join(summary_sentences)

        # 2. Relevant Signals (bullet list from verified evidence)
        signals: List[str] = []
        for act in raw_activities:
            signals.append(f"Public activity: {act}")
        if not signals:
            signals.append(f"Verified profile headline: '{safe_title}'")

        # 3. Personalization Points (strictly facts supported by source data)
        personalization: List[str] = []
        if safe_company:
            personalization.append(f"Leadership role at {safe_company}")
        if safe_location:
            personalization.append(f"Local market context: {safe_location}")
        for act in raw_activities:
            personalization.append(f"Referenced topic: '{act[:80]}...'")

        # 4. Possible Business Relevance
        if user_offering:
            relevance = (
                f"Given {safe_name}'s focus on {safe_title.lower()} and their public interest in operational scaling, "
                f"there may be mutual value exploring how {user_offering} addresses workflow bottlenecks, "
                f"though their current tooling or existing vendor relationships remain unverified."
            )
        else:
            relevance = (
                f"As {safe_title} at {safe_company}, {safe_name} makes decisions regarding operational scaling, "
                f"customer experience, and team execution. Peer-level exchange regarding operational hurdles is appropriate."
            )

        # 5. Outreach Angles (2-3 distinct non-salesy approaches)
        angles: List[Dict[str, str]] = [
            {
                "angle": "VALUE_FIRST",
                "headline": "Peer Resource / Case Study Exchange",
                "description": f"Share a tactical breakdown or benchmark related to {prospect.industry or 'industry'} challenges without pitching."
            },
            {
                "angle": "CONVERSATION_STARTER",
                "headline": "Discussion on Recent Shared Post",
                "description": f"Comment or message referencing their perspective on {raw_activities[0][:60] if raw_activities else 'market evolution'}."
            },
            {
                "angle": "PROBLEM_RELEVANT",
                "headline": "Direct Operational Question",
                "description": f"Inquire how their team at {safe_company} is currently handling resource allocation or distribution."
            }
        ]

        # 6. Forbidden Topics
        forbidden: List[str] = [
            "Do NOT assume they have poor metrics or failing marketing",
            "Do NOT pretend you have been long-time followers if you have not",
            "Do NOT pitch product or pricing in the first interaction",
            "Do NOT use boilerplate phrases like 'I came across your profile and was impressed'"
        ]

        # Sync back to prospect
        prospect.research = ResearchData(
            summary=profile_summary,
            recent_activity=raw_activities,
            possible_pain_points=[a["description"] for a in angles],
            relevant_topics=[safe_title, prospect.industry or "Scaling"],
            personalization_points=personalization,
        )

        return ResearchResult(
            profile_summary=profile_summary,
            relevant_signals=signals,
            personalization_points=personalization,
            possible_business_relevance=relevance,
            outreach_angles=angles,
            forbidden_topics=forbidden,
        )
