import React, { useState, useEffect } from 'react';
import { 
  Sliders, 
  User, 
  Target, 
  Layers, 
  Link, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  Save, 
  RefreshCw,
  Sparkles,
  ExternalLink,
  Plus,
  Trash2
} from 'lucide-react';
import { api, VoiceProfile } from '../../services/api';

export const SettingsWorkspaceView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'profile' | 'icp' | 'pillars' | 'integrations' | 'preferences'>('profile');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Profile state
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
  const [role, setRole] = useState('');
  const [audience, setAudience] = useState('');
  const [targetIndustry, setTargetIndustry] = useState('');
  const [companySize, setCompanySize] = useState('');
  const [sentenceRhythm, setSentenceRhythm] = useState('');
  const [bannedWords, setBannedWords] = useState<string[]>([]);
  const [newBannedWord, setNewBannedWord] = useState('');
  const [pillars, setPillars] = useState<string[]>([]);
  const [newPillar, setNewPillar] = useState('');
  const [keyReceipts, setKeyReceipts] = useState<string[]>([]);
  const [newReceipt, setNewReceipt] = useState('');
  const [resetting, setResetting] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Integration status state
  const [config, setConfig] = useState<any>(null);
  const [publoraKey, setPubloraKey] = useState('');
  const [apifyToken, setApifyToken] = useState('');
  const [previewModeOnly, setPreviewModeOnly] = useState(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [profile, cfg, wsStatus] = await Promise.all([
        api.getVoiceProfile().catch(() => null),
        api.getConfig().catch(() => null),
        api.getWorkspaceStatus().catch(() => null),
      ]);

      if (wsStatus) {
        setIsDemoMode(wsStatus.isDemoMode);
      }

      if (profile) {
        setVoiceProfile(profile);
        setRole(profile.role || '');
        setAudience(profile.audience || '');
        setTargetIndustry((profile as any).industry || '');
        setCompanySize((profile as any).companySize || '');
        setSentenceRhythm(profile.sentenceRhythm || '');
        setBannedWords(profile.bannedWords || ['supercharge', 'delve', 'tapestry', 'synergy']);
        setPillars(profile.contentPillars || []);
        setKeyReceipts(profile.keyReceipts || []);
      }

      if (cfg) {
        setConfig(cfg);
        setPreviewModeOnly(!cfg.credentials?.publoraConfigured);
      }
    } catch (err: any) {
      console.warn('Failed to load settings data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveProfile = async () => {
    setSaving(true);
    setBannerMessage(null);
    try {
      const updated: any = {
        filled: true,
        role,
        audience,
        sentenceRhythm,
        bannedWords,
        contentPillars: pillars,
        signatureOpeners: voiceProfile?.signatureOpeners || [],
        alwaysRules: voiceProfile?.alwaysRules || [
          'Provide concrete observations and real numbers',
          'Speak directly from operational experience'
        ],
        neverRules: voiceProfile?.neverRules || [
          'No generic advice without context',
          'No vague platitudes or AI tropes'
        ],
        ctaStyle: voiceProfile?.ctaStyle || 'Direct question inviting peers to share their experiences in the comments',
        primaryLink: voiceProfile?.primaryLink || '',
        signatureExamples: voiceProfile?.signatureExamples || [],
        keyReceipts,
        industry: targetIndustry,
        companySize
      };

      await api.saveVoiceProfile(updated);
      setVoiceProfile(updated);
      setBannerMessage({ kind: 'success', text: 'Voice profile and ICP configurations saved successfully.' });
    } catch (err: any) {
      setBannerMessage({ kind: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleResetWorkspaceData = async (resetProfile: boolean = false) => {
    const confirmText = resetProfile 
      ? 'Reset entire workspace and voice profile to clean defaults?'
      : 'Clear all prospects, CRM records, and pending drafts from your workspace?';
    if (!window.confirm(confirmText)) return;

    setResetting(true);
    try {
      await api.resetWorkspace({ resetProfile });
      setBannerMessage({
        kind: 'success',
        text: resetProfile 
          ? 'Workspace and profile have been completely reset to clean state.'
          : 'Workspace data cleared. Ready for your authentic ICP criteria.'
      });
      await loadData();
    } catch (err: any) {
      setBannerMessage({ kind: 'error', text: err.message });
    } finally {
      setResetting(false);
    }
  };

  const handleLoadSampleData = async () => {
    if (!window.confirm('Load sample dataset into your workspace for demonstration and testing?')) return;
    setResetting(true);
    try {
      await api.loadSampleWorkspace();
      setBannerMessage({
        kind: 'success',
        text: 'Sample workspace loaded successfully. All demo cards and prospects are available for testing.'
      });
      await loadData();
    } catch (err: any) {
      setBannerMessage({ kind: 'error', text: err.message });
    } finally {
      setResetting(false);
    }
  };

  const handleAddBannedWord = () => {
    if (!newBannedWord.trim()) return;
    if (!bannedWords.includes(newBannedWord.trim().toLowerCase())) {
      setBannedWords([...bannedWords, newBannedWord.trim().toLowerCase()]);
    }
    setNewBannedWord('');
  };

  const handleRemoveBannedWord = (word: string) => {
    setBannedWords(bannedWords.filter(w => w !== word));
  };

  const handleAddPillar = () => {
    if (!newPillar.trim()) return;
    if (!pillars.includes(newPillar.trim())) {
      setPillars([...pillars, newPillar.trim()]);
    }
    setNewPillar('');
  };

  const handleRemovePillar = (p: string) => {
    setPillars(pillars.filter(item => item !== p));
  };

  const handleAddReceipt = () => {
    if (!newReceipt.trim()) return;
    setKeyReceipts([...keyReceipts, newReceipt.trim()]);
    setNewReceipt('');
  };

  const handleRemoveReceipt = (r: string) => {
    setKeyReceipts(keyReceipts.filter(item => item !== r));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Settings</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure your AI voice profile, target customer criteria, content pillars, and integrations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveProfile}
            disabled={saving}
            id="btn-settings-save"
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-md shadow-blue-500/20 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </div>

      {/* Global alert banner */}
      {bannerMessage && (
        <div
          id="settings-alert-banner"
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

      {/* Settings Tabs */}
      <div className="flex border-b border-slate-800 gap-1 overflow-x-auto pb-1">
        {[
          { id: 'profile', label: 'Profile & Voice', icon: User },
          { id: 'icp', label: 'Audience & ICP', icon: Target },
          { id: 'pillars', label: 'Content Pillars', icon: Layers },
          { id: 'integrations', label: 'Integrations', icon: Link },
          { id: 'preferences', label: 'AI & Automation Rules', icon: ShieldCheck }
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2.5 text-xs font-semibold rounded-xl transition cursor-pointer flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: PROFILE & VOICE */}
      {activeTab === 'profile' && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white">Your Professional Voice Profile</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              The AI ghostwriter adheres strictly to your cadence, vocabulary, and authentic war stories.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Your Role / Headline</label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Founder & CEO | B2B SaaS Infrastructure"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Sentence Rhythm & Cadence</label>
              <input
                type="text"
                value={sentenceRhythm}
                onChange={(e) => setSentenceRhythm(e.target.value)}
                placeholder="e.g. Short punchy openings. Contrast lines. Specific metrics and trade-offs. No fluff."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Banned AI Words */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">Banned Words & AI Clichés</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newBannedWord}
                  onChange={(e) => setNewBannedWord(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddBannedWord(); } }}
                  placeholder="Add banned word (e.g. game-changer, seamless, unleash)..."
                  className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddBannedWord}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Add
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {bannedWords.map((word, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-red-950/40 text-red-300 border border-red-900/60"
                  >
                    <span>{word}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveBannedWord(word)}
                      className="text-red-400 hover:text-white cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Key Receipts & Precision Numbers */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">Key Verified Numbers & Receipts</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newReceipt}
                  onChange={(e) => setNewReceipt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddReceipt(); } }}
                  placeholder="e.g. 42% faster sprint delivery, $120k pipeline generated, 99.98% uptime..."
                  className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddReceipt}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
                >
                  Add
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {keyReceipts.map((rec, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-emerald-950/40 text-emerald-300 border border-emerald-900/60 font-mono"
                  >
                    <span>{rec}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveReceipt(rec)}
                      className="text-emerald-400 hover:text-white cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AUDIENCE & ICP */}
      {activeTab === 'icp' && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white">Ideal Customer Profile (ICP) Criteria</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              The AI Sales Copilot scores prospects and discovers decision-makers against these definitions.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Target Roles & Titles</label>
              <input
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. VP of Engineering, CTO, Head of Infrastructure, Lead Architect"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Target Industries</label>
              <input
                type="text"
                value={targetIndustry}
                onChange={(e) => setTargetIndustry(e.target.value)}
                placeholder="e.g. B2B SaaS, HealthTech, Financial Services, E-commerce"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Company Size Range</label>
              <input
                type="text"
                value={companySize}
                onChange={(e) => setCompanySize(e.target.value)}
                placeholder="e.g. 10 - 250 employees, Seed to Series B"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CONTENT PILLARS */}
      {activeTab === 'pillars' && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white">Core Content Pillars</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Your 3-5 foundational topics that generate inbound authority and attract target buyers.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={newPillar}
                onChange={(e) => setNewPillar(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddPillar(); } }}
                placeholder="Add a new topic pillar..."
                className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleAddPillar}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer"
              >
                Add Pillar
              </button>
            </div>

            <div className="space-y-2">
              {pillars.map((pillar, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                >
                  <span className="text-xs font-medium text-white">{pillar}</span>
                  <button
                    type="button"
                    onClick={() => handleRemovePillar(pillar)}
                    className="text-slate-400 hover:text-red-400 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: INTEGRATIONS */}
      {activeTab === 'integrations' && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white">Service Integrations</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Connect external publishing engines and discovery scrapers.
            </p>
          </div>

          <div className="space-y-4">
            {/* LinkedIn / Publora */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-white">Publora LinkedIn Publisher</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 font-semibold border border-emerald-800">
                    Connected
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Handles automated scheduling and direct posting to your personal LinkedIn profile.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400">Ready</span>
            </div>

            {/* Apify / Prospect Discovery */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-white">Prospect Intelligence Engine</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-950 text-blue-300 font-semibold border border-blue-800">
                    Configured
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Enables live ICP company search and signal detection.
                </p>
              </div>
              <span className="text-xs font-mono text-slate-400">Active</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: AI & AUTOMATION PREFERENCES */}
      {activeTab === 'preferences' && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
          <div>
            <h3 className="text-base font-bold text-white">Safety & Automation Rules</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Ensure strict human control over outbound communication and content publishing.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
              <ShieldCheck className="w-4 h-4" />
              <span>Strict Human-in-the-Loop Guarantee</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              By design, zero LinkedIn connection notes, direct messages, or public posts are ever transmitted without explicit confirmation from you in the application UI.
            </p>
          </div>

          {/* Workspace Data Management */}
          <div className="pt-4 border-t border-slate-800 space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white">Workspace Data Management</h4>
                {isDemoMode && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800">
                    Demo Mode Active
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isDemoMode 
                  ? 'Your workspace is currently populated with sample demo prospects. Reset to return to your clean, authentic workspace.'
                  : 'Clear transient leads or reset your workspace to test with your actual Ideal Customer Profile.'}
              </p>
            </div>

            {isDemoMode && (
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/60 text-amber-200 text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Sandbox data is active. Reset leads to work with real customer records.</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleResetWorkspaceData(false)}
                  disabled={resetting}
                  className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-slate-950 font-semibold text-xs cursor-pointer transition shrink-0"
                >
                  Exit Demo Mode
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleResetWorkspaceData(false)}
                disabled={resetting}
                id="btn-clear-workspace-activity"
                className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-left transition space-y-1 cursor-pointer disabled:opacity-50"
              >
                <div className="text-xs font-semibold text-amber-300">Clear Leads & Activity</div>
                <p className="text-[11px] text-slate-400">
                  Wipes leads, inbox tasks, and approvals while keeping your saved voice profile.
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleResetWorkspaceData(true)}
                disabled={resetting}
                id="btn-reset-full-workspace"
                className="p-3.5 rounded-xl bg-slate-950 border border-red-900/60 hover:border-red-700 text-left transition space-y-1 cursor-pointer disabled:opacity-50"
              >
                <div className="text-xs font-semibold text-red-400">Reset Everything</div>
                <p className="text-[11px] text-slate-400">
                  Resets voice profile, ICP criteria, and all workspace records to clean start.
                </p>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
