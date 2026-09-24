export interface ConfigResponse {
  backend: string;
  credentials: {
    publoraConfigured: boolean;
    publoraKeyPrefix: string | null;
    platformIdConfigured: boolean;
    platformIdValue: string | null;
    apifyConfigured: boolean;
    geminiConfigured: boolean;
  };
  nextDefaultSlot: {
    date: string;
    scheduledUtc: string;
  };
  connectedChannels: any[];
  safeMode: boolean;
}

export interface ScheduleResult {
  success: boolean;
  postId: string;
  scheduledFor?: string;
  isDryRun: boolean;
  channelId?: string;
  message?: string;
  previewUrl?: string;
}

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
  authorName?: string;
  userName?: string;
  customNotes?: string;
}

export interface CrmRecord {
  prospect_id: string;
  name: string;
  company: string;
  stage: string;
  opportunity_value: number;
  notes?: any[];
}

export const api = {
  async getConfig(): Promise<ConfigResponse> {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error(`Failed to load config: ${res.statusText}`);
    return res.json();
  },

  async testConfig(): Promise<any> {
    const res = await fetch('/api/config/test', { method: 'POST' });
    if (!res.ok) throw new Error(`Test config failed: ${res.statusText}`);
    return res.json();
  },

  async getVoiceProfile(): Promise<VoiceProfile> {
    const res = await fetch('/api/voice-profile');
    if (!res.ok) throw new Error(`Failed to get voice profile: ${res.statusText}`);
    return res.json();
  },

  async saveVoiceProfile(profile: Partial<VoiceProfile>): Promise<VoiceProfile> {
    const res = await fetch('/api/voice-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    });
    if (!res.ok) throw new Error(`Failed to save voice profile: ${res.statusText}`);
    return res.json();
  },

  async getHistory(): Promise<{ count: number; history: any[] }> {
    const res = await fetch('/api/linkedin/history');
    if (!res.ok) throw new Error(`Failed to get history: ${res.statusText}`);
    return res.json();
  },

  async schedulePost(params: {
    content: string;
    scheduledTime?: string;
    angle?: string;
    sources?: any;
    dryRun?: boolean;
  }): Promise<ScheduleResult> {
    const res = await fetch('/api/linkedin/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async postNow(params: {
    content: string;
    angle?: string;
    dryRun?: boolean;
  }): Promise<ScheduleResult> {
    const res = await fetch('/api/linkedin/post-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async postComment(params: {
    postUrn: string;
    message: string;
    parentComment?: string;
    dryRun?: boolean;
  }): Promise<any> {
    const res = await fetch('/api/linkedin/comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async postReaction(params: {
    postUrn: string;
    reactionType?: string;
    dryRun?: boolean;
  }): Promise<any> {
    const res = await fetch('/api/linkedin/reaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async generateContentStrategy(params: {
    subject: string;
    sourceDocuments?: any[];
    sourceFacts?: string[];
    userIdea?: string;
    voiceProfile?: any;
    userAssets?: any[];
    performanceData?: any;
    customAngleOverride?: string;
    customFormatOverride?: string;
  }): Promise<{ strategy: any }> {
    const res = await fetch('/api/content/strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async generateIdeas(voiceProfile?: any): Promise<{ ideas: any[] }> {
    const res = await fetch('/api/content/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voiceProfile }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async generateHooks(idea: any, voiceProfile?: any): Promise<{ hooks: any[]; strategy?: any }> {
    const res = await fetch('/api/content/hooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea, voiceProfile }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async generateCompletePost(params: {
    idea: any;
    hook: string;
    voiceProfile?: any;
    customNotes?: string;
    sourceContext?: string;
    includeSources?: boolean;
    sources?: any[];
    strategy?: any;
  }): Promise<{
    post: string;
    modelUsed: string;
    generationMode?: 'AI_DYNAMIC' | 'DETERMINISTIC_GROUNDED' | 'UNAVAILABLE';
    failureReason?: string;
    validation: any;
    sourceFidelity?: any;
    formatExecution?: any;
    originality?: any;
    strategyUsed?: any;
  }> {
    const res = await fetch('/api/content/complete-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async validatePost(post: string, voiceProfile?: any): Promise<any> {
    const res = await fetch('/api/content/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post, voiceProfile }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async getTrends(): Promise<{ trends: any[]; status: any; discoveredAt: string; documentCount: number; sourceCount: number }> {
    const res = await fetch('/api/content/trends');
    if (!res.ok) throw new Error(`Failed to load trends: ${res.statusText}`);
    return res.json();
  },

  async getTrend(id: string): Promise<any> {
    const res = await fetch(`/api/content/trends/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`Failed to load trend: ${res.statusText}`);
    return res.json();
  },

  async runResearch(options?: {
    mode?: 'MY_NICHE' | 'SPECIFIC_TOPIC' | 'URL_RESEARCH';
    topic?: string;
    url?: string;
    maxSources?: number;
  }): Promise<any> {
    const res = await fetch('/api/content/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async getResearchStatus(): Promise<any> {
    const res = await fetch('/api/content/research/status');
    if (!res.ok) throw new Error(`Failed to get research status: ${res.statusText}`);
    return res.json();
  },

  async generateIdeaFromTrend(trend: any, angle: any, voiceProfile?: any, strategy?: any): Promise<{ idea: any; strategy?: any }> {
    const res = await fetch('/api/content/ideas/from-trend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trend, angle, voiceProfile, strategy }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async researchUrl(url: string): Promise<any> {
    const res = await fetch('/api/content/research-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async getContentSources(): Promise<{ sources: any[] }> {
    const res = await fetch('/api/content/sources');
    if (!res.ok) throw new Error(`Failed to get sources: ${res.statusText}`);
    return res.json();
  },

  async saveContentSource(source: any): Promise<{ source: any }> {
    const res = await fetch('/api/content/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(source),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async getContentPatterns(): Promise<{ patterns: any[] }> {
    const res = await fetch('/api/strategy/patterns');
    if (!res.ok) throw new Error(`Failed to load content patterns: ${res.statusText}`);
    return res.json();
  },

  async formulateStrategy(params: {
    subject: string;
    sourceDocuments?: any[];
    userAssets?: any[];
    customAngleOverride?: string;
    voiceProfile?: any;
  }): Promise<{ strategy: any; qualityGate: any }> {
    const res = await fetch('/api/strategy/formulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async validateStrategyHook(params: {
    hookText: string;
    subject: string;
    angle?: string;
    strategy?: any;
  }): Promise<any> {
    const res = await fetch('/api/strategy/validate-hook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async generateStructuredPost(params: {
    strategy: any;
    hook: string;
    customNotes?: string;
    sourceContext?: string;
    includeSources?: boolean;
    sources?: any[];
    voiceProfile?: any;
  }): Promise<{ post: string; modelUsed: string; validation: any; similarityAnalysis?: any; originality?: any; strategyUsed: any; finalQualityCheck?: any }> {
    const res = await fetch('/api/strategy/generate-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async generateAiPost(params: {
    topic: string;
    formulaCode?: string;
    formulaName?: string;
    angleCode?: string;
    angleName?: string;
    receipts?: string;
    targetAudience?: string;
    voiceProfile?: any;
    idea?: any;
    hook?: string;
  }): Promise<{ post: string; modelUsed: string; validation?: any }> {
    const res = await fetch('/api/ai/generate-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async generateReply(params: {
    comment: string;
    commenterName?: string;
    formulaCode?: string;
    postContext?: string;
  }): Promise<{ reply: string }> {
    const res = await fetch('/api/ai/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async generateAiReply(params: {
    comment: string;
    commenterName?: string;
    formulaCode?: string;
    postContext?: string;
  }): Promise<{ reply: string }> {
    return this.generateReply(params);
  },

  async getRoutineStatus(): Promise<any> {
    const res = await fetch('/api/routine/status');
    if (!res.ok) throw new Error(`Failed to get routine status: ${res.statusText}`);
    return res.json();
  },

  async runDailyRoutine(params?: {
    topic?: string;
    pillar?: string;
    receipts?: string;
    dryRun?: boolean;
    scheduledTime?: string;
  }): Promise<any> {
    const res = await fetch('/api/routine/run-daily', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {})
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async discoverLatest(pillars?: string[]): Promise<any> {
    const query = pillars && pillars.length > 0 ? `?pillars=${encodeURIComponent(pillars.join(','))}` : '';
    const res = await fetch(`/api/discovery/latest${query}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  // ==========================================
  // SALES COPILOT API
  // ==========================================

  async getSalesDashboard(): Promise<any> {
    const res = await fetch('/api/sales/dashboard');
    if (!res.ok) throw new Error(`Failed to load sales dashboard: ${res.statusText}`);
    return res.json();
  },

  async getDailyBriefing(): Promise<{ briefing: string }> {
    const res = await fetch('/api/sales/daily-briefing');
    if (!res.ok) throw new Error(`Failed to load daily briefing: ${res.statusText}`);
    return res.json();
  },

  async listProspects(): Promise<any[]> {
    const res = await fetch('/api/sales/prospects');
    if (!res.ok) throw new Error(`Failed to load prospects: ${res.statusText}`);
    return res.json();
  },

  async discoverProspects(params: {
    roles?: string[];
    industries?: string[];
    offer?: string;
    backend?: string;
    limit?: number;
    dry_run?: boolean;
  }): Promise<any[]> {
    const res = await fetch('/api/sales/prospects/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async qualifyProspect(prospectId: string): Promise<any> {
    const res = await fetch('/api/sales/prospects/qualify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospect_id: prospectId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async researchProspect(prospectId: string, offering?: string): Promise<any> {
    const res = await fetch('/api/sales/prospects/research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospect_id: prospectId, offering }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async draftOutreach(params: {
    prospect_id: string;
    mode?: string;
    offering?: string;
  }): Promise<any> {
    const res = await fetch('/api/sales/outreach/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async listPendingApprovals(): Promise<any[]> {
    const res = await fetch('/api/sales/outreach/pending');
    if (!res.ok) throw new Error(`Failed to load approvals: ${res.statusText}`);
    return res.json();
  },

  async approveOutreach(cardId: string, editedText?: string): Promise<any> {
    const res = await fetch('/api/sales/outreach/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: cardId, edited_text: editedText }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async rejectOutreach(cardId: string): Promise<any> {
    const res = await fetch('/api/sales/outreach/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_id: cardId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async executeOutreach(params: {
    prospect_id: string;
    card_id?: string;
    dry_run?: boolean;
  }): Promise<any> {
    const res = await fetch('/api/sales/outreach/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async listInboxActions(): Promise<any[]> {
    const res = await fetch('/api/sales/inbox');
    if (!res.ok) throw new Error(`Failed to load inbox actions: ${res.statusText}`);
    return res.json();
  },

  async classifyInboxResponse(text: string): Promise<any> {
    const res = await fetch('/api/sales/inbox/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async getNextInboxAction(prospectId: string): Promise<any> {
    const res = await fetch('/api/sales/inbox/next-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospect_id: prospectId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async listCrmPipeline(stage?: string): Promise<any[]> {
    const query = stage ? `?stage=${encodeURIComponent(stage)}` : '';
    const res = await fetch(`/api/sales/crm${query}`);
    if (!res.ok) throw new Error(`Failed to load CRM pipeline: ${res.statusText}`);
    return res.json();
  },

  async getCrmProspect(prospectId: string): Promise<any> {
    const res = await fetch(`/api/sales/crm/${encodeURIComponent(prospectId)}`);
    if (!res.ok) throw new Error(`Failed to load CRM prospect: ${res.statusText}`);
    return res.json();
  },

  async updateCrmStage(prospectId: string, stage: string, reason?: string): Promise<any> {
    const res = await fetch(`/api/sales/crm/${encodeURIComponent(prospectId)}/stage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, reason }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async addCrmNote(prospectId: string, note: string): Promise<any> {
    const res = await fetch(`/api/sales/crm/${encodeURIComponent(prospectId)}/note`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async getWorkspaceStatus(): Promise<{ isDemoMode: boolean; demoLoadedAt: string | null; voiceProfileFilled: boolean }> {
    const res = await fetch('/api/workspace/status');
    if (!res.ok) throw new Error(`Failed to load workspace status: ${res.statusText}`);
    return res.json();
  },

  async resetWorkspace(options?: { resetProfile?: boolean }): Promise<any> {
    const res = await fetch('/api/workspace/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async loadSampleWorkspace(): Promise<any> {
    const res = await fetch('/api/sales/load-sample', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  // Autopilot & Briefing
  async getAutopilotBriefing(): Promise<any> {
    const res = await fetch('/api/autopilot/daily-briefing');
    if (!res.ok) throw new Error(`Failed to load briefing: ${res.statusText}`);
    return res.json();
  },

  // Learning Engine
  async getLearningStore(): Promise<any> {
    const res = await fetch('/api/learning/store');
    if (!res.ok) throw new Error(`Failed to load learning store: ${res.statusText}`);
    return res.json();
  },

  async recordUserEdit(originalText: string, editedText: string, contentId: string): Promise<any> {
    const res = await fetch('/api/learning/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalText, editedText, contentId }),
    });
    if (!res.ok) throw new Error(`Failed to record edit: ${res.statusText}`);
    return res.json();
  },

  async recordUserFeedback(feedback: {
    contentId: string;
    feedbackType: string;
    topic?: string;
    format?: string;
    hook?: string;
    notes?: string;
  }): Promise<any> {
    const res = await fetch('/api/learning/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedback),
    });
    if (!res.ok) throw new Error(`Failed to record feedback: ${res.statusText}`);
    return res.json();
  },

  async getSharedOpportunities(): Promise<{ opportunities: any[] }> {
    const res = await fetch('/api/learning/opportunities');
    if (!res.ok) throw new Error(`Failed to load shared opportunities: ${res.statusText}`);
    return res.json();
  },

  async checkRepetition(params: { topic: string; hook?: string; format?: string; cta?: string }): Promise<any> {
    const res = await fetch('/api/learning/repetition-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`Failed to check repetition: ${res.statusText}`);
    return res.json();
  },

  async listExperiments(): Promise<{ experiments: any[] }> {
    const res = await fetch('/api/learning/experiments');
    if (!res.ok) throw new Error(`Failed to list experiments: ${res.statusText}`);
    return res.json();
  },

  async createExperiment(payload: any): Promise<any> {
    const res = await fetch('/api/learning/experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Failed to create experiment: ${res.statusText}`);
    return res.json();
  },

  async concludeExperiment(experimentId: string, winningVariantId: string, takeaway: string): Promise<any> {
    const res = await fetch('/api/learning/experiments/conclude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ experimentId, winningVariantId, takeaway }),
    });
    if (!res.ok) throw new Error(`Failed to conclude experiment: ${res.statusText}`);
    return res.json();
  },

  async evaluateOpportunity(subject: string, sourceDocuments?: any[]): Promise<any> {
    const res = await fetch('/api/content/opportunity-eval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, sourceDocuments }),
    });
    if (!res.ok) throw new Error(`Failed to evaluate opportunity: ${res.statusText}`);
    return res.json();
  },

  async evaluateMultiDimensionalQuality(postText: string, strategy: any, sources?: any[]): Promise<any> {
    const res = await fetch('/api/content/quality-eval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postText, strategy, sources }),
    });
    if (!res.ok) throw new Error(`Failed to evaluate quality: ${res.statusText}`);
    return res.json();
  },

  async recordPublication(payload: any): Promise<any> {
    const res = await fetch('/api/content/publish-record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Failed to record publish: ${res.statusText}`);
    return res.json();
  }
};
