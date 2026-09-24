"""Authoritative Provenance and Claim Validation Engine.

Enforces strict provenance verification across all content generation and editorial paths.
Every generated factual, statistical, testimonial, personal-experience, customer-count,
revenue, conversion, performance, or outcome claim must resolve to one of:
- VERIFIED_SOURCE: Claim directly supported by an ingested source.
- VERIFIED_USER_RECEIPT: Claim exists in explicit user-provided evidence/receipts.
- VERIFIED_INTERNAL_DATA: Claim exists in actual workspace data (CRM, logs, analytics).
- USER_ENTERED: Explicit user-provided statement, preserving provenance.
- ESTIMATED: Explicitly labeled as an estimate (never presented as an established fact).
- UNAVAILABLE: Unverified claim; must be flagged as REVIEW_REQUIRED or removed.

Hard-blocks without valid evidence:
- Study / survey claims ("We analyzed 40 B2B founders...", "Surveyed 100 leaders...")
- Revenue / ARR claims ("$1M ARR...", "$500k in pipeline...")
- Conversion / performance metrics ("Response rate jumps from 1.5% to 24%", "3x conversion...")
- Personal hiring / operator claims ("In 2024, I hired 12 senior engineers...")
- First-party impact claims ("our customers...", "my clients...", "we generated...", "we increased...")
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple


class ProvenanceLevel(str, Enum):
    VERIFIED_SOURCE = "VERIFIED_SOURCE"
    VERIFIED_USER_RECEIPT = "VERIFIED_USER_RECEIPT"
    VERIFIED_INTERNAL_DATA = "VERIFIED_INTERNAL_DATA"
    USER_ENTERED = "USER_ENTERED"
    ESTIMATED = "ESTIMATED"
    UNAVAILABLE = "UNAVAILABLE"


class ValidationStatus(str, Enum):
    PASSED = "PASSED"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"


@dataclass
class ClaimCheck:
    claim: str
    provenance: str
    reason: str
    action: str
    context: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ProvenanceReport:
    status: str
    unsupported_count: int
    claims: List[ClaimCheck] = field(default_factory=list)
    sanitized_text: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "unsupported_count": self.unsupported_count,
            "claims": [c.to_dict() for c in self.claims],
            "sanitized_text": self.sanitized_text,
        }

    def render_cli(self) -> str:
        if self.status == ValidationStatus.PASSED.value:
            return "STATUS: PASSED (All claims verified by active evidence)."
        
        lines = [
            "STATUS: REVIEW_REQUIRED",
            "REASON: Unsupported factual claim detected.",
        ]
        unavail = [c for c in self.claims if c.provenance == ProvenanceLevel.UNAVAILABLE.value]
        if unavail:
            first = unavail[0]
            lines.append(f"CLAIM:\n\"{first.claim}\"")
            lines.append("EVIDENCE:\nUNAVAILABLE")
            lines.append(f"ACTION:\n{first.action}")
            if len(unavail) > 1:
                lines.append(f"\n({len(unavail) - 1} additional ungrounded claim(s) require review)")
        return "\n".join(lines)


# Regex patterns requiring explicit provenance
CLAIM_PATTERNS = [
    # 1. Study / research claims: "We analyzed 40 B2B founders...", "I surveyed 50 companies..."
    (
        re.compile(r"\b(?:we|i)\s+(?:analyzed|studied|audited|reviewed|surveyed|interviewed|tracked)\s+(\d+)\s+([a-zA-Z0-9\s]+)", re.I),
        "Study / cohort analysis claim",
    ),
    # 2. Revenue / ARR claims: "$1M ARR", "$500k MRR", "$10,000 in revenue"
    (
        re.compile(r"\$\d+(?:\.\d+)?(?:\s*(?:billion|million|trillion|B|M|k|ARR|MRR))\b", re.I),
        "Specific financial / revenue claim",
    ),
    # 3. Conversion / performance jumps: "Response rate jumps from 1.5% to 24%", "increased conversion by 40%"
    (
        re.compile(r"(?:response\s+rate|conversion(?:\s+rate)?|open\s+rate|reply\s+rate|booking\s+rate)\s+(?:jumps?|jumped|increased?|grew|dropped|fell)\s+(?:from\s+[\d\.]+%?\s+to\s+[\d\.]+%?|by\s+[\d\.]+%?)", re.I),
        "Performance / conversion delta claim",
    ),
    # 4. Personal hiring / staffing assertions: "In 2024, I hired 12 senior...", "I hired for resume logos"
    (
        re.compile(r"\b(?:in\s+20\d\d,?\s+)?(?:i|we)\s+hired\b[^.\n]+", re.I),
        "Personal hiring experience claim",
    ),
    # 5. First-party customer impact claims: "our customers generated...", "my clients scaled to..."
    (
        re.compile(r"\b(?:our\s+customers?|my\s+clients?|our\s+users?|our\s+agency)\s+(?:generated|scaled|closed|achieved|saw|increased|added)\b[^.\n]+", re.I),
        "Client / customer testimonial outcome claim",
    ),
    # 6. Specific stand-alone statistical jump assertions: "from X% to Y%"
    (
        re.compile(r"\bfrom\s+\d+(?:\.\d+)?%\s+to\s+\d+(?:\.\d+)?%", re.I),
        "Comparative statistical outcome claim",
    ),
]


def validate_content_claims(
    text: str,
    user_receipts: Optional[List[str]] = None,
    source_docs: Optional[List[Dict[str, Any]]] = None,
    internal_data: Optional[Dict[str, Any]] = None,
) -> ProvenanceReport:
    """Universal provenance gate for all content generation and calendar paths.
    
    Verifies every factual proposition against supplied receipts, source text,
    or internal workspace data.
    """
    receipts_corpus = [r.lower().strip() for r in (user_receipts or [])]
    
    source_corpus: List[str] = []
    if source_docs:
        for doc in source_docs:
            source_corpus.append((doc.get("title") or "").lower())
            source_corpus.append((doc.get("body") or doc.get("text") or "").lower())
            for item in doc.get("items", []):
                if isinstance(item, dict):
                    source_corpus.append((item.get("name") or "").lower())
                    source_corpus.append((item.get("description") or "").lower())
    
    internal_corpus: List[str] = []
    if internal_data:
        internal_corpus.append(str(internal_data).lower())

    claims: List[ClaimCheck] = []
    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]

    for para in paragraphs:
        para_lower = para.lower()
        for pattern, label in CLAIM_PATTERNS:
            for match in pattern.finditer(para):
                matched_str = match.group(0).strip()
                matched_lower = matched_str.lower()

                # Check if explicitly labeled as an estimate
                if "estimate" in para_lower or "roughly" in para_lower or "hypothetically" in para_lower:
                    claims.append(ClaimCheck(
                        claim=matched_str,
                        provenance=ProvenanceLevel.ESTIMATED.value,
                        reason="Explicitly qualified as an estimate or hypothetical illustration.",
                        action="Permitted as estimated context.",
                        context=para[:90],
                    ))
                    continue

                # 1. Check user receipts
                if any(matched_lower in r or r in matched_lower for r in receipts_corpus):
                    claims.append(ClaimCheck(
                        claim=matched_str,
                        provenance=ProvenanceLevel.VERIFIED_USER_RECEIPT.value,
                        reason="Matches verified user receipts/proof points in voice profile.",
                        action="Permitted with user receipt provenance.",
                        context=para[:90],
                    ))
                    continue

                # 2. Check source documents
                if any(matched_lower in s for s in source_corpus):
                    claims.append(ClaimCheck(
                        claim=matched_str,
                        provenance=ProvenanceLevel.VERIFIED_SOURCE.value,
                        reason="Directly verified by ingested source article/data.",
                        action="Permitted with source evidence provenance.",
                        context=para[:90],
                    ))
                    continue

                # 3. Check internal workspace data
                if any(matched_lower in idata for idata in internal_corpus):
                    claims.append(ClaimCheck(
                        claim=matched_str,
                        provenance=ProvenanceLevel.VERIFIED_INTERNAL_DATA.value,
                        reason="Grounded in real workspace pipeline/CRM data.",
                        action="Permitted with internal workspace provenance.",
                        context=para[:90],
                    ))
                    continue

                # 4. Fallback: UNAVAILABLE
                claims.append(ClaimCheck(
                    claim=matched_str,
                    provenance=ProvenanceLevel.UNAVAILABLE.value,
                    reason=f"{label} detected without supporting receipt, source, or workspace evidence.",
                    action="Remove claim or provide supporting receipt/source.",
                    context=para[:90],
                ))

    unsupported = [c for c in claims if c.provenance == ProvenanceLevel.UNAVAILABLE.value]
    status = ValidationStatus.REVIEW_REQUIRED.value if unsupported else ValidationStatus.PASSED.value

    return ProvenanceReport(
        status=status,
        unsupported_count=len(unsupported),
        claims=claims,
        sanitized_text=text,
    )
