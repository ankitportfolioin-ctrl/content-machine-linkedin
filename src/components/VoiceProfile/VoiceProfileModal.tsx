import React, { useState, useEffect } from 'react';
import { api, VoiceProfile } from '../../services/api';
import { 
  X, 
  Save, 
  Sparkles, 
  Check, 
  Plus, 
  Trash2, 
  AlertCircle, 
  Sliders,
  CheckCircle2,
  BookOpen
} from 'lucide-react';

interface VoiceProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileUpdated?: () => void;
  onApplyPostToEditor?: (text: string) => void;
}

export const VoiceProfileModal: React.FC<VoiceProfileModalProps> = ({
  isOpen,
  onClose,
  onProfileUpdated,
  onApplyPostToEditor
}) => {
  const [profile, setProfile] = useState<VoiceProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [newPillar, setNewPillar] = useState('');
  const [newReceipt, setNewReceipt] = useState('');

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      api.getVoiceProfile()
        .then(p => {
          setProfile(p);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLoading(false);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await api.saveVoiceProfile(profile);
      setSavedSuccess(true);
      if (onProfileUpdated) onProfileUpdated();
      setTimeout(() => {
        setSavedSuccess(false);
      }, 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddPillar = () => {
    if (!newPillar.trim() || !profile) return;
    setProfile({
      ...profile,
      contentPillars: [...profile.contentPillars, newPillar.trim()]
    });
    setNewPillar('');
  };

  const handleRemovePillar = (index: number) => {
    if (!profile) return;
    setProfile({
      ...profile,
      contentPillars: profile.contentPillars.filter((_, i) => i !== index)
    });
  };

  const handleAddReceipt = () => {
    if (!newReceipt.trim() || !profile) return;
    setProfile({
      ...profile,
      keyReceipts: [...(profile.keyReceipts || []), newReceipt.trim()]
    });
    setNewReceipt('');
  };

  const handleRemoveReceipt = (index: number) => {
    if (!profile) return;
    setProfile({
      ...profile,
      keyReceipts: (profile.keyReceipts || []).filter((_, i) => i !== index)
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="text-base font-bold text-white">Content Preferences & Voice Profile</h3>
              <p className="text-xs text-slate-400">Controls AI ghostwriter vocabulary, content pillars, and empirical receipts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar text-xs">
          {loading || !profile ? (
            <div className="py-12 text-center text-slate-400">Loading voice profile...</div>
          ) : (
            <>
              {/* Role and ICP */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Your Role / Title
                  </label>
                  <input
                    type="text"
                    value={profile.role || ''}
                    onChange={e => setProfile({ ...profile, role: e.target.value })}
                    className="w-full bg-slate-950 text-slate-100 p-2.5 rounded-lg border border-slate-800 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Target ICP & Audience
                  </label>
                  <input
                    type="text"
                    value={profile.audience || ''}
                    onChange={e => setProfile({ ...profile, audience: e.target.value })}
                    className="w-full bg-slate-950 text-slate-100 p-2.5 rounded-lg border border-slate-800 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Content Pillars */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Content Pillars (Topics to automatically discover & write about)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPillar}
                    onChange={e => setNewPillar(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddPillar()}
                    placeholder="Add a pillar (e.g., Cloud Cost & Architecture, LLM Prompt Security)..."
                    className="flex-1 bg-slate-950 text-slate-100 p-2 rounded-lg border border-slate-800 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={handleAddPillar}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-1 font-semibold"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {profile.contentPillars.map((pillar, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 flex items-center gap-2"
                    >
                      <span>{pillar}</span>
                      <button
                        onClick={() => handleRemovePillar(idx)}
                        className="text-slate-500 hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Key Receipts */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300">
                  Odd-Precision Receipts & Metrics (Verifiable proof points)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newReceipt}
                    onChange={e => setNewReceipt(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddReceipt()}
                    placeholder="Add a receipt (e.g., 42% sprint cycle reduction, $120k ARR pipeline, 99.98% uptime)..."
                    className="flex-1 bg-slate-950 text-slate-100 p-2 rounded-lg border border-slate-800 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={handleAddReceipt}
                    className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg flex items-center gap-1 font-semibold"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {(profile.keyReceipts || []).map((rcpt, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1.5 rounded-lg bg-purple-950/30 border border-purple-800/60 text-purple-200 flex items-center gap-2 font-mono"
                    >
                      <span>{rcpt}</span>
                      <button
                        onClick={() => handleRemoveReceipt(idx)}
                        className="text-purple-400 hover:text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Primary Link & CTA Style */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    First Comment Primary Link (External URL)
                  </label>
                  <input
                    type="text"
                    value={profile.primaryLink || ''}
                    onChange={e => setProfile({ ...profile, primaryLink: e.target.value })}
                    className="w-full bg-slate-950 text-slate-100 p-2.5 rounded-lg border border-slate-800 focus:border-blue-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">LinkedIn penalizes external links in the post body. Links belong in Comment #1.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Discussion Call-To-Action Style
                  </label>
                  <input
                    type="text"
                    value={profile.ctaStyle || ''}
                    onChange={e => setProfile({ ...profile, ctaStyle: e.target.value })}
                    className="w-full bg-slate-950 text-slate-100 p-2.5 rounded-lg border border-slate-800 focus:border-blue-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Authentic peer questions outperform cheap "Agree? Drop a comment below".</p>
                </div>
              </div>

              {/* Banned Words */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Banned Words & Synthetic Clichés
                </label>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex flex-wrap gap-1.5 text-[11px] text-rose-300 font-mono">
                  {profile.bannedWords.map((word, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-rose-950/40 border border-rose-900/60">
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between">
          <button
            onClick={() => {
              if (profile?.signatureExamples?.[0] && onApplyPostToEditor) {
                onApplyPostToEditor(profile.signatureExamples[0]);
                onClose();
              }
            }}
            className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5"
          >
            <BookOpen className="w-4 h-4 text-blue-400" />
            <span>Load Signature Example to Editor</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-slate-400 hover:text-white text-xs font-medium"
            >
              Cancel
            </button>
            <button
              id="save-voice-profile-btn"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-blue-600/20"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Saving...' : 'Save Preferences'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
