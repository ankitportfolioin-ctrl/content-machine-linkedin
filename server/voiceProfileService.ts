import fs from 'fs';
import path from 'path';

export interface VoiceProfile {
  filled: boolean;
  role: string;
  audience: string;
  contentPillars: string[];
  sentenceRhythm: string;
  signatureOpeners: string[];
  bannedWords: string[];
  alwaysRules: string[];
  neverRules: string[];
  primaryLink: string;
  ctaStyle: string;
  signatureExamples: string[];
  keyReceipts: string[];
  industry?: string;
  companySize?: string;
}

export const EMPTY_PROFILE: VoiceProfile = {
  filled: false,
  role: '',
  audience: '',
  contentPillars: [],
  sentenceRhythm: 'Clear, direct, and conversational. Short paragraphs with real substance and no fluff.',
  signatureOpeners: [],
  bannedWords: [
    'delve', 'tapestry', 'crucial', 'leverage', 'robust', 'foster', 'streamline', 
    'landscape', 'multifaceted', 'navigate', 'uncharted', 'realm', 'testament', 
    'empower', 'supercharge', 'game-changer', "in today's fast-paced world"
  ],
  alwaysRules: [
    'Open with a strong, specific hook or factual observation',
    'Keep lines concise and formatted for mobile readability',
    'End with an open, thoughtful discussion prompt'
  ],
  neverRules: [
    'Never open with a generic rhetorical question',
    'Never use AI clichés or reveal bridges',
    'Never use excessive emojis',
    'Never put external links directly in the post body'
  ],
  primaryLink: '',
  ctaStyle: 'Direct question inviting peers to share their experiences in the comments',
  signatureExamples: [],
  keyReceipts: [],
  industry: '',
  companySize: ''
};

export const DEFAULT_TECH_CREATOR_PROFILE: VoiceProfile = {
  filled: true,
  role: 'Tech Creator & Educator',
  audience: 'Developers, AI builders, technical founders',
  contentPillars: ['AI', 'Software Development', 'Emerging Technology', 'Startups', 'Tech Careers'],
  sentenceRhythm: 'Clear, direct, and conversational. Short paragraphs with real substance and no fluff.',
  signatureOpeners: [
    'Most production implementations fail at the seams.',
    'A pragmatic look at how engineering teams actually deploy this:'
  ],
  bannedWords: [
    'delve', 'tapestry', 'crucial', 'leverage', 'robust', 'foster', 'streamline', 
    'landscape', 'multifaceted', 'navigate', 'uncharted', 'realm', 'testament', 
    'empower', 'supercharge', 'game-changer', "in today's fast-paced world"
  ],
  alwaysRules: [
    'Open with a strong, specific hook or factual observation',
    'Keep lines concise and formatted for mobile readability',
    'End with an open, thoughtful discussion prompt'
  ],
  neverRules: [
    'Never open with a generic rhetorical question',
    'Never use AI clichés or reveal bridges',
    'Never use excessive emojis',
    'Never put external links directly in the post body'
  ],
  primaryLink: '',
  ctaStyle: 'Direct question inviting peers to share their experiences in the comments',
  signatureExamples: [],
  keyReceipts: [
    'Built developer community to 45,000 engineers',
    'Published 120+ technical breakdowns on AI architectures'
  ],
  industry: 'Developer Tools & AI',
  companySize: '1-10'
};

export const DEFAULT_D2C_FOUNDER_PROFILE: VoiceProfile = {
  filled: true,
  role: 'D2C Founder & Brand Operator',
  audience: 'E-commerce operators, retail brand founders, direct-to-consumer heads of growth',
  contentPillars: ['Customer Retention', 'Paid Acquisition & CAC', 'Supply Chain & Fulfillment', 'D2C Unit Economics', 'Omnichannel Retail'],
  sentenceRhythm: 'Concise, data-conscious, practical direct-to-consumer operator notes.',
  signatureOpeners: [
    'Unit economics will always expose vanity metrics.',
    'A tactical breakdown of what actually improved retention this quarter:'
  ],
  bannedWords: [
    'delve', 'tapestry', 'crucial', 'leverage', 'robust', 'foster', 'streamline', 
    'landscape', 'multifaceted', 'navigate', 'uncharted', 'realm', 'testament', 
    'empower', 'supercharge', 'game-changer', "in today's fast-paced world"
  ],
  alwaysRules: [
    'Focus on real contribution margin, LTV, and customer retention',
    'Keep lines punchy and clear for busy brand operators',
    'End with an open operator question'
  ],
  neverRules: [
    'Never confuse gross revenue with contribution margin',
    'Never invent customer support metrics without verified receipts',
    'Never use generic hype'
  ],
  primaryLink: '',
  ctaStyle: 'Direct question inviting e-commerce operators to share retention strategies',
  signatureExamples: [],
  keyReceipts: [
    'Scaled consumer brand to 8-figure omnichannel distribution',
    'Improved repeat purchase rate by 18% through subscription cohort optimization'
  ],
  industry: 'D2C & Retail',
  companySize: '11-50'
};

