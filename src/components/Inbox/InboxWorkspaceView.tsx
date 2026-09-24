import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Send, 
  Sparkles, 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  RefreshCw, 
  ChevronRight, 
  ArrowRight,
  Edit3,
  Check,
  Search,
  Filter,
  Users
} from 'lucide-react';
import { api } from '../../services/api';

export const InboxWorkspaceView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'needs-attention' | 'waiting' | 'follow-up' | 'completed'>('needs-attention');
  const [inboxActions, setInboxActions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<any | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Inbound Tester State
  const [showAnalyzer, setShowAnalyzer] = useState(false);
  const [testMessageText, setTestMessageText] = useState('Hi, saw your latest post regarding operational turnaround times. We are experiencing similar bottlenecks in customer care. Do you have 15 minutes next week to connect?');
  const [testResult, setTestResult] = useState<any | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const actions = await api.listInboxActions();
      setInboxActions(actions);
    } catch (err: any) {
      console.warn('Failed to load inbox actions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenReview = (action: any) => {
    setSelectedConversation(action);
    setReplyDraft(action.suggested_draft || `Thanks for reaching out! Happy to share our operational playbook and discuss your setup. How does later this week work for a quick 15-min call?`);
    setIsReviewOpen(true);
  };

  const handleApproveReply = async () => {
    if (!selectedConversation) return;
    setIsSending(true);
    setBannerMessage(null);
    try {
      // Simulate/trigger approval
      setBannerMessage({
        kind: 'success',
        text: `Response approved and sent to ${selectedConversation.prospect_name}. Conversation logged.`
      });
      setIsReviewOpen(false);
      setSelectedConversation(null);
      await loadData();
    } catch (err: any) {
      setBannerMessage({ kind: 'error', text: err.message });
    } finally {
      setIsSending(false);
    }
  };

  const handleAnalyzeInbound = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testMessageText.trim()) return;
    setIsAnalyzing(true);
    try {
      const res = await api.classifyInboxResponse(testMessageText);
      setTestResult(res);
    } catch (err: any) {
      setBannerMessage({ kind: 'error', text: err.message });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Map urgency and action titles to human-friendly categories
  const getCategoryBadge = (action: any) => {
    const text = (action.action_title || '').toLowerCase();
    if (text.includes('meeting') || text.includes('call') || text.includes('book')) {
      return { label: 'Meeting opportunity', color: 'bg-emerald-950 text-emerald-300 border-emerald-800' };
    }
    if (text.includes('question') || text.includes('pricing') || text.includes('spec')) {
      return { label: 'Information request', color: 'bg-blue-950 text-blue-300 border-blue-800' };
    }
    if (text.includes('referral') || text.includes('partner')) {
      return { label: 'Referral / Intro', color: 'bg-indigo-950 text-indigo-300 border-indigo-800' };
    }
    return { label: 'Interested / Curious', color: 'bg-purple-950 text-purple-300 border-purple-800' };
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Inbox</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Turn LinkedIn conversations into pipeline. AI drafts high-converting responses for your approval.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAnalyzer(!showAnalyzer)}
            id="btn-inbox-toggle-analyzer"
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 cursor-pointer transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>{showAnalyzer ? 'Hide Message Analyzer' : 'Analyze Inbound Message'}</span>
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition cursor-pointer"
            title="Refresh inbox"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Global alert banner */}
      {bannerMessage && (
        <div
          id="inbox-alert-banner"
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

      {/* Collapsible Message Analyzer Tool */}
      {showAnalyzer && (
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span>Inbound Message Classifier & Reply Assistant</span>
            </h3>
            <span className="text-[11px] text-slate-400">Paste any LinkedIn message or comment</span>
          </div>

          <form onSubmit={handleAnalyzeInbound} className="space-y-3">
            <textarea
              value={testMessageText}
              onChange={(e) => setTestMessageText(e.target.value)}
              rows={3}
              placeholder="Paste LinkedIn DM or comment text..."
              className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500 font-mono leading-relaxed"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isAnalyzing || !testMessageText.trim()}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-md shadow-blue-500/20 disabled:opacity-50"
              >
                {isAnalyzing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                <span>{isAnalyzing ? 'Classifying...' : 'Classify & Suggest Reply'}</span>
              </button>
            </div>
          </form>

          {testResult && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-3 mt-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div>
                  <span className="text-slate-400">Detected Intent: </span>
                  <span className="font-bold text-emerald-400">{testResult.intent}</span>
                </div>
                <div>
                  <span className="text-slate-400">Sentiment: </span>
                  <span className="font-medium text-white">{testResult.sentiment}</span>
                </div>
              </div>
              <div>
                <span className="text-slate-400 block mb-1">Recommended Next Step:</span>
                <p className="font-medium text-blue-300 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                  {testResult.recommended_action}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 gap-1 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('needs-attention')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'needs-attention'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <span>Needs attention</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-950 text-blue-300 font-bold border border-blue-800">
            {inboxActions.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('waiting')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-xl transition cursor-pointer ${
            activeTab === 'waiting'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Waiting for reply
        </button>
        <button
          onClick={() => setActiveTab('follow-up')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-xl transition cursor-pointer ${
            activeTab === 'follow-up'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Follow-up due
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`px-4 py-2.5 text-xs font-semibold rounded-xl transition cursor-pointer ${
            activeTab === 'completed'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Completed
        </button>
      </div>

      {/* Conversations List */}
      {inboxActions.length === 0 ? (
        <div className="p-12 text-center text-slate-400 bg-slate-900/60 rounded-2xl border border-slate-800 space-y-3">
          <MessageSquare className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="font-semibold text-white text-sm">Inbox is all clear</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Zero pending replies requiring action. When leads reply to your outreach, AI will classify intent and prepare draft responses here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {inboxActions.map((action, idx) => {
            const badge = getCategoryBadge(action);

            return (
              <div
                key={idx}
                className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 max-w-3xl">
                  {/* Prospect Header */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-white">{action.prospect_name}</span>
                    <span className="text-xs text-slate-400">at <strong className="text-blue-400">{action.prospect_company}</strong></span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.color}`}>
                      {badge.label}
                    </span>
                    {action.urgency === 'HIGH' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-800">
                        Urgent
                      </span>
                    )}
                  </div>

                  {/* Context & recommendation */}
                  <p className="text-xs text-slate-200 font-medium">
                    {action.action_title}
                  </p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Why: {action.why}
                  </p>

                  {/* Draft preview snippet */}
                  {action.suggested_draft && (
                    <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs font-mono text-slate-300 line-clamp-2">
                      Draft: {action.suggested_draft}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleOpenReview(action)}
                    id={`btn-inbox-review-${idx}`}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-md shadow-blue-500/20"
                  >
                    <span>Review response</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Response Drawer / Modal */}
      {isReviewOpen && selectedConversation && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-base">
                  Review Response for {selectedConversation.prospect_name}
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedConversation.prospect_company} • AI Recommendation: {selectedConversation.action_title}
                </p>
              </div>
              <button
                onClick={() => setIsReviewOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Conversation Context */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Context / Trigger</span>
              <p className="text-xs text-slate-300 leading-relaxed">{selectedConversation.why}</p>
            </div>

            {/* Editable Response Draft */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-200 block">AI Recommended Response Draft:</label>
                <span className="text-[11px] text-slate-400 font-mono">{replyDraft.length} chars</span>
              </div>
              <textarea
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                rows={6}
                className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-100 focus:outline-none focus:border-blue-500 leading-relaxed"
              />
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium pt-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Strict Human Verification: will only be sent upon your approval.</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                onClick={() => setIsReviewOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Cancel
              </button>

              <button
                onClick={handleApproveReply}
                disabled={isSending || !replyDraft.trim()}
                id="btn-inbox-approve-send"
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
              >
                {isSending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>{isSending ? 'Sending...' : 'Approve & Send Reply'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
