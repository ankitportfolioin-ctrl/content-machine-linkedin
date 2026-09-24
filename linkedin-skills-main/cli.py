#!/usr/bin/env python3
"""Unified CLI for the LinkedIn AI Sales & Growth Copilot.

Provides an authoritative command-line tool for:
- Prospect discovery, qualification, and research
- Outreach drafting and sequence tracking
- Approval queue review (APPROVE / EDIT / REJECT)
- AI Inbox review and next actions
- CRM pipeline listing and stage transitions
- Provenance-gated content editorial planning
- End-to-end article -> content and idea -> content pipelines
- Clean persona switching (TECH_CREATOR <-> D2C_FOUNDER)
- Sales <-> Content bidirectional bridges
- Growth analytics snapshots
- Daily morning briefing
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Add root to sys.path
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.analytics.analytics_engine import AnalyticsEngine
from lib.approval import ApprovalManager
from lib.content.calendar import ContentCalendar
from lib.content_pipeline import (
    bridge_content_to_sales,
    bridge_sales_to_content,
    get_current_persona,
    pipeline_article_to_content,
    pipeline_idea_to_content,
    switch_persona,
    validate_carousel_execution,
)
from lib.crm.pipeline import CRMPipeline, PipelineStage
from lib.intelligence.prospect_qualifier import ProspectQualifier
from lib.intelligence.prospect_researcher import ProspectResearcher
from lib.outreach.drafter import OutreachDrafter, OutreachMode
from lib.provenance import ProvenanceLevel, ValidationStatus, validate_content_claims
from lib.research.icp import ICP
from lib.research.prospect import Prospect
from lib.research.prospect_discovery import discover_prospects
from lib.storage.store import get_storage
from lib.workflow.next_action import NextActionEngine
from lib.workflow_engine import WorkflowEngine
from scripts.daily_briefing import generate_daily_briefing


def cmd_briefing(args):
    print(generate_daily_briefing())


def cmd_prospect_discover(args):
    store = get_storage()
    engine = WorkflowEngine(store=store, dry_run=args.dry_run)
    icp = ICP(
        roles=[args.role] if args.role else ["CEO", "Founder", "VP Sales", "Head of Growth"],
        industries=[args.industry] if args.industry else ["B2B SaaS", "E-commerce", "D2C"],
        offer=args.offer or "organic LinkedIn distribution and sales pipeline systems",
    )
    prospects = engine.run_discovery_pipeline(icp=icp, backend=args.backend or "demo", limit=args.limit)

    if prospects == "DISCOVERY_UNAVAILABLE" or getattr(prospects, "status", None) == "DISCOVERY_UNAVAILABLE":
        print("STATUS: DISCOVERY_UNAVAILABLE")
        print("REASON:\nApify credentials missing (APIFY_TOKEN or APIFY_API_TOKEN not configured).")
        return

    print(f"✅ Discovered & Processed {len(prospects)} prospects matching ICP criteria (Backend: {args.backend or 'demo'}).")
    for p in prospects:
        print(f"\n• [{p.id}] {p.name} — {p.job_title} @ {p.company} ({p.location})")
        print(f"  Stage: {p.pipeline.stage} | Fit Score: {p.qualification.score}/100")
        print(f"  Reason: {p.qualification.reason}")


def cmd_prospect_qualify(args):
    store = get_storage()
    engine = WorkflowEngine(store=store)
    p = engine.get_prospect(args.prospect_id)
    if not p:
        print(f"❌ Error: Prospect '{args.prospect_id}' not found.", file=sys.stderr)
        sys.exit(1)
    qualifier = ProspectQualifier()
    res = qualifier.qualify(p)
    print(json.dumps(res.to_dict(), indent=2))


def cmd_prospect_research(args):
    store = get_storage()
    engine = WorkflowEngine(store=store)
    p = engine.get_prospect(args.prospect_id)
    if not p:
        print(f"❌ Error: Prospect '{args.prospect_id}' not found.", file=sys.stderr)
        sys.exit(1)
    researcher = ProspectResearcher()
    res = researcher.research(p, user_offering=args.offering or "")
    print(json.dumps(res.to_dict(), indent=2))


def cmd_outreach_draft(args):
    store = get_storage()
    engine = WorkflowEngine(store=store)
    p = engine.get_prospect(args.prospect_id)
    if not p:
        print(f"❌ Error: Prospect '{args.prospect_id}' not found.", file=sys.stderr)
        sys.exit(1)
    drafter = OutreachDrafter()
    mode = OutreachMode(args.mode.upper()) if args.mode else OutreachMode.VALUE_FIRST
    draft = drafter.draft(p, mode=mode, offering=args.offering or "growth and content distribution")
    print(json.dumps(draft.to_dict(), indent=2))


def cmd_outreach_review(args):
    store = get_storage()
    approval = ApprovalManager(store=store)
    cards = approval.list_pending()
    if not cards:
        print("✅ No pending approval cards. All outreach drafts have been reviewed.")
        return

    print(f"📋 Found {len(cards)} pending approval cards:\n")
    for card in cards:
        print(card.render_markdown())
        print("-" * 60)


def cmd_outreach_approve(args):
    store = get_storage()
    approval = ApprovalManager(store=store)
    card = approval.resolve_card(args.card_id, decision=args.decision, edited_text=args.edit_text)
    if not card:
        print(f"❌ Error: Approval card '{args.card_id}' not found.", file=sys.stderr)
        sys.exit(1)
    print(f"✅ Card '{args.card_id}' resolved with decision: {card.status.upper()}")


def cmd_inbox_review(args):
    store = get_storage()
    engine = WorkflowEngine(store=store)
    inbox = NextActionEngine()
    prospects = engine.list_prospects()
    print("📥 AI INBOX & ACTION QUEUE:\n")
    for p in prospects:
        rec = inbox.evaluate_prospect(p)
        print(f"• [{rec.urgency}] {rec.action_title} for {rec.prospect_name} ({rec.prospect_company})")
        print(f"  Why: {rec.why}")
        if rec.suggested_draft:
            print(f"  Draft Preview: \"{rec.suggested_draft[:80]}...\"")
        print(f"  Approval Required: {rec.approval_required}\n")


def cmd_crm_list(args):
    store = get_storage()
    crm = CRMPipeline(store=store)
    records = crm.list_by_stage(args.stage)
    if not records:
        print(f"No CRM records found{f' in stage {args.stage}' if args.stage else ''}.")
        return

    print(f"{'STAGE':<16} | {'PROSPECT NAME':<22} | {'COMPANY':<20} | {'VALUE':<10} | {'NEXT ACTION'}")
    print("-" * 88)
    for r in records:
        val_str = f"${r.opportunity_value:,.0f}" if r.opportunity_value else "$0"
        print(f"{r.stage:<16} | {r.name[:20]:<22} | {r.company[:18]:<20} | {val_str:<10} | {r.next_action or 'N/A'}")


def cmd_content_plan(args):
    store = get_storage()
    calendar = ContentCalendar(store=store)
    drafts = calendar.create_weekly_plan(core_theme=args.theme or "B2B Founder-led Growth")
    
    # Check if any draft failed the provenance gate
    unsupported = [d for d in drafts if d.provenance_status == "REVIEW_REQUIRED"]
    if unsupported:
        print("STATUS: REVIEW_REQUIRED")
        print("REASON:\nUnsupported factual claim detected.\n")
        first = unsupported[0]
        claim_info = first.unsupported_claims[0] if first.unsupported_claims else {}
        print(f"CLAIM:\n\"{claim_info.get('claim', first.hook)}\"\n")
        print("EVIDENCE:\nUNAVAILABLE\n")
        print(f"ACTION:\n{claim_info.get('action', 'Remove claim or provide supporting receipt/source.')}\n")
        return

    print(f"✅ Generated 5-day content editorial plan across alternating pillars (All claims verified by active evidence):\n")
    for d in drafts:
        print(f"📅 {d.target_date} [{d.pillar}] — {d.topic}")
        print(f"   Hook: \"{d.hook[:90]}...\"")
        print(f"   Provenance: {d.provenance_status} | Card ID: {d.approval_card_id}\n")


def cmd_analytics(args):
    store = get_storage()
    analytics = AnalyticsEngine(store=store)
    snap = analytics.generate_snapshot()
    print(json.dumps(snap.to_dict(), indent=2))


def cmd_pipeline_article(args):
    fallback = None
    if getattr(args, "fallback_file", None):
        with open(args.fallback_file, "r", encoding="utf-8") as f:
            fallback = json.load(f)

    res = pipeline_article_to_content(args.url, fallback_article=fallback)
    print(f"\n=======================================================")
    print(f" ARTICLE PIPELINE: {res['source']['title']}")
    print(f"=======================================================")
    print(f"Format:       {res['format']}")
    print(f"Content Type: {res['contentType']}")
    print(f"Source Status:{res['source']['status']}")
    print(f"Final Status: {res['finalStatus']}")
    print(f"\n[Generated Post Content]:\n")
    print(res["finalContent"])
    print("\n-------------------------------------------------------")
    print(f"Quality Gates: {'PASSED' if res['qualityGates']['overallPass'] else 'REVIEW REQUIRED'}")
    for c in res["qualityGates"].get("criticalQualityChecks", []):
        mark = "✅" if c["passed"] else "❌"
        print(f" {mark} {c['name']}: {c['detail']}")
    print("-------------------------------------------------------\n")


def cmd_pipeline_idea(args):
    res = pipeline_idea_to_content(args.idea)
    print(f"\n=======================================================")
    print(f" IDEA PIPELINE: \"{args.idea}\"")
    print(f"=======================================================")
    print(f"Angle:        {res['strategy']['selectedAngle']}")
    print(f"Target:       {res['strategy']['targetAudience']}")
    print(f"Format:       {res['format']}")
    print(f"Final Status: {res['finalStatus']}")
    print(f"\n[Generated Post Content]:\n")
    print(res["finalContent"])
    print("-------------------------------------------------------\n")


def cmd_persona_switch(args):
    persona = args.persona.upper()
    try:
        profile = switch_persona(persona, workspace_id=getattr(args, "workspace_id", "default"))
        print(f"✅ Persona switched successfully to: {persona}")
        print(f"Role:     {profile['role']}")
        print(f"Audience: {profile['audience']}")
        print(f"Pillars:  {', '.join(profile.get('contentPillars', []))}")
        print(f"Receipts: {', '.join(profile.get('keyReceipts', []))}")
    except ValueError as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_bridge_sales_to_content(args):
    opp = bridge_sales_to_content(args.objection, prospect_name=args.prospect, company=args.company)
    print(f"✅ Content opportunity derived from sales objection:")
    print(json.dumps(opp, indent=2))


def cmd_bridge_content_to_sales(args):
    res = bridge_content_to_sales(args.topic)
    print(f"✅ Matched {res['matchedCount']} target prospects in pipeline for content topic '{args.topic}':\n")
    for t in res["targets"]:
        print(f"• {t['name']} ({t.get('jobTitle')} @ {t.get('company')})")
        print(f"  Reference: \"{t['suggestedReference']}\"\n")


def cmd_carousel_validate(args):
    with open(args.file, "r", encoding="utf-8") as f:
        execution = json.load(f)
    val = validate_carousel_execution(execution)
    if val["isValid"]:
        print("✅ Carousel execution is valid and passed all quality gates.")
    else:
        print("❌ Carousel validation failed:")
        for err in val["errors"]:
            print(f"  • {err}")
        sys.exit(1)


def cmd_provenance_check(args):
    report = validate_content_claims(args.text)
    print(report.render_cli())
    if report.status == ValidationStatus.REVIEW_REQUIRED.value:
        sys.exit(1)


def cmd_serve(args):
    from server import run_server
    run_server(args.port)


def main():
    parser = argparse.ArgumentParser(description="LinkedIn AI Sales & Growth Copilot CLI")
    parser.add_argument("--dry-run", action="store_true", help="Simulate actions without real dispatch")
    subparsers = parser.add_subparsers(dest="command", help="Available subcommands")

    # daily-briefing
    subparsers.add_parser("daily-briefing", help="Generate morning AI briefing")

    # serve
    srv_parser = subparsers.add_parser("serve", help="Run HTTP API server")
    srv_parser.add_argument("--port", type=int, default=3000, help="Port to listen on (default: 3000)")

    # prospect
    p_parser = subparsers.add_parser("prospect", help="Prospect discovery and intelligence")
    p_subs = p_parser.add_subparsers(dest="subcommand")

    disc_p = p_subs.add_parser("discover", help="Discover prospects by ICP")
    disc_p.add_argument("--role", help="Target job title or role")
    disc_p.add_argument("--industry", help="Target industry")
    disc_p.add_argument("--offer", help="Core user service offering")
    disc_p.add_argument("--backend", default="demo", choices=["demo", "mock", "csv", "apify"], help="Discovery provider")
    disc_p.add_argument("--limit", type=int, default=5, help="Max prospects to discover")
    disc_p.add_argument("--dry-run", action="store_true", help="Dry run simulation")

    qual_p = p_subs.add_parser("qualify", help="Qualify prospect by ID")
    qual_p.add_argument("prospect_id", help="Prospect ID")

    res_p = p_subs.add_parser("research", help="Research prospect by ID")
    res_p.add_argument("prospect_id", help="Prospect ID")
    res_p.add_argument("--offering", help="User value proposition")

    # outreach
    o_parser = subparsers.add_parser("outreach", help="Outreach drafting and approval")
    o_subs = o_parser.add_subparsers(dest="subcommand")

    draft_p = o_subs.add_parser("draft", help="Draft outreach for prospect")
    draft_p.add_argument("prospect_id", help="Prospect ID")
    draft_p.add_argument("--mode", default="value_first", choices=["networking", "value_first", "conversation_starter", "problem_relevant", "direct_business"])
    draft_p.add_argument("--offering", help="User offering")

    o_subs.add_parser("review", help="Review pending approval cards")

    appr_p = o_subs.add_parser("resolve", help="Resolve an approval card")
    appr_p.add_argument("card_id", help="Card ID")
    appr_p.add_argument("--decision", required=True, choices=["approve", "reject", "edit"])
    appr_p.add_argument("--edit-text", help="New text if decision is edit")

    # inbox
    i_parser = subparsers.add_parser("inbox", help="AI inbox next actions")
    i_subs = i_parser.add_subparsers(dest="subcommand")
    i_subs.add_parser("review", help="Review next actions across all prospects")

    # crm
    c_parser = subparsers.add_parser("crm", help="CRM pipeline")
    c_subs = c_parser.add_subparsers(dest="subcommand")
    list_p = c_subs.add_parser("list", help="List CRM records")
    list_p.add_argument("--stage", help="Filter by pipeline stage")

    # content
    cnt_parser = subparsers.add_parser("content", help="Content calendar & planning")
    cnt_subs = cnt_parser.add_subparsers(dest="subcommand")
    plan_p = cnt_subs.add_parser("plan", help="Generate weekly content plan")
    plan_p.add_argument("--theme", help="Core editorial theme")

    c_art = cnt_subs.add_parser("article", help="Run article -> content pipeline")
    c_art.add_argument("--url", required=True, help="Public article URL")
    c_art.add_argument("--fallback-file", help="Path to fallback article JSON")

    c_idea = cnt_subs.add_parser("idea", help="Run idea -> content pipeline")
    c_idea.add_argument("--idea", required=True, help="Raw idea text")

    c_car = cnt_subs.add_parser("carousel", help="Validate carousel execution")
    c_car.add_argument("--file", required=True, help="Carousel execution JSON file")

    c_prov = cnt_subs.add_parser("check-claim", help="Validate text against provenance gate")
    c_prov.add_argument("--text", required=True, help="Content text to validate")

    # pipeline
    pipe_parser = subparsers.add_parser("pipeline", help="Content pipelines")
    pipe_subs = pipe_parser.add_subparsers(dest="subcommand")
    p_art = pipe_subs.add_parser("article", help="Run article -> content pipeline")
    p_art.add_argument("--url", required=True, help="Public article URL")
    p_art.add_argument("--fallback-file", help="Path to fallback article JSON")

    p_idea = pipe_subs.add_parser("idea", help="Run idea -> content pipeline")
    p_idea.add_argument("--idea", required=True, help="Raw idea text")

    # persona
    pers_parser = subparsers.add_parser("persona", help="Persona management")
    pers_subs = pers_parser.add_subparsers(dest="subcommand")
    sw_p = pers_subs.add_parser("switch", help="Switch active persona")
    sw_p.add_argument("persona", choices=["TECH_CREATOR", "D2C_FOUNDER", "tech_creator", "d2c_founder"])
    sw_p.add_argument("--workspace-id", default="default")

    # bridge
    br_parser = subparsers.add_parser("bridge", help="Content <-> Sales Bridges")
    br_subs = br_parser.add_subparsers(dest="subcommand")

    b_s2c = br_subs.add_parser("sales-to-content", help="Convert sales objection to content")
    b_s2c.add_argument("--objection", required=True, help="Sales objection text")
    b_s2c.add_argument("--prospect", help="Prospect name")
    b_s2c.add_argument("--company", help="Company name")

    b_c2s = br_subs.add_parser("content-to-sales", help="Match content topic to target prospects")
    b_c2s.add_argument("--topic", required=True, help="Content topic")

    # analytics
    a_parser = subparsers.add_parser("analytics", help="Growth analytics")
    a_subs = a_parser.add_subparsers(dest="subcommand")
    a_subs.add_parser("daily", help="View daily analytics snapshot")

    args = parser.parse_args()

    if args.command == "daily-briefing":
        cmd_briefing(args)
    elif args.command == "serve":
        cmd_serve(args)
    elif args.command == "prospect":
        if args.subcommand == "discover":
            cmd_prospect_discover(args)
        elif args.subcommand == "qualify":
            cmd_prospect_qualify(args)
        elif args.subcommand == "research":
            cmd_prospect_research(args)
        else:
            p_parser.print_help()
    elif args.command == "outreach":
        if args.subcommand == "draft":
            cmd_outreach_draft(args)
        elif args.subcommand == "review":
            cmd_outreach_review(args)
        elif args.subcommand == "resolve":
            cmd_outreach_approve(args)
        else:
            o_parser.print_help()
    elif args.command == "inbox":
        cmd_inbox_review(args)
    elif args.command == "crm":
        cmd_crm_list(args)
    elif args.command == "content":
        if args.subcommand == "plan":
            cmd_content_plan(args)
        elif args.subcommand == "article":
            cmd_pipeline_article(args)
        elif args.subcommand == "idea":
            cmd_pipeline_idea(args)
        elif args.subcommand == "carousel":
            cmd_carousel_validate(args)
        elif args.subcommand == "check-claim":
            cmd_provenance_check(args)
        else:
            cnt_parser.print_help()
    elif args.command == "pipeline":
        if args.subcommand == "article":
            cmd_pipeline_article(args)
        elif args.subcommand == "idea":
            cmd_pipeline_idea(args)
        else:
            pipe_parser.print_help()
    elif args.command == "persona":
        if args.subcommand == "switch":
            cmd_persona_switch(args)
        else:
            pers_parser.print_help()
    elif args.command == "bridge":
        if args.subcommand == "sales-to-content":
            cmd_bridge_sales_to_content(args)
        elif args.subcommand == "content-to-sales":
            cmd_bridge_content_to_sales(args)
        else:
            br_parser.print_help()
    elif args.command == "analytics":
        cmd_analytics(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
