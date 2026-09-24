import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  ChevronRight, 
  Plus, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  Sparkles, 
  DollarSign, 
  MessageSquare,
  ArrowRight
} from 'lucide-react';
import { api, CrmRecord } from '../../services/api';
import { LeadDetailModal } from '../Leads/LeadDetailModal';

interface PipelineColumn {
  id: string;
  label: string;
  color: string;
  stageKeys: string[];
}

const PIPELINE_COLUMNS: PipelineColumn[] = [
  { 
    id: 'NEW', 
    label: 'New', 
    color: 'border-slate-700',
    stageKeys: ['DISCOVERED', 'READY_FOR_REVIEW'] 
  },
  { 
    id: 'READY_TO_CONTACT', 
    label: 'Ready to contact', 
    color: 'border-blue-700',
    stageKeys: ['QUALIFIED', 'APPROVED', 'QUEUED_FOR_OUTREACH'] 
  },
  { 
    id: 'CONTACTED', 
    label: 'Contacted', 
    color: 'border-cyan-700',
    stageKeys: ['CONTACTED', 'OUTREACH_SENT'] 
  },
  { 
    id: 'REPLIED', 
    label: 'Replied', 
    color: 'border-purple-700',
    stageKeys: ['REPLIED', 'ENGAGED'] 
  },
  { 
    id: 'MEETING', 
    label: 'Meeting', 
    color: 'border-amber-700',
    stageKeys: ['MEETING_SCHEDULED', 'CALL_SCHEDULED', 'OPPORTUNITY'] 
  },
  { 
    id: 'WON', 
    label: 'Won', 
    color: 'border-emerald-600',
    stageKeys: ['WON'] 
  }
];

export const PipelineWorkspaceView: React.FC = () => {
  const [crmRecords, setCrmRecords] = useState<CrmRecord[]>([]);
  const [prospects, setProspects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [crm, pros] = await Promise.all([
        api.listCrmPipeline().catch(() => []),
        api.listProspects().catch(() => [])
      ]);
      setCrmRecords(crm);
      setProspects(pros);
    } catch (err: any) {
      console.warn('Failed to load CRM pipeline data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAdvanceStage = async (prospectId: string, currentColumnId: string) => {
    const nextMapping: Record<string, string> = {
      NEW: 'QUALIFIED',
      READY_TO_CONTACT: 'CONTACTED',
      CONTACTED: 'REPLIED',
      REPLIED: 'MEETING_SCHEDULED',
      MEETING: 'WON',
      WON: 'WON'
    };

    const targetStage = nextMapping[currentColumnId] || 'WON';
    try {
      await api.updateCrmStage(prospectId, targetStage);
      setBannerMessage({ kind: 'success', text: `Lead stage advanced to ${targetStage.replace(/_/g, ' ')}.` });
      await loadData();
    } catch (err: any) {
      setBannerMessage({ kind: 'error', text: err.message });
    }
  };

  const handleAddNote = async (prospectId: string) => {
    if (!newNote.trim()) return;
    try {
      await api.addCrmNote(prospectId, newNote);
      setNewNote('');
      setBannerMessage({ kind: 'success', text: 'CRM activity note logged successfully.' });
      await loadData();
    } catch (err: any) {
      setBannerMessage({ kind: 'error', text: err.message });
    }
  };

  const handleCardClick = (rec: CrmRecord) => {
    const match = prospects.find(p => p.id === rec.prospect_id || p.name === rec.name);
    if (match) {
      setSelectedLead(match);
    } else {
      setSelectedLead({
        id: rec.prospect_id,
        name: rec.name,
        company: rec.company,
        job_title: 'Executive',
        pipeline: { stage: rec.stage },
        qualification: { score: 85 }
      });
    }
    setIsDetailOpen(true);
  };

  // Calculate totals
  const totalPipelineValue = crmRecords.reduce((acc, r) => acc + (r.opportunity_value || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Sales Pipeline</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Visual stage progression, deal values, and customer conversation tracking.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {totalPipelineValue > 0 && (
            <div className="px-3.5 py-1.5 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs font-semibold flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" />
              <span>Pipeline: ${totalPipelineValue.toLocaleString()}</span>
            </div>
          )}
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer"
            title="Refresh pipeline"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Global alert banner */}
      {bannerMessage && (
        <div
          id="pipeline-alert-banner"
          className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between ${
            bannerMessage.kind === 'success'
              ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-200'
              : 'bg-red-950/60 border-red-800/80 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{bannerMessage.text}</span>
          </div>
          <button onClick={() => setBannerMessage(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Pipeline Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 overflow-x-auto pb-4">
        {PIPELINE_COLUMNS.map(col => {
          const recordsInStage = crmRecords.filter(r => 
            col.stageKeys.includes(r.stage?.toUpperCase() || '') ||
            (col.id === 'NEW' && (!r.stage || r.stage.toUpperCase() === 'NEW'))
          );

          return (
            <div
              key={col.id}
              className="min-w-[210px] p-3 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col gap-2.5"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-bold text-slate-200">{col.label}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold">
                  {recordsInStage.length}
                </span>
              </div>

              {/* Cards in column */}
              <div className="space-y-2.5 flex-1 min-h-[320px]">
                {recordsInStage.length === 0 ? (
                  <div className="h-28 rounded-xl border border-dashed border-slate-800/80 flex items-center justify-center text-slate-600 text-[11px]">
                    No leads in {col.label.toLowerCase()}
                  </div>
                ) : (
                  recordsInStage.map(rec => (
                    <div
                      key={rec.prospect_id}
                      onClick={() => handleCardClick(rec)}
                      className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/90 hover:border-slate-700 transition cursor-pointer space-y-2 group"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div>
                          <div className="font-bold text-xs text-white group-hover:text-blue-400 transition truncate max-w-[140px]">
                            {rec.name}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[140px] mt-0.5">
                            {rec.company}
                          </div>
                        </div>
                        {rec.opportunity_value > 0 && (
                          <span className="text-[11px] font-bold text-emerald-400 shrink-0">
                            ${rec.opportunity_value.toLocaleString()}
                          </span>
                        )}
                      </div>

                      {/* Advance Stage button */}
                      {col.id !== 'WON' && (
                        <div
                          className="pt-2 border-t border-slate-900 flex items-center justify-between"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleAdvanceStage(rec.prospect_id, col.id)}
                            className="text-[10px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 cursor-pointer transition"
                          >
                            <span>Advance</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Log Activity Note */}
      <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <h3 className="font-bold text-white text-xs uppercase tracking-wider">Log CRM Activity Note</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Log call note, objection details, meeting outcome, or next steps..."
            className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => {
              if (crmRecords.length > 0) {
                handleAddNote(crmRecords[0].prospect_id);
              }
            }}
            disabled={!newNote.trim() || crmRecords.length === 0}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 shrink-0 shadow-md shadow-blue-500/20"
          >
            Save Note
          </button>
        </div>
      </div>

      {/* Shared Lead Detail Modal */}
      <LeadDetailModal
        lead={selectedLead}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedLead(null);
        }}
        onLeadUpdated={loadData}
        onActionMessage={setBannerMessage}
      />
    </div>
  );
};
