"""Sales API Adapter for TypeScript/Node.js Web Application Integration.

Bridges the TypeScript Express backend with the Python Sales Copilot:
- Prospect Discovery & Deduplication
- Qualification & Research
- Outreach Drafting & Approval Gate
- Next Action Engine & AI Inbox
- CRM Pipeline & Stage Tracking
- Executive Briefing & Dashboard Aggregation
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# Ensure parent directory is in sys.path
CURRENT_DIR = Path(__file__).resolve().parent
ROOT = CURRENT_DIR.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.analytics.analytics_engine import AnalyticsEngine
from lib.approval import ActionKind, ApprovalCard, ApprovalManager, ApprovalStatus
from lib.crm.pipeline import CRMPipeline, PipelineStage, CRMRecord
from lib.intelligence.prospect_qualifier import ProspectQualifier
from lib.intelligence.prospect_researcher import ProspectResearcher
from lib.intelligence.response_classifier import ResponseClassifier
from lib.outreach.drafter import OutreachDrafter, OutreachMode
from lib.research.icp import ICP
from lib.research.prospect import Prospect, generate_prospect_id
from lib.storage.store import StorageBackend, get_storage
from lib.workflow.next_action import NextActionEngine
from lib.workflow_engine import WorkflowEngine, WorkflowState


def get_store(payload: Optional[Dict[str, Any]] = None) -> StorageBackend:
    base_dir = None
    if payload and payload.get("data_dir"):
        base_dir = payload["data_dir"]
    elif os.getenv("COPILOT_DATA_DIR"):
        base_dir = os.getenv("COPILOT_DATA_DIR")
    return get_storage(base_dir=base_dir)


def get_engine(dry_run: bool = False, payload: Optional[Dict[str, Any]] = None) -> WorkflowEngine:
    return WorkflowEngine(store=get_store(payload), dry_run=dry_run)


def cmd_dashboard(payload: Dict[str, Any]) -> Dict[str, Any]:
    engine = get_engine(payload=payload)
    prospects = engine.list_prospects()
    approval = ApprovalManager(store=engine.store)
    pending_cards = approval.list_pending()
    crm = CRMPipeline(store=engine.store)
    crm_records = crm.list_by_stage()

    stage_counts: Dict[str, int] = {}
    total_pipeline_val = 0.0
    for r in crm_records:
        stage_counts[r.stage] = stage_counts.get(r.stage, 0) + 1
        if r.opportunity_value:
            total_pipeline_val += r.opportunity_value

    inbox = NextActionEngine()
    priority_actions = []
    vp = payload.get("voiceProfile") or {}
    for p in prospects[:10]:
        action = inbox.evaluate_prospect(p, voice_profile=vp)
        if action.urgency in ("HIGH", "CRITICAL") or action.approval_required:
            priority_actions.append(action.to_dict())

    # Get recent activity
    events = engine.store.list_items("workflow_events")
    events_sorted = sorted(events, key=lambda e: e.get("timestamp", ""), reverse=True)[:10]

    is_demo = os.getenv("COPILOT_DEMO_MODE", "false").lower() == "true" or payload.get("isDemoMode", False)
    if hasattr(engine.store, "base_path"):
        mode_file = engine.store.base_path / "workspace_mode.json"
        if mode_file.is_file():
            try:
                m_data = json.loads(mode_file.read_text(encoding="utf-8"))
                if m_data.get("isDemoMode"):
                    is_demo = True
            except Exception:
                pass

    return {
        "is_demo_mode": is_demo,
        "total_prospects": len(prospects),
        "pending_approvals_count": len(pending_cards),
        "active_pipeline_count": len([r for r in crm_records if r.stage not in ("WON", "LOST", "STOPPED")]),
        "won_count": len([r for r in crm_records if r.stage == "WON"]),
        "pipeline_value": total_pipeline_val,
        "stage_counts": stage_counts,
        "recent_prospects": [p.to_dict() for p in sorted(prospects, key=lambda x: x.updated_at, reverse=True)[:5]],
        "pending_cards": [c.to_dict() for c in pending_cards[:5]],
        "priority_actions": priority_actions[:5],
        "recent_events": events_sorted,
    }


def cmd_daily_briefing(payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        from scripts.daily_briefing import generate_daily_briefing
        briefing = generate_daily_briefing()
    except Exception as e:
        briefing = f"Executive Daily Briefing:\n\nPipeline running smoothly. {e}"
    return {"briefing": briefing}


def cmd_list_prospects(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    engine = get_engine(payload=payload)
    prospects = engine.list_prospects()
    return [p.to_dict() for p in sorted(prospects, key=lambda x: x.updated_at, reverse=True)]


def cmd_discover_prospects(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    engine = get_engine(dry_run=payload.get("dry_run", False), payload=payload)
    roles = payload.get("roles") or []
    industries = payload.get("industries") or []
    offer = payload.get("offer") or ""
    # Default to manual (real empty state) unless demo mode is explicitly active
    is_demo = os.getenv("COPILOT_DEMO_MODE", "false").lower() == "true" or payload.get("isDemoMode", False)
    default_backend = "demo" if is_demo else "manual"
    backend = payload.get("backend") or default_backend
    if not is_demo and backend in ("demo", "mock"):
        backend = "manual"
    limit = int(payload.get("limit", 5))

    icp = ICP(roles=roles, industries=industries, offer=offer)
    prospects = engine.run_discovery_pipeline(icp=icp, backend=backend, limit=limit)
    if prospects == "DISCOVERY_UNAVAILABLE" or getattr(prospects, "status", None) == "DISCOVERY_UNAVAILABLE":
        return {"status": "DISCOVERY_UNAVAILABLE", "error": "Apify credentials missing (APIFY_TOKEN / APIFY_API_TOKEN not set).", "prospects": []}
    return [p.to_dict() for p in prospects]


def cmd_qualify_prospect(payload: Dict[str, Any]) -> Dict[str, Any]:
    engine = get_engine(payload=payload)
    prospect_id = payload["prospect_id"]
    p = engine.get_prospect(prospect_id)
    if not p:
        raise ValueError(f"Prospect '{prospect_id}' not found.")

    qualifier = ProspectQualifier()
    res = qualifier.qualify(p)
    p.qualification.score = res.overall_fit_score
    p.qualification.reason = "; ".join(res.reasons) if res.reasons else "Qualified lead"
    engine.save_prospect(p)
    return res.to_dict()


def cmd_research_prospect(payload: Dict[str, Any]) -> Dict[str, Any]:
    engine = get_engine(payload=payload)
    prospect_id = payload["prospect_id"]
    voice_profile = payload.get("voiceProfile") or {}
    offering = payload.get("offering") or voice_profile.get("offering") or (voice_profile.get("contentPillars") and voice_profile.get("contentPillars")[0]) or voice_profile.get("role") or ""
    p = engine.get_prospect(prospect_id)
    if not p:
        raise ValueError(f"Prospect '{prospect_id}' not found.")

    researcher = ProspectResearcher()
    res = researcher.research(p, user_offering=offering)
    p.research.summary = res.profile_summary
    p.research.relevant_topics = res.relevant_signals
    p.research.personalization_points = res.personalization_points
    engine.save_prospect(p)
    return res.to_dict()


def cmd_draft_outreach(payload: Dict[str, Any]) -> Dict[str, Any]:
    engine = get_engine(payload=payload)
    prospect_id = payload["prospect_id"]
    mode_str = payload.get("mode", "value_first").upper()
    voice_profile = payload.get("voiceProfile") or {}
    user_name = payload.get("user_name") or voice_profile.get("authorName") or voice_profile.get("userName") or ""
    user_role = payload.get("user_role") or voice_profile.get("role") or ""
    offering = payload.get("offering") or (voice_profile.get("contentPillars") and voice_profile.get("contentPillars")[0]) or voice_profile.get("role") or ""
    resource_link = payload.get("resource_link") or voice_profile.get("primaryLink") or ""
    p = engine.get_prospect(prospect_id)
    if not p:
        raise ValueError(f"Prospect '{prospect_id}' not found.")

    try:
        mode = OutreachMode(mode_str)
    except Exception:
        mode = OutreachMode.VALUE_FIRST

    drafter = OutreachDrafter()
    draft = drafter.draft(
        p,
        mode=mode,
        user_name=user_name,
        user_role=user_role,
        offering=offering,
        resource_link=resource_link
    )
    return draft.to_dict()


def cmd_list_pending_approvals(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    approval = ApprovalManager(store=get_store(payload))
    cards = approval.list_pending()
    return [c.to_dict() for c in cards]


def cmd_approve_outreach(payload: Dict[str, Any]) -> Dict[str, Any]:
    approval = ApprovalManager(store=get_store(payload))
    card_id = payload["card_id"]
    edited_text = payload.get("edited_text")
    card = approval.resolve_card(card_id, "approved", edited_text=edited_text)
    if not card:
        raise ValueError(f"Approval card '{card_id}' not found.")
    return card.to_dict()


def cmd_reject_outreach(payload: Dict[str, Any]) -> Dict[str, Any]:
    approval = ApprovalManager(store=get_store(payload))
    card_id = payload["card_id"]
    card = approval.resolve_card(card_id, "rejected")
    if not card:
        raise ValueError(f"Approval card '{card_id}' not found.")
    return card.to_dict()


def cmd_execute_outreach(payload: Dict[str, Any]) -> Dict[str, Any]:
    prospect_id = payload["prospect_id"]
    card_id = payload.get("card_id")
    dry_run = payload.get("dry_run", False)

    engine = get_engine(dry_run=dry_run, payload=payload)
    result = engine.execute_approved_action(prospect_id, card_id=card_id)
    return result.to_dict()


def cmd_inbox_list(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    engine = get_engine(payload=payload)
    inbox = NextActionEngine()
    prospects = engine.list_prospects()
    vp = payload.get("voiceProfile") or {}
    actions = [inbox.evaluate_prospect(p, voice_profile=vp).to_dict() for p in prospects]
    return actions


def cmd_inbox_classify(payload: Dict[str, Any]) -> Dict[str, Any]:
    text = payload.get("text", "")
    classifier = ResponseClassifier()
    res = classifier.classify(text)
    return res.to_dict()


def cmd_inbox_next_action(payload: Dict[str, Any]) -> Dict[str, Any]:
    engine = get_engine(payload=payload)
    prospect_id = payload["prospect_id"]
    p = engine.get_prospect(prospect_id)
    if not p:
        raise ValueError(f"Prospect '{prospect_id}' not found.")
    inbox = NextActionEngine()
    vp = payload.get("voiceProfile") or {}
    action = inbox.evaluate_prospect(p, voice_profile=vp)
    return action.to_dict()


def cmd_crm_list(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    crm = CRMPipeline(store=get_store(payload))
    raw_stage = payload.get("stage")
    stage: Optional[str] = None
    if raw_stage and isinstance(raw_stage, str):
        cleaned = raw_stage.strip()
        if cleaned and cleaned.upper() != "ALL":
            stage = cleaned
    records = crm.list_by_stage(stage=stage)
    return [r.to_dict() for r in records]


def cmd_crm_get(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    crm = CRMPipeline(store=get_store(payload))
    prospect_id = payload["prospect_id"]
    record = crm.get_record(prospect_id)
    return record.to_dict() if record else None


def cmd_crm_stage(payload: Dict[str, Any]) -> Dict[str, Any]:
    crm = CRMPipeline(store=get_store(payload))
    prospect_id = payload["prospect_id"]
    stage = payload["stage"]
    reason = payload.get("reason", "Stage updated via web CRM interface")
    record = crm.transition_stage(prospect_id, stage, reason=reason)

    engine = get_engine(payload=payload)
    p = engine.get_prospect(prospect_id)
    if p:
        p.pipeline.stage = stage
        engine.save_prospect(p)

    return {"success": True, "record": record.to_dict() if record else None}


def cmd_crm_note(payload: Dict[str, Any]) -> Dict[str, Any]:
    crm = CRMPipeline(store=get_store(payload))
    prospect_id = payload["prospect_id"]
    note = payload["note"]
    crm.add_note(prospect_id, note)
    return {"success": True, "prospect_id": prospect_id, "note": note}


def cmd_reset_workspace(payload: Dict[str, Any]) -> Dict[str, Any]:
    store = get_store(payload)
    cleared = {}
    for col in ("prospects", "crm_records", "approval_cards", "workflow_events", "content_calendar", "published_posts"):
        if hasattr(store, "clear_collection"):
            cleared[col] = store.clear_collection(col)
    if hasattr(store, "base_path"):
        mode_file = store.base_path / "workspace_mode.json"
        if mode_file.is_file():
            try:
                mode_file.unlink()
            except Exception:
                pass
    return {"status": "ok", "cleared": cleared, "message": "Workspace data cleared successfully."}


def cmd_load_sample_workspace(payload: Dict[str, Any]) -> Dict[str, Any]:
    import shutil
    from pathlib import Path
    fixtures = Path(__file__).resolve().parents[1] / "fixtures" / "sample_workspace"
    store = get_store(payload)
    copied = 0
    if hasattr(store, "base_path") and fixtures.is_dir():
        for sub in ("prospects", "crm_records", "approval_cards", "workflow_events", "content_calendar"):
            src = fixtures / sub
            dst = store.base_path / sub
            if src.is_dir():
                dst.mkdir(parents=True, exist_ok=True)
                for f in src.glob("*.json"):
                    shutil.copy2(f, dst / f.name)
                    copied += 1
        try:
            mode_file = store.base_path / "workspace_mode.json"
            mode_file.write_text(json.dumps({"isDemoMode": True, "demoLoadedAt": datetime.now(timezone.utc).isoformat()}))
        except Exception:
            pass
    return {"status": "ok", "copied": copied, "message": "Sample workspace loaded successfully."}


def cmd_workspace_status(payload=None):
    store = get_store(payload if isinstance(payload, dict) else None)
    if hasattr(store, "base_path"):
        mode_file = store.base_path / "workspace_mode.json"
        if mode_file.exists():
            try:
                data = json.loads(mode_file.read_text())
                return {"isDemoMode": bool(data.get("isDemoMode", False))}
            except Exception:
                pass
    return {"isDemoMode": False}


def cmd_save_prospect(payload: Dict[str, Any]) -> Dict[str, Any]:
    engine = get_engine(payload=payload)
    ws_id = payload.get("workspace_id") or "default"
    owner = payload.get("owner") or "Founder"
    p_id = payload.get("id") or generate_prospect_id(payload.get("linkedin_url", ""), payload.get("name", ""), payload.get("company", ""))

    prospect = Prospect(
        name=payload["name"],
        id=p_id,
        linkedin_url=payload.get("linkedin_url", ""),
        headline=payload.get("headline", ""),
        job_title=payload.get("job_title", ""),
        company=payload.get("company", ""),
        industry=payload.get("industry", ""),
        location=payload.get("location", ""),
        source=payload.get("source", "manual")
    )
    if "stage" in payload:
        prospect.pipeline.stage = payload["stage"]
    if "research" in payload and isinstance(payload["research"], dict):
        for k, v in payload["research"].items():
            if hasattr(prospect.research, k):
                setattr(prospect.research, k, v)

    data = prospect.to_dict()
    data["workspace_id"] = ws_id
    data["owner"] = owner
    engine.store.save_item("prospects", prospect.id, data)
    return {"status": "ok", "prospect": data}


def cmd_save_crm(payload: Dict[str, Any]) -> Dict[str, Any]:
    store = get_store(payload)
    ws_id = payload.get("workspace_id") or "default"
    owner = payload.get("owner") or "Founder"
    prospect_id = payload["prospect_id"]
    record = CRMRecord(
        prospect_id=prospect_id,
        name=payload.get("name", "Prospect"),
        company=payload.get("company", ""),
        stage=payload.get("stage", PipelineStage.DISCOVERED.value),
        owner=owner,
        opportunity_value=float(payload.get("opportunity_value", 0.0))
    )
    data = record.to_dict()
    data["workspace_id"] = ws_id
    store.save_item("crm_records", prospect_id, data)
    return {"status": "ok", "record": data}


def cmd_create_approval(payload: Dict[str, Any]) -> Dict[str, Any]:
    store = get_store(payload)
    ws_id = payload.get("workspace_id") or "default"
    owner = payload.get("owner") or "Founder"
    card_id = payload.get("id") or f"appr_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_{os.urandom(3).hex()}"
    card = ApprovalCard(
        id=card_id,
        kind=payload.get("kind", ActionKind.FIRST_MESSAGE.value),
        target=payload.get("target", "Target"),
        why=payload.get("why", "Direct outreach"),
        draft=payload.get("draft", ""),
        source_context=payload.get("source_context", "Outreach context"),
        risk_notes=payload.get("risk_notes", "Review tone before sending")
    )
    data = card.to_dict()
    data["workspace_id"] = ws_id
    data["owner"] = owner
    store.save_item("approval_cards", card.id, data)
    return {"status": "ok", "card": data}


def cmd_save_draft(payload: Dict[str, Any]) -> Dict[str, Any]:
    store = get_store(payload)
    ws_id = payload.get("workspace_id") or "default"
    owner = payload.get("owner") or "Founder"
    draft_id = payload.get("id") or f"draft_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_{os.urandom(3).hex()}"
    draft_data = {
        "id": draft_id,
        "title": payload.get("title", "Content Draft"),
        "topic": payload.get("topic", ""),
        "content": payload.get("content", ""),
        "pillar": payload.get("pillar", ""),
        "status": payload.get("status", "draft"),
        "workspace_id": ws_id,
        "owner": owner,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    store.save_item("content_calendar", draft_id, draft_data)
    return {"status": "ok", "draft": draft_data}


def cmd_list_drafts(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    store = get_store(payload)
    return store.list_items("content_calendar")


def cmd_analytics(payload: Dict[str, Any]) -> Dict[str, Any]:
    engine = get_engine(payload=payload)
    analytics = AnalyticsEngine(store=engine.store, pipeline=CRMPipeline(store=engine.store))
    return analytics.generate_snapshot().to_dict()


HANDLERS = {
    "dashboard": cmd_dashboard,
    "daily-briefing": cmd_daily_briefing,
    "list-prospects": cmd_list_prospects,
    "discover-prospects": cmd_discover_prospects,
    "qualify-prospect": cmd_qualify_prospect,
    "research-prospect": cmd_research_prospect,
    "draft-outreach": cmd_draft_outreach,
    "list-pending": cmd_list_pending_approvals,
    "approve-outreach": cmd_approve_outreach,
    "reject-outreach": cmd_reject_outreach,
    "execute-outreach": cmd_execute_outreach,
    "inbox-list": cmd_inbox_list,
    "inbox-classify": cmd_inbox_classify,
    "inbox-next-action": cmd_inbox_next_action,
    "crm-list": cmd_crm_list,
    "crm-get": cmd_crm_get,
    "crm-stage": cmd_crm_stage,
    "crm-note": cmd_crm_note,
    "reset-workspace": cmd_reset_workspace,
    "load-sample-workspace": cmd_load_sample_workspace,
    "workspace-status": cmd_workspace_status,
    "save-prospect": cmd_save_prospect,
    "save-crm": cmd_save_crm,
    "create-approval": cmd_create_approval,
    "save-draft": cmd_save_draft,
    "list-drafts": cmd_list_drafts,
    "analytics": cmd_analytics,
}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No command specified", "available": list(HANDLERS.keys())}))
        sys.exit(1)

    command = sys.argv[1]
    payload = {}
    if len(sys.argv) > 2 and sys.argv[2].strip():
        try:
            payload = json.loads(sys.argv[2])
        except Exception as e:
            print(json.dumps({"error": f"Invalid JSON payload: {e}"}))
            sys.exit(1)
    elif command in ("dashboard", "daily-briefing", "list-prospects", "list-pending", "inbox-list", "crm-list"):
        payload = {}
    elif not sys.stdin.isatty():
        try:
            import select
            if select.select([sys.stdin], [], [], 0.1)[0]:
                stdin_content = sys.stdin.read().strip()
                if stdin_content:
                    payload = json.loads(stdin_content)
        except Exception as e:
            pass

    handler = HANDLERS.get(command)
    if not handler:
        print(json.dumps({"error": f"Unknown command: '{command}'", "available": list(HANDLERS.keys())}))
        sys.exit(1)

    try:
        result = handler(payload)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e), "type": type(e).__name__}))
        sys.exit(1)


if __name__ == "__main__":
    main()
