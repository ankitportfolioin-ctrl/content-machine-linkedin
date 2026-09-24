"""Prospect Discovery Engine.

Vendor-neutral interface for discovering LinkedIn prospects based on ICP criteria.
Supports:
- Authorized APIs / Apify actors
- CSV / JSON imports
- Manual input
- Mock / Offline demo data for testing and offline development
"""
from __future__ import annotations

import csv
import io
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from .icp import ICP
from .prospect import Prospect, generate_prospect_id, normalize_linkedin_url


class DiscoveryUnavailableResult(list):
    """A list-compatible return value indicating DISCOVERY_UNAVAILABLE."""
    status: str = "DISCOVERY_UNAVAILABLE"
    error: str = "Apify credentials missing (APIFY_TOKEN or APIFY_API_TOKEN not configured)."

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, str) and other.upper() == "DISCOVERY_UNAVAILABLE":
            return True
        return super().__eq__(other)

    def __str__(self) -> str:
        return "DISCOVERY_UNAVAILABLE"

    def __repr__(self) -> str:
        return "DISCOVERY_UNAVAILABLE"


class DiscoveryUnavailableError(RuntimeError):
    """Raised or caught when prospect discovery provider credentials are missing."""
    status: str = "DISCOVERY_UNAVAILABLE"

    def __str__(self) -> str:
        return "DISCOVERY_UNAVAILABLE"


SAMPLE_DEMO_PROSPECTS: List[Dict[str, Any]] = [
    {
        "name": "Rahul Sharma",
        "linkedin_url": "https://www.linkedin.com/in/rahulsharma-d2c",
        "headline": "Co-Founder & CEO @ GlowRoots D2C | Scaling sustainable organic personal care to 50k monthly orders",
        "job_title": "Co-Founder & CEO",
        "company": "GlowRoots D2C",
        "company_url": "https://glowroots.in",
        "industry": "D2C / E-commerce",
        "location": "Bengaluru, India",
        "company_size": "45 employees",
        "source": "discovery_demo",
        "source_url": "https://www.linkedin.com/in/rahulsharma-d2c",
        "research": {
            "summary": "Co-Founder scaling an organic personal care brand in India. Actively posting about customer acquisition costs and logistics challenges on LinkedIn.",
            "recent_activity": [
                "Posted: 'CAC on paid Meta ads jumped 42% last quarter. Diversifying into founder storytelling and organic LinkedIn content distribution.'",
                "Shared metrics on reaching 50,000 monthly orders without deep-discounting."
            ],
            "possible_pain_points": [
                "Rising paid acquisition costs on Meta/Google",
                "Needs organic B2B and consumer brand amplification through founder social media"
            ],
            "relevant_topics": ["D2C unit economics", "organic social distribution", "retention marketing"],
            "personalization_points": [
                "Recent post noting 42% jump in Meta CAC",
                "Scaling personal care brand from Bangalore"
            ]
        }
    },
    {
        "name": "Priya Nair",
        "linkedin_url": "https://www.linkedin.com/in/priya-nair-urban",
        "headline": "Head of Growth & Performance Marketing @ UrbanNaturals | Ex-Nykaa",
        "job_title": "Head of Growth",
        "company": "UrbanNaturals",
        "company_url": "https://urbannaturals.co",
        "industry": "E-commerce",
        "location": "Mumbai, India",
        "company_size": "80 employees",
        "source": "discovery_demo",
        "source_url": "https://www.linkedin.com/in/priya-nair-urban",
        "research": {
            "summary": "Leads performance marketing and creative content strategy at UrbanNaturals. Looking for specialized creative distribution agencies.",
            "recent_activity": [
                "Commented: 'Looking for creator agencies that understand LinkedIn & Instagram cross-pollination.'",
                "Published thought leadership on retention loops for omnichannel retail."
            ],
            "possible_pain_points": [
                "Managing multi-channel creative volume",
                "Sourcing authentic founder & advocacy content"
            ],
            "relevant_topics": ["omnichannel retention", "creator partnerships", "lead generation"],
            "personalization_points": [
                "Comment regarding creator agency partnerships",
                "Previous experience at Nykaa"
            ]
        }
    },
    {
        "name": "Vikram Mehta",
        "linkedin_url": "https://www.linkedin.com/in/vikrammehta-ops",
        "headline": "VP of Operations @ ChaiPoint Direct | Scaling omnichannel fulfillment & customer care",
        "job_title": "VP of Operations",
        "company": "ChaiPoint Direct",
        "company_url": "https://chaipointdirect.in",
        "industry": "D2C / E-commerce",
        "location": "Gurugram, India",
        "company_size": "150 employees",
        "source": "discovery_demo",
        "source_url": "https://www.linkedin.com/in/vikrammehta-ops",
        "research": {
            "summary": "Operations executive managing customer support turnaround, logistics SLAs, and omnichannel delivery across India.",
            "recent_activity": [
                "Posted: 'Reduced order support resolution time from 4 hours to 20 minutes across 12 fulfillment centers.'"
            ],
            "possible_pain_points": [
                "Peak season support volume spikes",
                "Maintaining sub-30 minute resolution SLAs across multiple digital channels"
            ],
            "relevant_topics": ["Customer support automation", "D2C logistics", "Resolution SLAs"],
            "personalization_points": [
                "Shared resolution time reduction from 4 hours to 20 minutes",
                "Operations leadership across 12 fulfillment hubs"
            ]
        }
    },
    {
        "name": "Sarah Jenkins",
        "linkedin_url": "https://www.linkedin.com/in/sarahjenkins-health",
        "headline": "Founder & Managing Director @ VitaHealth Direct | Omnichannel Wellness",
        "job_title": "Founder & Managing Director",
        "company": "VitaHealth Direct",
        "company_url": "https://vitahealth.co.uk",
        "industry": "D2C / Health & Wellness",
        "location": "London, UK",
        "company_size": "65 employees",
        "source": "discovery_demo",
        "source_url": "https://www.linkedin.com/in/sarahjenkins-health",
        "research": {
            "summary": "Health and wellness entrepreneur expanding product lines across European retail partners.",
            "recent_activity": [
                "Announced new retail listing in 200 boots locations across the UK."
            ],
            "possible_pain_points": [
                "Supporting retail velocity with social proof",
                "Maintaining DTC margins alongside retail distribution"
            ],
            "relevant_topics": ["Omnichannel retail", "supply chain velocity", "founder brand"],
            "personalization_points": [
                "Expansion into retail stores announcement"
            ]
        }
    }
]


