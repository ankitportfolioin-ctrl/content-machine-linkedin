import React, { useState } from 'react';
import { api } from '../../services/api';
import { 
  MessageSquare, 
  Check, 
  Copy, 
  AlertTriangle, 
  Sparkles, 
  Send, 
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface ReplyTemplate {
  code: string;
  name: string;
  bestFor: string;
  template: string;
  sample: string;
}

const REPLY_FORMULAS: ReplyTemplate[] = [
  {
    code: 'R1',
    name: 'Expand with Data / Receipt',
    bestFor: 'Commenter asks "how did you calculate this?" or wants more concrete proof.',
    template: `Appreciate you asking, {Name}. Here is the exact calculation:\n\n{Receipt/Data breakdown}\n\nWe tracked this over {Time Period} and saw {Outcome}. Does your team measure this metric similarly?`,
    sample: `Appreciate you asking, {Name}. Here is the exact calculation:\n\nWe tracked operational turnaround across our active accounts. First-contact resolution improved from 4 hours to 18 minutes after eliminating redundant manual handoffs.\n\nDoes your team track first-contact resolution or overall cycle time?`
  },
  {
    code: 'R2',
    name: 'Nuanced Counter-Challenge',
    bestFor: 'Commenter pushes back with "This doesn\'t work for our space" or an objection.',
    template: `Fair pushback, {Name}. That is definitely true when {Condition where their point holds}.\n\nWhere we saw it diverge is {Specific operational exception + number}.\n\nHow do you handle that specific bottleneck at your scale?`,
    sample: `Fair pushback, {Name}. That is definitely true when dealing with strictly manual compliance reviews where automated handoffs are restricted.\n\nWhere we saw it diverge is high-volume customer workflows, where direct automated triaging reduced back-and-forth by 60%.\n\nHow does your team currently triage high-volume customer requests?`
  },
  {
    code: 'R3',
    name: 'Story Continuation',
    bestFor: 'Commenter shares an empathetic reaction or similar war story.',
    template: `You nailed it, {Name}. The part we did not mention in the main post:\n\n{Brief 2-sentence behind-the-scenes anecdote}\n\nGlad to know we weren't the only ones who had to learn that the hard way!`,
    sample: `You nailed it, {Name}. The part we did not mention in the main post: our first attempt at reorganizing the workflow caused confusion for the first 48 hours until we standardized the communication templates.\n\nGlad to know we weren't the only ones who had to navigate that transition!`
  },
  {
    code: 'R4',
    name: 'Bridge to Private DM',
    bestFor: 'High-intent prospective buyer or collaborator asking for proprietary specs.',
    template: `Great question, {Name}. The breakdown involves proprietary customer workflow data, so I just sent you a direct message with the detailed breakdown.\n\nLet me know what you think once you review!`,
    sample: `Great question, {Name}. The breakdown involves proprietary workflow benchmarks, so I just sent you a direct message with the full breakdown sheet.\n\nCheck your LinkedIn requests and let me know if those numbers provide a helpful reference point!`
  },
  {
    code: 'R5',
    name: 'Graceful Agreement + New Question',
    bestFor: 'Commenter makes a smart addition to your original post.',
    template: `Spot on, {Name}. Your point on {Their Specific Insight} is actually the missing puzzle piece.\n\nHave you seen that dynamic play out more in {Scenario A} or {Scenario B}?`,
    sample: `Spot on, {Name}. Your point on team documentation standards is the key piece that makes asynchronous workflows succeed in practice.\n\nHave you seen that adoption work better with short video walkthroughs or concise written playbooks?`
  }
];

export const ReplyHandlerView: React.FC = () => {
  const [selectedFormula, setSelectedFormula] = useState<ReplyTemplate>(REPLY_FORMULAS[0]);
  const [commenterName, setCommenterName] = useState('');
  const [inboundComment, setInboundComment] = useState('');
  const [activeReply, setActiveReply] = useState<string>('');
  const [targetPostUrn, setTargetPostUrn] = useState('');
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSelectFormula = (formula: ReplyTemplate) => {
    setSelectedFormula(formula);
    const targetName = commenterName.trim() || 'Reader';
    setActiveReply(formula.sample.replace(/\{Name\}/g, targetName));
  };

  const handleAiGenerateReply = async () => {
    setIsGenerating(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await api.generateAiReply({
        comment: inboundComment,
        commenterName,
        formulaCode: selectedFormula.code,
      });
      setActiveReply(res.reply);
      setStatusMessage(`AI reply crafted following formula ${selectedFormula.code}!`);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePostReplyLive = async () => {
    setIsDispatching(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await api.postComment({
        postUrn: targetPostUrn,
        message: activeReply,
      });
      setStatusMessage(`Reply dispatched! Comment ID: ${res.commentId || 'OK'} (${res.isDryRun ? 'Simulated' : 'Live'})`);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-sky-400" />
            <h2 className="text-lg font-bold text-white">LinkedIn Thread & Reply Manager</h2>
            <span className="text-xs bg-sky-950 text-sky-300 border border-sky-800 px-2 py-0.5 rounded-full font-mono">
              2-Level Flattening Compliant
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Automate high-converting replies with Gemini and dispatch live comments through the Publora REST API.
          </p>
        </div>
      </div>

      {statusMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800 text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 2-Level Flattening Rule Box */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1 text-slate-300">
          <strong className="text-amber-300 block">The LinkedIn 2-Level Comment Flattening Rule:</strong>
          <p>
            LinkedIn only renders 2 levels of indentation in comment threads: Top-Level Comment (Level 1) &rarr; Reply (Level 2).
            Always address the commenter directly by name, and end with an open question to provoke a return comment within the 2-hour algorithmic window.
          </p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Formula Selector (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>5 Reply Formulas (R1-R5)</span>
            <span>Pick Response Type</span>
          </div>

          <div className="space-y-2">
            {REPLY_FORMULAS.map(rf => (
              <div
                key={rf.code}
                onClick={() => handleSelectFormula(rf)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  selectedFormula.code === rf.code
                    ? 'bg-sky-950/40 border-sky-500 shadow-md shadow-sky-950/50'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded bg-sky-600/20 text-sky-400 border border-sky-500/30">
                      {rf.code}
                    </span>
                    <h4 className="text-sm font-semibold text-white">{rf.name}</h4>
                  </div>
                </div>
                <p className="text-xs text-slate-300 mt-1.5">{rf.bestFor}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Live Interactive Draft & Dispatcher (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                {selectedFormula.code}
              </span>
              <h3 className="font-bold text-white text-sm">{selectedFormula.name}</h3>
            </div>

            <button
              onClick={handleAiGenerateReply}
              disabled={isGenerating}
              className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition shadow-md shadow-sky-600/20"
            >
              {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {isGenerating ? 'Drafting...' : 'Generate with Gemini'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Target Commenter Name:</label>
              <input
                type="text"
                placeholder="e.g. Sarah Chen"
                value={commenterName}
                onChange={e => setCommenterName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Target Post URN / URL:</label>
              <input
                type="text"
                placeholder="urn:li:activity:... or post URL"
                value={targetPostUrn}
                onChange={e => setTargetPostUrn(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white placeholder:text-slate-600 font-mono text-[11px] focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="text-xs">
            <label className="text-slate-400 block mb-1">Inbound Comment to Address:</label>
            <textarea
              rows={2}
              placeholder="Paste the inbound comment received on your LinkedIn post..."
              value={inboundComment}
              onChange={e => setInboundComment(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white placeholder:text-slate-600 focus:border-sky-500 focus:outline-none"
            />
          </div>

          {/* Active Reply Editor */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-medium text-slate-300">Reply Draft:</span>
              <span className="font-mono">{activeReply.length} / 1,250 chars</span>
            </div>
            <textarea
              rows={5}
              placeholder="Select a formula or click 'Generate with Gemini' to craft a tailored response..."
              value={activeReply}
              onChange={e => setActiveReply(e.target.value)}
              className="w-full bg-slate-950 text-slate-100 text-sm font-sans p-3 rounded-lg border border-slate-800 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none leading-relaxed"
            />
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
            <button
              onClick={() => {
                navigator.clipboard.writeText(activeReply);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy Text'}
            </button>

            <button
              onClick={handlePostReplyLive}
              disabled={isDispatching || !activeReply}
              className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition shadow-md shadow-sky-600/20 disabled:opacity-50"
            >
              {isDispatching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Dispatch Comment via Publora API
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
