"""Normalized Prospect representation for the LinkedIn AI Sales & Growth Copilot.

Enforces data provenance: never fabricates missing information.
External fields retain their source and timestamps.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def normalize_linkedin_url(url: str) -> str:
    """Normalize a LinkedIn URL to a canonical lowercase format without query params or trailing slashes."""
    if not url:
        return ""
    clean = url.strip().split("?")[0].split("#")[0].rstrip("/")
    # Force https and lowercase domain
    clean = re.sub(r"^http://", "https://", clean, flags=re.I)
    match = re.search(r"https?://(?:[a-z]{2,3}\.)?linkedin\.com/(.+)$", clean, re.I)
    if match:
        return f"https://www.linkedin.com/{match.group(1).lower()}"
    return clean.lower()


def generate_prospect_id(linkedin_url: str, name: str = "", company: str = "") -> str:
    """Generate a stable deterministic ID for a prospect."""
    norm_url = normalize_linkedin_url(linkedin_url)
    if norm_url:
        digest = hashlib.sha256(norm_url.encode("utf-8")).hexdigest()[:12]
        return f"pr_{digest}"
    combo = f"{name.strip().lower()}:{company.strip().lower()}"
    digest = hashlib.sha256(combo.encode("utf-8")).hexdigest()[:12]
    return f"pr_{digest}"


@dataclass
class ProspectFit:
    industry_match: int = 0  # 0 to 100
    role_match: int = 0      # 0 to 100
    company_match: int = 0   # 0 to 100
    geography_match: int = 0 # 0 to 100

    def overall_score(self) -> int:
        return int(
            (self.industry_match * 0.3)
            + (self.role_match * 0.35)
            + (self.company_match * 0.2)
            + (self.geography_match * 0.15)
        )


@dataclass
class IntentSignal:
    signals: List[str] = field(default_factory=list)
    strength: int = 0  # 0 to 100


@dataclass
class RelationshipInfo:
    connected: bool = False
    previous_interaction: bool = False
    mutual_context: List[str] = field(default_factory=list)


@dataclass
class QualificationInfo:
    score: int = 0
    reason: str = ""
    status: str = "unreviewed"  # unreviewed | qualified | disqualified | high_relevance | review_needed


@dataclass
class ResearchData:
    summary: str = ""
    recent_activity: List[str] = field(default_factory=list)
    possible_pain_points: List[str] = field(default_factory=list)
    relevant_topics: List[str] = field(default_factory=list)
    personalization_points: List[str] = field(default_factory=list)


@dataclass
class OutreachData:
    connection_draft: str = ""
    first_message: str = ""
    followup_drafts: List[str] = field(default_factory=list)


@dataclass
class PipelineInfo:
    stage: str = "discovered"  # discovered, qualified, ready_for_review, approved, contacted, waiting, replied, interested, not_interested, nurture, meeting_requested, meeting_booked, opportunity, won, lost, stopped
    last_action_at: Optional[str] = None
    next_action_at: Optional[str] = None


@dataclass
class Prospect:
    name: str
    id: str = ""
    linkedin_url: str = ""
    headline: str = ""
    job_title: str = ""
    company: str = ""
    company_url: str = ""
    industry: str = ""
    location: str = ""
    company_size: str = ""
    source: str = "manual"  # manual | csv | apify | authorized_api | import
    source_url: str = ""
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    fit: ProspectFit = field(default_factory=ProspectFit)
    intent: IntentSignal = field(default_factory=IntentSignal)
    relationship: RelationshipInfo = field(default_factory=RelationshipInfo)
    qualification: QualificationInfo = field(default_factory=QualificationInfo)
    research: ResearchData = field(default_factory=ResearchData)
    outreach: OutreachData = field(default_factory=OutreachData)
    pipeline: PipelineInfo = field(default_factory=PipelineInfo)

    def __post_init__(self):
        if not self.id:
            self.id = generate_prospect_id(self.linkedin_url, self.name, self.company)
        if self.linkedin_url:
            self.linkedin_url = normalize_linkedin_url(self.linkedin_url)

    def dedup_key(self) -> str:
        """Returns the canonical deduplication key for this prospect."""
        if self.linkedin_url:
            return normalize_linkedin_url(self.linkedin_url)
        return f"{self.name.strip().lower()}@{self.company.strip().lower()}"

    def to_dict(self) -> Dict[str, Any]:
        """Serialize prospect to a pure dictionary."""
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> Prospect:
        """Hydrate a Prospect from a dictionary safely."""
        data_copy = dict(data)
        
        # Sub-dataclass hydration
        if "fit" in data_copy and isinstance(data_copy["fit"], dict):
            data_copy["fit"] = ProspectFit(**data_copy["fit"])
        if "intent" in data_copy and isinstance(data_copy["intent"], dict):
            data_copy["intent"] = IntentSignal(**data_copy["intent"])
        if "relationship" in data_copy and isinstance(data_copy["relationship"], dict):
            data_copy["relationship"] = RelationshipInfo(**data_copy["relationship"])
        if "qualification" in data_copy and isinstance(data_copy["qualification"], dict):
            data_copy["qualification"] = QualificationInfo(**data_copy["qualification"])
        if "research" in data_copy and isinstance(data_copy["research"], dict):
            data_copy["research"] = ResearchData(**data_copy["research"])
        if "outreach" in data_copy and isinstance(data_copy["outreach"], dict):
            data_copy["outreach"] = OutreachData(**data_copy["outreach"])
        if "pipeline" in data_copy and isinstance(data_copy["pipeline"], dict):
            data_copy["pipeline"] = PipelineInfo(**data_copy["pipeline"])

        # Filter out any unexpected keys
        valid_fields = cls.__dataclass_fields__.keys()
        filtered = {k: v for k, v in data_copy.items() if k in valid_fields}
        return cls(**filtered)

    def validate(self) -> List[str]:
        """Validate prospect structure and return list of validation errors, if any."""
        errors: List[str] = []
        if not self.name or not self.name.strip():
            errors.append("Prospect name is required.")
        if self.linkedin_url and not ("linkedin.com" in self.linkedin_url or self.linkedin_url.startswith("http")):
            errors.append(f"Invalid LinkedIn URL format: {self.linkedin_url}")
        return errors