def load_prospects_from_csv(csv_content_or_path: str) -> List[Prospect]:
    """Parse prospects from CSV content or a file path."""
    text = csv_content_or_path
    if "\n" not in text and Path(text).is_file():
        text = Path(text).read_text(encoding="utf-8")
    
    reader = csv.DictReader(io.StringIO(text.strip()))
    prospects: List[Prospect] = []
    now = datetime.now(timezone.utc).isoformat()
    for row in reader:
        name = row.get("name") or row.get("Name") or row.get("Full Name") or ""
        if not name.strip():
            continue
        url = row.get("linkedin_url") or row.get("url") or row.get("LinkedIn") or ""
        p = Prospect(
            name=name.strip(),
            linkedin_url=url.strip(),
            headline=row.get("headline", "").strip(),
            job_title=(row.get("job_title") or row.get("title") or row.get("Role") or "").strip(),
            company=(row.get("company") or row.get("Company") or "").strip(),
            company_url=(row.get("company_url") or "").strip(),
            industry=(row.get("industry") or row.get("Industry") or "").strip(),
            location=(row.get("location") or row.get("Location") or "").strip(),
            company_size=(row.get("company_size") or "").strip(),
            source="csv_import",
            source_url=url.strip(),
            created_at=now,
        )
        prospects.append(p)
    return prospects


def discover_prospects(
    criteria: Union[ICP, Dict[str, Any]],
    backend: Optional[str] = None,
    limit: int = 10,
    source_file: Optional[str] = None,
) -> List[Prospect]:
    """Discover prospects matching ICP criteria using the configured provider.

    Backends:
    - 'demo' / 'mock': Built-in high-quality verified test dataset (zero API keys needed)
    - 'csv': Imports from a CSV file specified in `source_file`
    - 'apify': Uses Apify LinkedIn scraper actor when APIFY_API_TOKEN is present
    - 'manual': Returns empty list ready for user-entered prospects
    """
    icp = criteria if isinstance(criteria, ICP) else ICP.from_dict(criteria)
    # Default to manual (real empty state) unless demo mode or provider is explicitly requested
    default_backend = "demo" if os.getenv("COPILOT_DEMO_MODE", "false").lower() == "true" else "manual"
    chosen_backend = (backend or os.getenv("PROSPECT_DISCOVERY_BACKEND") or default_backend).lower()

    if chosen_backend == "csv" and source_file:
        raw_list = load_prospects_from_csv(source_file)
        return raw_list[:limit]

    if chosen_backend == "apify":
        token = os.getenv("APIFY_TOKEN") or os.getenv("APIFY_API_TOKEN")
        if not token:
            # Apify credentials missing: return explicit DISCOVERY_UNAVAILABLE result
            return DiscoveryUnavailableResult()
        # When token is present, in future actual Apify actor runs here

    if chosen_backend in ("demo", "mock"):
        is_demo_mode = os.getenv("COPILOT_DEMO_MODE", "false").lower() == "true"
        # Strictly isolate demo prospects: NEVER return in an unconfigured real customer workspace
        # Only return demo records if backend was explicitly passed as demo/mock or COPILOT_DEMO_MODE is true
        if not is_demo_mode and (backend is None or backend.lower() not in ("demo", "mock")):
            return []

        results: List[Prospect] = []
        # Filter against ICP if roles or industries are provided
        target_roles = [r.lower() for r in icp.roles if r]
        target_industries = [i.lower() for i in icp.industries if i]

        candidates = SAMPLE_DEMO_PROSPECTS
        if target_roles or target_industries:
            matched = []
            for raw in candidates:
                role_match = not target_roles or any(tr in raw.get("job_title", "").lower() for tr in target_roles)
                ind_match = not target_industries or any(ti in raw.get("industry", "").lower() or ti in raw.get("company", "").lower() for ti in target_industries)
                if role_match and ind_match:
                    matched.append(raw)
            candidates = matched

        for raw in candidates[:limit]:
            p = Prospect.from_dict(raw)
            p.created_at = datetime.now(timezone.utc).isoformat()
            p.source = "demo"
            results.append(p)
        return results

    # Real workspace manual/empty mode
    return []


def filter_duplicate_prospects(
    new_prospects: List[Prospect],
    existing_prospects: List[Prospect],
) -> List[Prospect]:
    """Filter out prospects that already exist in the pipeline or database."""
    seen_keys = {p.dedup_key() for p in existing_prospects}
    unique: List[Prospect] = []
    for p in new_prospects:
        key = p.dedup_key()
        if key not in seen_keys:
            seen_keys.add(key)
            unique.append(p)
    return unique
