import React, { useState, useEffect } from 'react';
import { UserCheck, CheckCircle2, Copy, Check, Sparkles, AlertCircle, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';

export const ProfileOptimizerView: React.FC = () => {
  // Headline Builder State
  const [role, setRole] = useState('Founder & Operator');
  const [company, setCompany] = useState('Our Company');
  const [targetIcp, setTargetIcp] = useState('Target Audience');
  const [desiredResult, setDesiredResult] = useState('achieve measurable operational outcomes');
  const [painPoint, setPainPoint] = useState('wasting months on manual overhead');
  const [credibilityReceipt, setCredibilityReceipt] = useState('Proven track record of quantifiable results');

  // About Section State
  const [aboutHook, setAboutHook] = useState('Most teams lose 30% of their operational focus to repetitive manual handoffs.');
  const [aboutStory, setAboutStory] = useState('We founded our company to solve the exact friction we experienced firsthand in daily operations.');
  const [copiedHeadline, setCopiedHeadline] = useState(false);
  const [copiedAbout, setCopiedAbout] = useState(false);

  useEffect(() => {
    const loadProfileData = async () => {
      try {
        const profile = await api.getVoiceProfile();
        if (profile) {
          if (profile.role) setRole(profile.role);
          if (profile.industry) setCompany(profile.industry.split('&')[0].trim());
          if (profile.audience) setTargetIcp(profile.audience);
          if (profile.contentPillars && profile.contentPillars.length > 0) {
            setDesiredResult(profile.contentPillars[0]);
          }
          if (profile.keyReceipts && profile.keyReceipts.length > 0) {
            setCredibilityReceipt(profile.keyReceipts[0]);
          }
          if (profile.role || profile.audience) {
            setAboutHook(`Most ${profile.audience || 'teams'} lose significant margin to unaddressed execution bottlenecks.`);
            setAboutStory(`In our work across ${profile.industry || 'the sector'}, we consistently observed that simple, reliable workflows outperform complex setups every single time.`);
          }
        }
      } catch (err) {
        console.warn('Could not load voice profile in ProfileOptimizer:', err);
      }
    };
    loadProfileData();
  }, []);

  const headline = `${role}${company ? ` @ ${company}` : ''} | I help ${targetIcp} ${desiredResult} without ${painPoint} | ${credibilityReceipt}`;
  const headlineChars = headline.length;

  const cleanCompany = company ? company.toLowerCase().replace(/[^a-z0-9]/g, '') : 'company';
  const aboutSection = `${aboutHook}

${aboutStory}

Here is what we focus on:
— Rapid operational audit to identify highest-impact bottlenecks
— Eliminating manual friction and repetitive coordination steps
— Deploying direct, reliable workflows with clear ownership and SLA guarantees

Track Record & Receipts:
— ${credibilityReceipt}
— Verified performance across active customer engagements
— Grounded, practical execution playbooks

If you are leading operations or growth and want to evaluate your current setup, feel free to send a direct message or connect here:
contact@${cleanCompany || 'company'}.com`;

  const components = [
    { num: '01', title: 'Profile Photo', check: 'High-contrast headshot, clear facial expression, eye contact, non-distracting background. Square-cropped, high resolution.' },
    { num: '02', title: 'Banner / Background Photo', check: 'Clear 1-sentence value proposition matching your target ICP. Avoid generic landscape photos or cluttered logos.' },
    { num: '03', title: 'Headline (220 Chars)', check: 'Formula: [Role] @ [Company] | I help [ICP] [achieve Result] without [Pain Point] | [Proof/Metric].' },
    { num: '04', title: 'About Section (7-Step)', check: 'Hook line, founder/operator context, problem breakdown, 3-bullet proof points, credible receipts, clear CTA with direct email/link.' },
    { num: '05', title: 'Featured Section (3 Slots)', check: 'Slot 1: High-converting lead magnet/spreadsheet. Slot 2: Best-performing contrarian post. Slot 3: Customer case study or video.' },
    { num: '06', title: 'Experience Section', check: 'Every role must have 3-5 bullet points formatted as: Action Verb + Context + Quantifiable Metric/Receipt.' },
    { num: '07', title: 'Skills & Endorsements', check: 'Top 3 pinned skills must align directly with the keywords your enterprise buyers or recruiters search for.' },
    { num: '08', title: 'Custom URL', check: 'Clean vanity URL: linkedin.com/in/yourname (remove random alphanumeric strings).' },
    { num: '09', title: 'Recommendations', check: 'At least 3-5 recommendations from peers, managers, or clients that highlight specific problem-solving capability.' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-white">LinkedIn Profile Optimizer</h2>
            <span className="text-xs bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded-full font-mono">
              9-Component Architecture
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Turn your profile into a high-converting landing page for investors, clients, and senior hires.
          </p>
        </div>
      </div>

      {/* 220-Char Headline Formula Interactive Builder */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
              Component 03
            </span>
            <h3 className="font-bold text-white text-sm">220-Character Headline Formula Builder</h3>
          </div>
          <span className={`text-xs font-mono font-bold ${headlineChars > 220 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {headlineChars} / 220 characters
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="text-slate-400 block mb-1">Your Role:</label>
            <input
              type="text"
              value={role}
              onChange={e => setRole(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-slate-400 block mb-1">Company Name:</label>
            <input
              type="text"
              value={company}
              onChange={e => setCompany(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-slate-400 block mb-1">Target ICP (Audience):</label>
            <input
              type="text"
              value={targetIcp}
              onChange={e => setTargetIcp(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-slate-400 block mb-1">Desired Outcome / Result:</label>
            <input
              type="text"
              value={desiredResult}
              onChange={e => setDesiredResult(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-slate-400 block mb-1">Pain Point Avoided (&ldquo;without&rdquo;):</label>
            <input
              type="text"
              value={painPoint}
              onChange={e => setPainPoint(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-slate-400 block mb-1">Credibility Receipt / Proof:</label>
            <input
              type="text"
              value={credibilityReceipt}
              onChange={e => setCredibilityReceipt(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Live Headline Result */}
        <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
          <p className="text-sm font-semibold text-emerald-300 font-sans">{headline}</p>
          <button
            onClick={() => {
              navigator.clipboard.writeText(headline);
              setCopiedHeadline(true);
              setTimeout(() => setCopiedHeadline(false), 2000);
            }}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            {copiedHeadline ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedHeadline ? 'Copied' : 'Copy Headline'}
          </button>
        </div>
      </div>

      {/* 7-Step "About" Section Generator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
                Component 04
              </span>
              <h3 className="font-bold text-white text-sm">7-Step &ldquo;About&rdquo; Section Generator</h3>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(aboutSection);
                setCopiedAbout(true);
                setTimeout(() => setCopiedAbout(false), 2000);
              }}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 cursor-pointer"
            >
              {copiedAbout ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copiedAbout ? 'Copied' : 'Copy About'}
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Opening Hook Statement:</label>
              <input
                type="text"
                value={aboutHook}
                onChange={e => setAboutHook(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Origin / Turning Point Story:</label>
              <textarea
                rows={3}
                value={aboutStory}
                onChange={e => setAboutStory(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto custom-scrollbar font-sans">
            {aboutSection}
          </div>
        </div>

        {/* 9-Component Architecture Checklist */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="font-bold text-white text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Complete 9-Component Audit Checklist</span>
          </h3>

          <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1 custom-scrollbar">
            {components.map((item, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 text-xs space-y-1"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-emerald-400 font-bold text-[11px]">{item.num}</span>
                  <span className="font-bold text-white">{item.title}</span>
                </div>
                <p className="text-slate-400 leading-relaxed pl-5">{item.check}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