export function switchPersona(
  personaKey: 'TECH_CREATOR' | 'D2C_FOUNDER',
  workspaceId?: string
): VoiceProfile {
  const profile =
    personaKey === 'D2C_FOUNDER'
      ? { ...DEFAULT_D2C_FOUNDER_PROFILE }
      : { ...DEFAULT_TECH_CREATOR_PROFILE };

  const saved = saveVoiceProfile(profile, workspaceId);

  // Cleanly isolate learning store and workspace memory for the new persona
  const dir = resolveDataDir(workspaceId);
  const learningFile = path.join(dir, 'learning-store.json');
  try {
    if (fs.existsSync(learningFile)) {
      // Clear persona-specific learnings to eliminate cross-contamination
      const emptyStore = {
        personaFingerprint: `${saved.role}-${saved.audience}`,
        learnings: [],
        experiments: [],
        sharedOpportunities: [],
        lastUpdated: new Date().toISOString(),
      };
      fs.writeFileSync(learningFile, JSON.stringify(emptyStore, null, 2), 'utf-8');
    }
  } catch (err) {
    console.warn(`[switchPersona] Learning store reset note:`, err);
  }

  return saved;
}

export function resolveDataDir(workspaceId?: string): string {
  if (!workspaceId || workspaceId === 'default' || workspaceId === 'primary') {
    const dir = process.env.COPILOT_DATA_DIR || path.join(process.cwd(), '.copilot_data');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }
  const cleanId = workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const baseDir = path.join(process.cwd(), '.copilot_data', 'workspaces');
  const dir = path.join(baseDir, cleanId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export interface WorkspaceState {
  isDemoMode: boolean;
  demoLoadedAt?: string | null;
}

export function getWorkspaceState(workspaceId?: string): WorkspaceState {
  const dir = resolveDataDir(workspaceId);
  const file = path.join(dir, 'workspace-state.json');
  try {
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, 'utf-8').trim();
      if (data.length > 0) {
        return JSON.parse(data);
      }
    }
  } catch (err) {
    console.warn(`Could not read workspace state for [${workspaceId || 'default'}]:`, err);
  }
  return { isDemoMode: false, demoLoadedAt: null };
}

export function setWorkspaceState(state: Partial<WorkspaceState>, workspaceId?: string): WorkspaceState {
  const dir = resolveDataDir(workspaceId);
  const file = path.join(dir, 'workspace-state.json');
  try {
    const current = getWorkspaceState(workspaceId);
    const updated = { ...current, ...state };
    const tempFile = `${file}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    fs.writeFileSync(tempFile, JSON.stringify(updated, null, 2), 'utf-8');
    fs.renameSync(tempFile, file);
    return updated;
  } catch (err) {
    console.error(`Failed to save workspace state for [${workspaceId || 'default'}]:`, err);
    return { isDemoMode: false, demoLoadedAt: null };
  }
}

export function getVoiceProfile(workspaceId?: string): VoiceProfile {
  const dir = resolveDataDir(workspaceId);
  const file = path.join(dir, 'voice-profile.json');
  try {
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, 'utf-8').trim();
      if (data.length > 0) {
        const parsed = JSON.parse(data);
        return {
          ...EMPTY_PROFILE,
          ...parsed,
        };
      }
    }
  } catch (err) {
    console.warn(`Could not read voice profile file for [${workspaceId || 'default'}]:`, err);
  }

  // If this is an explicitly empty test workspace or configured as empty
  if (workspaceId && (workspaceId.includes('empty') || workspaceId.includes('unconfigured'))) {
    return { ...EMPTY_PROFILE, filled: false };
  }

  // Default active user specified for this Growth Operator
  return { ...DEFAULT_TECH_CREATOR_PROFILE };
}

export function saveVoiceProfile(updated: Partial<VoiceProfile>, workspaceId?: string): VoiceProfile {
  const dir = resolveDataDir(workspaceId);
  const file = path.join(dir, 'voice-profile.json');
  try {
    const current = getVoiceProfile(workspaceId);
    const merged: VoiceProfile = {
      ...current,
      ...updated,
      filled: updated.filled !== undefined ? updated.filled : true,
    };
    const tempFile = `${file}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    fs.writeFileSync(tempFile, JSON.stringify(merged, null, 2), 'utf-8');
    fs.renameSync(tempFile, file);
    return merged;
  } catch (err) {
    console.error(`Failed to save voice profile for [${workspaceId || 'default'}]:`, err);
    throw new Error('Failed to save voice profile');
  }
}

export function resetVoiceProfile(workspaceId?: string, options?: { empty?: boolean }): VoiceProfile {
  const dir = resolveDataDir(workspaceId);
  const file = path.join(dir, 'voice-profile.json');
  try {
    const clean = options?.empty
      ? { ...EMPTY_PROFILE, filled: false }
      : { ...DEFAULT_TECH_CREATOR_PROFILE, filled: true };
    fs.writeFileSync(file, JSON.stringify(clean, null, 2), 'utf-8');
    setWorkspaceState({ isDemoMode: false, demoLoadedAt: null }, workspaceId);
    return clean;
  } catch (err) {
    console.error(`Failed to reset voice profile for [${workspaceId || 'default'}]:`, err);
    throw new Error('Failed to reset voice profile');
  }
}
