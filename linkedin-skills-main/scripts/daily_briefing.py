#!/usr/bin/env python3
"""Daily AI Briefing for LinkedIn AI Sales & Growth Copilot.

Provides a structured, high-signal morning plan:
- Top 3 Operational Priorities
- Prospects Needing Review
- Conversations / Inbox Items Needing Response
- Follow-ups Due
- Suggested LinkedIn Post of the Day (grounded in current pipeline insights)
- Real-time CRM Pipeline Statistics

Run every morning:
    python scripts/daily_briefing.py
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Add repo root to sys.path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.analytics.analytics_engine import AnalyticsEngine
from lib.approval import ApprovalManager
from lib.crm.pipeline import CRMPipeline
from lib.outreach.sequence import OutreachSequenceEngine
from lib.storage.store import get_storage
from lib.workflow_engine import WorkflowEngine


def generate_daily_briefing() -> str:
    store = get_storage()
    engine = WorkflowEngine(store=store)
    crm = CRMPipeline(store=store)
    approval = ApprovalManager(store=store)
    analytics = AnalyticsEngine(store=store, pipeline=crm)
    seq_engine = OutreachSequenceEngine()

    prospects = engine.list_prospects()
    pending_cards = approval.list_pending()
    stats = crm.summary_stats()
    today_str = datetime.now(timezone.utc).strftime("%A, %B %d, %Y")

    # Load Profile/Persona to ground suggested post
    data_dir_env = os.getenv("COPILOT_DATA_DIR")
    if data_dir_env and Path(data_dir_env).is_dir():
        data_dir = Path(data_dir_env)
    elif (ROOT.parent / ".copilot_data").is_dir():
        data_dir = ROOT.parent / ".copilot_data"
    else:
        data_dir = ROOT / ".copilot_data"

    profile_file = data_dir / "voice-profile.json"
    user_role = ""
    user_pillars = []
    user_receipts = []
    if profile_file.is_file():
        try:
            p_data = json.loads(profile_file.read_text(encoding="utf-8"))
            user_role = p_data.get("role", "")
            user_pillars = p_data.get("contentPillars", [])
            user_receipts = p_data.get("keyReceipts", [])
        except Exception:
            pass

    is_workspace_empty = (
        len(prospects) == 0
        and len(pending_cards) == 0
        and stats.get("total_prospects", 0) == 0
        and (not user_role or not user_pillars or len(user_receipts) == 0)
    )

    if is_workspace_empty:
        return "\n".join([
            "==================================================================",
            f" 🌅 LINKEDIN AI SALES & GROWTH COPILOT — DAILY BRIEFING",
            f"    {today_str}",
            "==================================================================",
            "",
            "⚠️ WORKSPACE STATUS: WORKSPACE NOT READY / UNCONFIGURED",
            "",
            "The workspace currently lacks data and configuration to provide active opportunities.",
            "The Growth Operator does not invent fake recommendations or opportunities.",
            "",
            "Missing Configuration & Evidence:",
            f"   • Voice Profile & ICP: {'Configured' if user_role else 'Missing (Role, Target Audience, and Pillars required)'}",
            f"   • Prospects in CRM: {len(prospects)}",
            f"   • Active Pipeline: ${stats.get('pipeline_value', 0):,.2f}",
            f"   • Inbound Messages / Booked Slots: 0",
            f"   • Verified User Receipts: {len(user_receipts)}",
            f"   • Platform Analytics: UNAVAILABLE (channel not connected)",
            "",
            "Honest Setup Priorities:",
            "   1. Complete profile setup: role, ICP audience, and content pillars.",
            "   2. Add verified operational receipts / case study proof points.",
            "   3. Discover or import initial ICP prospects into CRM.",
            "",
            "==================================================================",
            " Run 'python cli.py --help' to configure your workspace.",
            "==================================================================",
        ])

    lines = [
        "==================================================================",
        f" 🌅 LINKEDIN AI SALES & GROWTH COPILOT — DAILY BRIEFING",
        f"    {today_str}",
        "==================================================================",
        "",
        "🎯 TOP PRIORITIES FOR TODAY:",
    ]

    p1 = f"1. Review and clear {len(pending_cards)} pending outreach draft(s) awaiting approval." if pending_cards else "1. Identify new ICP prospects or refresh discovery pipeline."
    p2 = "2. Review CRM prospect pipeline." if len(prospects) > 0 else "2. Import verified prospects into CRM."
    p3 = f"3. Draft thought-leadership post for {user_pillars[0]}." if user_pillars else "3. Define content pillars in profile."
    lines.extend([f"   {p1}", f"   {p2}", f"   {p3}", ""])

    # 1. Pending Approvals
    lines.append(f"📋 PROSPECTS & DRAFTS NEEDING REVIEW ({len(pending_cards)}):")
    if not pending_cards:
        lines.append("   ✅ No drafts pending review. Your queue is clean!")
    else:
        for card in pending_cards[:5]:
            lines.append(f"   • [{card.kind.upper()}] {card.target}")
            lines.append(f"     Why: {card.why}")
            lines.append(f"     Preview: \"{(card.edited_draft or card.draft)[:110]}...\"")
            lines.append(f"     Card ID: {card.id}")
            lines.append("")

    # 2. Follow-ups Due
    contacted_prospects = [p for p in prospects if p.pipeline.stage == "contacted"]
    followups_due = []
    for p in contacted_prospects:
        next_step = seq_engine.evaluate_next_step(p)
        if next_step.status == "pending_review" and next_step.step_number > 0:
            followups_due.append((p, next_step))

    lines.append(f"⏰ FOLLOW-UPS DUE TODAY ({len(followups_due)}):")
    if not followups_due:
        lines.append("   ✅ No follow-ups due today. Multi-touch cadence is within wait periods.")
    else:
        for p, step in followups_due:
            lines.append(f"   • {p.name} ({p.company}) — {step.reason}")
    lines.append("")

    # 3. Suggested LinkedIn Post of the Day
    pillar_str = user_pillars[0] if user_pillars else "Industry Insights & Lessons"
    role_str = f" as {user_role}" if user_role else ""

    lines.extend([
        "💡 SUGGESTED THOUGHT-LEADERSHIP POST FOR TODAY:",
        "------------------------------------------------------------------",
        f"Topic Focus: {pillar_str}",
        f"Perspective: Authentic operator insights{role_str}",
        "",
        f"Prompt: Share one non-obvious lesson or friction point your team navigated recently in {pillar_str}.",
        "Include concrete constraints, trade-offs, and an open question for peers.",
        "------------------------------------------------------------------",
        "",
    ])

    # 4. Pipeline Stats
    lines.extend([
        "📊 PIPELINE & CONVERSION SNAPSHOT:",
        f"   • Total Prospects in CRM: {stats.get('total_prospects', 0)}",
        f"   • Active Pipeline Value:  ${stats.get('pipeline_value', 0):,.2f}",
        "   • Breakdown by Stage:",
    ])
    for stage, count in stats.get("by_stage", {}).items():
        lines.append(f"     - {stage}: {count}")

    lines.extend([
        "",
        "==================================================================",
        " Run 'python cli.py --help' to review or execute approved actions.",
        "==================================================================",
    ])

    return "\n".join(lines)


if __name__ == "__main__":
    print(generate_daily_briefing())
