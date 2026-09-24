import React, { useState } from 'react';
import { 
  X, 
  ExternalLink, 
  CheckCircle, 
  Search, 
  Send, 
  Check, 
  Edit3, 
  Sparkles, 
  ShieldCheck, 
  AlertCircle,
  Clock,
  Briefcase,
  MapPin,
  TrendingUp,
  MessageSquare
} from 'lucide-react';
import { api } from '../../services/api';

export interface LeadDetailModalProps {
  lead: any | null;
  isOpen: boolean;
  onClose: () => void;
  onLeadUpdated?: () => void;
  onActionMessage?: (msg: { kind: 'success' | 'error'; text: string }) => void;
}

export const getFriendlyStageLabel = (stage?: string): string => {
  if (!stage) return 'Ready to review';
  const upper = stage.toUpperCase();
  switch (upper) {
    case 'DISCOVERED':
    case 'READY_FOR_REVIEW':
      return 'Ready to review';
    case 'QUALIFIED':
    case 'APPROVED':
    case 'QUEUED_FOR_OUTREACH':
      return 'Ready to contact';
    case 'CONTACTED':
    case 'OUTREACH_SENT':
      return 'Contacted';
    case 'REPLIED':
    case 'ENGAGED':
      return 'Replied';
    case 'CALL_SCHEDULED':
    case 'MEETING_SCHEDULED':
    case 'OPPORTUNITY':
      return 'Meeting';
    case 'WON':
      return 'Won';
    case 'LOST':
    case 'STOPPED':
      return 'Stopped';
    default:
      return stage.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
};

export const LeadDetailModal: React.FC<LeadDetailModalProps> = ({
  lead,
  isOpen,
  onClose,
  onLeadUpdated,
  onActionMessage
}) => {
  const [activeSection, setActiveSection] = useState<'fit' | 'research' | 'outreach'>('fit');
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState(false);
  const [messageDraft, setMessageDraft] = useState('');
  const [connectionNoteDraft, setConnectionNoteDraft] = useState('');
  const [activeDraftTab, setActiveDraftTab] = useState<'connection' | 'message'>('connection');

  if (!isOpen || !lead) return null;

  const fitScore = lead.qualification?.score || 0;
  const friendlyStage = getFriendlyStageLabel(lead.pipeline?.stage);

  // Initialize draft states if available
  const existingFirstMessage = lead.outreach?.first_message || lead.outreach?.connection_note || '';

  const handleRunQualify = async () => {
    setLoadingAction('qualify');
    try {
      const res = await api.qualifyProspect(lead.id);
      onActionMessage?.({
        kind: 'success',
        text: `Lead qualification complete: ${res.overall_fit_score}/100 fit score.`
      });
      onLeadUpdated?.();
    } catch (err: any) {
      onActionMessage?.({ kind: 'error', text: err.message });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRunResearch = async () => {
    setLoadingAction('research');
    try {
      await api.researchProspect(lead.id);
      onActionMessage?.({
        kind: 'success',
        text: 'AI research completed with personalized signals and conversation angles.'
      });
      onLeadUpdated?.();
    } catch (err: any) {
      onActionMessage?.({ kind: 'error', text: err.message });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDraftOutreach = async (mode: string = 'value_first') => {
    setLoadingAction('draft');
    try {
      const result = await api.draftOutreach({ prospect_id: lead.id, mode });
      onActionMessage?.({
        kind: 'success',
        text: 'Personalized outreach draft created and queued for human approval.'
      });
      if (result?.card?.draft) {
        setMessageDraft(result.card.draft);
      }
      onLeadUpdated?.();
    } catch (err: any) {
      onActionMessage?.({ kind: 'error', text: err.message });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleApproveAndQueue = async () => {
    setLoadingAction('approve');
    try {
      // First ensure draft exists
      if (!lead.outreach?.first_message && !messageDraft) {
        await api.draftOutreach({ prospect_id: lead.id });
      }
      const pending = await api.listPendingApprovals();
      const targetCard = pending.find(c => c.prospect_id === lead.id || c.target?.includes(lead.name));
      if (targetCard) {
        await api.approveOutreach(targetCard.id, messageDraft || undefined);
        onActionMessage?.({
          kind: 'success',
          text: `Outreach approved for ${lead.name}. Stage updated.`
        });
      } else {
        onActionMessage?.({
          kind: 'success',
          text: `Outreach ready for ${lead.name}.`
        });
      }
      onLeadUpdated?.();
      onClose();
    } catch (err: any) {
      onActionMessage?.({ kind: 'error', text: err.message });
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-150">
      <div 
        id="lead-detail-modal"
        className="w-full max-w-4xl bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-800 bg-slate-900/90 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xl shadow-md shadow-blue-500/10">
              {lead.name ? lead.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('') : 'L'}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-xl font-bold text-white tracking-tight">{lead.name}</h2>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-950 text-blue-300 border border-blue-800">
                  {friendlyStage}
                </span>
                {fitScore > 0 && (
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    fitScore >= 75
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      : fitScore >= 50
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : 'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}>
                    {fitScore}% Fit
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-300 mt-1 font-medium">
                {lead.job_title} at <span className="text-blue-400 font-semibold">{lead.company}</span>
              </p>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mt-2">
                {lead.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {lead.location}
                  </span>
                )}
                {lead.industry && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                    {lead.industry}
                  </span>
                )}
                {lead.company_size && (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                    {lead.company_size} employees
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {lead.linkedin_url && (
              <a
                href={lead.linkedin_url}
                target="_blank"
                rel="noreferrer"
                id="lead-linkedin-link"
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>LinkedIn</span>
              </a>
            )}
            <button
              onClick={onClose}
              id="close-lead-modal-btn"
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Section Navigation */}
        <div className="flex border-b border-slate-800 px-6 bg-slate-900/50 gap-6">
          <button
            onClick={() => setActiveSection('fit')}
            className={`py-3 text-xs font-semibold border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeSection === 'fit'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            <span>Why They Fit</span>
          </button>
          <button
            onClick={() => setActiveSection('research')}
            className={`py-3 text-xs font-semibold border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeSection === 'research'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>AI Research & Signals</span>
          </button>
          <button
            onClick={() => setActiveSection('outreach')}
            className={`py-3 text-xs font-semibold border-b-2 transition flex items-center gap-2 cursor-pointer ${
              activeSection === 'outreach'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>Outreach Drafts</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* SECTION 1: WHY THEY FIT */}
          {activeSection === 'fit' && (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Customer Profile Alignment
                  </div>
                  <div className="text-2xl font-bold text-white mt-1">
                    {fitScore > 0 ? `${fitScore} / 100 Match` : 'Awaiting qualification'}
                  </div>
                  <p className="text-xs text-slate-300 mt-1 max-w-xl">
                    {lead.qualification?.reason || 'Click "Check Fit" below to evaluate this prospect against your ideal customer criteria.'}
                  </p>
                </div>
                <button
                  onClick={handleRunQualify}
                  disabled={loadingAction === 'qualify'}
                  id="btn-lead-check-fit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition shadow-md shadow-blue-500/20 disabled:opacity-50 shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{loadingAction === 'qualify' ? 'Evaluating...' : 'Check Fit'}</span>
                </button>
              </div>

              {/* Match Criteria Highlights */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80">
                  <span className="text-xs text-slate-400 font-medium block">Target Role</span>
                  <div className="text-sm font-semibold text-white mt-1">{lead.job_title || 'N/A'}</div>
                  <span className="text-[11px] text-emerald-400 mt-1 block">Decision Maker Level</span>
                </div>
                <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80">
                  <span className="text-xs text-slate-400 font-medium block">Target Industry</span>
                  <div className="text-sm font-semibold text-white mt-1">{lead.industry || 'B2B Tech'}</div>
                  <span className="text-[11px] text-blue-400 mt-1 block">ICP Industry Match</span>
                </div>
                <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/80">
                  <span className="text-xs text-slate-400 font-medium block">Current Stage</span>
                  <div className="text-sm font-semibold text-white mt-1">{friendlyStage}</div>
                  <span className="text-[11px] text-slate-400 mt-1 block">Source: {lead.source || 'Discovery'}</span>
                </div>
              </div>

              {/* Next Best Step */}
              <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-900/60">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Recommended Next Step</span>
                </div>
                <p className="text-xs text-slate-200 mt-1.5 font-medium">
                  {lead.next_action || (fitScore >= 70 ? 'Proceed to review personalized connection request.' : 'Run research to surface personal conversation starters.')}
                </p>
              </div>
            </div>
          )}

          {/* SECTION 2: AI RESEARCH & SIGNALS */}
          {activeSection === 'research' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Prospect Intelligence & Background</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Synthesized from public activity and company signals.</p>
                </div>
                <button
                  onClick={handleRunResearch}
                  disabled={loadingAction === 'research'}
                  id="btn-lead-refresh-research"
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition cursor-pointer disabled:opacity-50"
                >
                  <Search className="w-3.5 h-3.5 text-blue-400" />
                  <span>{loadingAction === 'research' ? 'Analyzing...' : 'Deep Research'}</span>
                </button>
              </div>

              {/* Profile Summary */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Profile & Company Overview
                </span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {lead.research?.summary || lead.research?.profile_summary || 'No deep research generated yet. Click "Deep Research" to gather company background and key focus areas.'}
                </p>
              </div>

              {/* Signals and Topics */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                    Recent Signals & Activity
                  </span>
                  {lead.intent?.signals && lead.intent.signals.length > 0 ? (
                    <ul className="text-xs text-slate-300 space-y-1.5 list-disc pl-4">
                      {lead.intent.signals.map((sig: string, idx: number) => (
                        <li key={idx}>{sig}</li>
                      ))}
                    </ul>
                  ) : lead.research?.relevant_topics && lead.research.relevant_topics.length > 0 ? (
                    <ul className="text-xs text-slate-300 space-y-1.5 list-disc pl-4">
                      {lead.research.relevant_topics.map((top: string, idx: number) => (
                        <li key={idx}>{top}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-400">Public LinkedIn activities or post themes will appear here.</p>
                  )}
                </div>

                <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                    Personalization Hooks
                  </span>
                  {lead.research?.personalization_points && lead.research.personalization_points.length > 0 ? (
                    <ul className="text-xs text-slate-300 space-y-1.5 list-disc pl-4">
                      {lead.research.personalization_points.map((pt: string, idx: number) => (
                        <li key={idx}>{pt}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-400">Key conversation hooks tailored to {lead.name} will appear here.</p>
                  )}
                </div>
              </div>

              {/* Forbidden Topics / Guardrails */}
              <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-900/50 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-semibold text-amber-300 block">Outreach Guardrails</span>
                  <p className="text-xs text-amber-200/80 mt-0.5">
                    Never pitch price or products in first touch. Always lead with value, peer perspective, or a direct question about their shared topic.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: OUTREACH DRAFTS & APPROVAL */}
          {activeSection === 'outreach' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Outreach Messages</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Human-in-the-loop: zero messages are sent without your explicit review and approval.
                  </p>
                </div>
                <button
                  onClick={() => handleDraftOutreach('value_first')}
                  disabled={loadingAction === 'draft'}
                  id="btn-lead-draft-outreach"
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition shadow-md shadow-blue-500/20 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{loadingAction === 'draft' ? 'Drafting...' : 'Generate New Draft'}</span>
                </button>
              </div>

              {/* Subtabs for Connection Request vs Follow-up Message */}
              <div className="flex gap-2 border-b border-slate-800 pb-2">
                <button
                  onClick={() => setActiveDraftTab('connection')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${
                    activeDraftTab === 'connection'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Connection Note (max 300 char)
                </button>
                <button
                  onClick={() => setActiveDraftTab('message')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${
                    activeDraftTab === 'message'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Follow-up Direct Message
                </button>
              </div>

              {/* Draft Box */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {activeDraftTab === 'connection' ? 'Personalized Connection Note' : 'First Message Draft'}
                  </span>
                  <button
                    onClick={() => {
                      if (!editingMessage) {
                        setMessageDraft(messageDraft || existingFirstMessage || `Hi ${lead.name.split(' ')[0]}, saw your recent work at ${lead.company}. Really enjoyed your perspectives on engineering execution. Would love to connect!`);
                      }
                      setEditingMessage(!editingMessage);
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{editingMessage ? 'Done editing' : 'Edit message'}</span>
                  </button>
                </div>

                {editingMessage ? (
                  <textarea
                    value={messageDraft}
                    onChange={(e) => setMessageDraft(e.target.value)}
                    rows={4}
                    className="w-full p-3 rounded-lg bg-slate-900 border border-blue-500 font-mono text-xs text-white focus:outline-none leading-relaxed"
                  />
                ) : (
                  <div className="p-3.5 rounded-lg bg-slate-900/60 border border-slate-800/80 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {messageDraft || existingFirstMessage || (
                      <span className="text-slate-500 font-sans italic">
                        No draft ready yet. Click "Generate New Draft" above to compose a personalized outreach note for {lead.name}.
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                  <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Strict Human Approval Gate
                  </span>
                  <span>{(messageDraft || existingFirstMessage).length} characters</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer transition"
          >
            Close
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleDraftOutreach('value_first')}
              disabled={loadingAction === 'draft'}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>Review Draft</span>
            </button>

            <button
              onClick={handleApproveAndQueue}
              disabled={loadingAction === 'approve'}
              id="btn-lead-approve-outreach"
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-emerald-500/20 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{loadingAction === 'approve' ? 'Approving...' : 'Approve & Queue Outreach'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
