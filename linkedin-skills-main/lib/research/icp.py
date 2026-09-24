"""Target Customer Profile (Ideal Customer Profile - ICP) definition and validation.

Allows users to define precise B2B targeting criteria:
roles, industries, company size ranges, geography, pain points, and offer.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class CompanySizeRange:
    min: int = 1
    max: int = 5000

    def contains(self, size_str: str) -> bool:
        """Heuristic check if a company size string or number falls in this range."""
        if not size_str:
            return True
        # Try extracting numbers
        import re
        nums = [int(n) for n in re.findall(r"\d+", size_str.replace(",", ""))]
        if not nums:
            return True
        if len(nums) == 1:
            return self.min <= nums[0] <= self.max
        return not (nums[1] < self.min or nums[0] > self.max)


@dataclass
class ICP:
    name: str = "Default B2B ICP"
    industries: List[str] = field(default_factory=list)
    roles: List[str] = field(default_factory=list)
    target_companies: List[str] = field(default_factory=list)
    company_size: CompanySizeRange = field(default_factory=CompanySizeRange)
    locations: List[str] = field(default_factory=list)
    keywords: List[str] = field(default_factory=list)
    pain_points: List[str] = field(default_factory=list)
    offer: str = ""
    exclusions: List[str] = field(default_factory=list)
    desired_customer_type: str = "B2B Decision Maker"

    def validate(self) -> List[str]:
        """Validate ICP definition."""
        errors: List[str] = []
        if not self.roles and not self.keywords and not self.industries:
            errors.append("ICP must define at least one role, keyword, or industry.")
        if self.company_size.min < 1:
            errors.append("Company size minimum must be at least 1.")
        if self.company_size.max < self.company_size.min:
            errors.append(f"Company size max ({self.company_size.max}) cannot be less than min ({self.company_size.min}).")
        return errors

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["company_size"] = {"min": self.company_size.min, "max": self.company_size.max}
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> ICP:
        data_copy = dict(data)
        if "company_size" in data_copy and isinstance(data_copy["company_size"], dict):
            data_copy["company_size"] = CompanySizeRange(**data_copy["company_size"])
        elif "company_size" not in data_copy:
            data_copy["company_size"] = CompanySizeRange()
        return cls(**{k: v for k, v in data_copy.items() if k in cls.__dataclass_fields__})

    def matches_role(self, role: str) -> int:
        """Calculate match percentage (0-100) for a given job title/role."""
        if not role:
            return 20  # Neutral when unknown
        if not self.roles:
            return 70  # No role restriction
        role_lower = role.lower()
        # Check exclusions first
        for ex in self.exclusions:
            if ex.lower() in role_lower:
                return 0
        for target in self.roles:
            target_lower = target.lower()
            if target_lower in role_lower or role_lower in target_lower:
                return 100
            # Partial keyword overlap
            target_words = set(target_lower.split())
            role_words = set(role_lower.split())
            if target_words & role_words:
                return 75
        return 15

    def matches_industry(self, industry: str) -> int:
        """Calculate match percentage (0-100) for industry."""
        if not industry:
            return 30
        if not self.industries:
            return 70
        ind_lower = industry.lower()
        for ex in self.exclusions:
            if ex.lower() in ind_lower:
                return 0
        for target in self.industries:
            if target.lower() in ind_lower or ind_lower in target.lower():
                return 100
        return 20

    def matches_geography(self, location: str) -> int:
        """Calculate match percentage (0-100) for geography/location."""
        if not location:
            return 40
        if not self.locations:
            return 80
        loc_lower = location.lower()
        for target in self.locations:
            if target.lower() in loc_lower or loc_lower in target.lower():
                return 100
        return 25
