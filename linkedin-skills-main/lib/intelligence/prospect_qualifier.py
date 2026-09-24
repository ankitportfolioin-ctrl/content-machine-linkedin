"""Prospect qualification engine.

Evaluates prospects against an ICP across three explicit dimensions:
1. Fit (Role, Industry, Company, Geography, Size)
2. Intent (Recent public activity, hiring, expansions, stated challenges)
3. Relationship (Existing connection, mutual connections, past discussions)

Emits explanatory rationale rather than an arbitrary opaque score.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional

from ..research.icp import ICP
from ..research.prospect import Prospect, ProspectFit, QualificationInfo


@dataclass
class QualificationResult:
    status: str  # high_relevance | qualified | review_needed | disqualified
    overall_fit_score: int  # 0 to 100
    reasons: List[str] = field(default_factory=list)
    signals_detected: List[str] = field(default_factory=list)
    missing_information: List[str] = field(default_factory=list)
    confidence: str = "medium"  # high | medium | low

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class ProspectQualifier:
    """Evaluates prospects against an Ideal Customer Profile (ICP)."""

    def __init__(self, icp: Optional[ICP] = None):
        self.icp = icp or ICP()

    def qualify(self, prospect: Prospect) -> QualificationResult:
        """Perform deterministic and heuristic qualification on the prospect."""
        reasons: List[str] = []
        signals: List[str] = []
        missing: List[str] = []

        # 1. Dimension: FIT
        role_score = self.icp.matches_role(prospect.job_title or prospect.headline)
        ind_score = self.icp.matches_industry(prospect.industry)
        geo_score = self.icp.matches_geography(prospect.location)
        company_score = 70 if prospect.company else 30

        if not prospect.job_title and not prospect.headline:
            missing.append("Current job title or headline")
        if not prospect.industry:
            missing.append("Industry classification")
        if not prospect.location:
            missing.append("Geographic location")

        if role_score >= 70:
            reasons.append(f"Target role match: '{prospect.job_title or prospect.headline}' fits {self.icp.roles or 'target titles'}")
        elif role_score == 0:
            reasons.append(f"Excluded role pattern in title: '{prospect.job_title or prospect.headline}'")

        if ind_score >= 70:
            reasons.append(f"Target industry match: '{prospect.industry}'")
        if geo_score >= 70:
            reasons.append(f"Target geography match: '{prospect.location}'")

        fit = ProspectFit(
            industry_match=ind_score,
            role_match=role_score,
            company_match=company_score,
            geography_match=geo_score,
        )
        prospect.fit = fit
        overall_fit = fit.overall_score()

        # 2. Dimension: INTENT SIGNALS
        # Inspect recent activity from research if available
        activity = prospect.research.recent_activity or []
        for act in activity:
            act_lower = act.lower()
            if any(kw.lower() in act_lower for kw in self.icp.keywords):
                signals.append(f"Recent discussion mentions core keyword: {act[:100]}...")
            if any(pp.lower() in act_lower for pp in self.icp.pain_points):
                signals.append(f"Stated business friction matching ICP pain point: {act[:100]}...")
            if any(trigger in act_lower for trigger in ["cac", "hiring", "scaling", "launch", "expansion", "budget", "agency", "creator"]):
                signals.append(f"Operational trigger: {act[:90]}")

        if signals:
            reasons.append(f"Detected {len(signals)} relevant intent signal(s) in public LinkedIn activity")
            prospect.intent.signals = signals
            prospect.intent.strength = min(100, 30 + len(signals) * 25)
        else:
            prospect.intent.strength = 15

        # 3. Dimension: RELATIONSHIP
        if prospect.relationship.connected:
            reasons.append("1st-degree connection already established")
        if prospect.relationship.previous_interaction:
            reasons.append("Prior mutual engagement recorded")

        # Determine status
        if role_score == 0:
            status = "disqualified"
            confidence = "high"
        elif overall_fit >= 75 and len(signals) >= 1:
            status = "high_relevance"
            confidence = "high" if len(missing) == 0 else "medium"
        elif overall_fit >= 60:
            status = "qualified"
            confidence = "medium"
        elif overall_fit >= 40:
            status = "review_needed"
            confidence = "low"
        else:
            status = "disqualified"
            confidence = "medium"

        # Update prospect internal qualification state
        prospect.qualification = QualificationInfo(
            score=overall_fit,
            reason="; ".join(reasons[:3]) if reasons else "Insufficient ICP overlap",
            status=status,
        )

        return QualificationResult(
            status=status,
            overall_fit_score=overall_fit,
            reasons=reasons,
            signals_detected=signals,
            missing_information=missing,
            confidence=confidence,
        )
