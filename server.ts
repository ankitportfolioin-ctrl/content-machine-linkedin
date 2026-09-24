import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

import {
  scheduleLinkedInPost,
  postLinkedInComment,
  postLinkedInReaction,
  cancelScheduledPost,
  getRoutineLogs,
  listPlatformConnections,
  calculateScheduleSlot,
  clearRoutineLogs,
  getPubloraHealth
} from './server/publoraService';

import {
  generateAiPost,
  generateCommentReplyWithAi,
  generateContentIdeas,
  generateContentHooks,
  generateCompletePost,
  validatePostFacts,
} from './server/geminiService';

import {
  getNextRoutineAngle,
  runAutomatedDailyRoutine,
  FOUNDER_ANGLE_SLUGS
} from './server/routineManager';

import {
  getVoiceProfile,
  saveVoiceProfile,
  resetVoiceProfile,
  getWorkspaceState,
  setWorkspaceState,
  switchPersona,
} from './server/voiceProfileService';

import { discoverLatestContent } from './server/discoveryService';
import { runTrendResearch, getStoredResearch } from './server/researchJob';
import {
  generateIdeaFromTrend,
  formulateContentStrategy,
  generateStructuredPost,
  validateHookRelevance,
  validateContentStrategy,
  validateFormatFit,
  validateVisualFit,
  validateFinalContentQuality,
  PUBLIC_CONTENT_PATTERNS,
} from './server/contentEngine';
import { getWorkspaceSources, saveWorkspaceSource } from './server/trendSourceRegistry';
import { runSalesApi } from './server/salesBridge';
import {
  getLearningStore,
  saveLearningStore,
  analyzeAndRecordUserEdit,
  recordUserFeedback,
  checkContentRepetition,
  recordPublishedContent,
  deriveContentOpportunitiesFromSales,
  addSharedContentOpportunity,
  listGrowthExperiments,
  createGrowthExperiment,
  concludeGrowthExperiment,
} from './server/learningEngine';
import { generateDailyBriefing } from './server/autopilotService';
import {
  evaluateExpertiseOverlap,
  buildAudienceContext,
  evaluateContentOpportunity,
  evaluateMultiDimensionalQuality,
  pipelineArticleToContent,
  pipelineIdeaToContent,
  validateFormatExecution,
} from './server/contentStrategyEngine';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // ---- API ROUTES FIRST ----------------------------------------------------

  function extractWorkspaceId(req: express.Request): string {
    const header = req.headers['x-workspace-id'];
    if (typeof header === 'string' && header.trim()) return header.trim();
    const query = req.query.workspace_id || req.query.workspaceId;
    if (typeof query === 'string' && query.trim()) return query.trim();
    const body = req.body?.workspace_id || req.body?.workspaceId;
    if (typeof body === 'string' && body.trim()) return body.trim();
    return 'default';
  }

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      engine: 'LinkedIn Skills Studio v3',
      timestamp: new Date().toISOString()
    });
  });

  // Config status & credential diagnostics (safe: never leaks secret keys)
  app.get('/api/config', async (req, res) => {
    const publoraKey = process.env.PUBLORA_API_KEY;
    const platformId = process.env.LINKEDIN_PLATFORM_ID;
    const apifyToken = process.env.APIFY_API_TOKEN || process.env.APIFY_TOKEN;
    const geminiKey = process.env.GEMINI_API_KEY;

    let connections: any[] = [];
    let resolvedPlatformId: string | null = platformId || null;
    if (publoraKey) {
      connections = await listPlatformConnections(publoraKey);
      if (!resolvedPlatformId) {
        const found = connections
          .map((c: any) => c.platformId || c.id)
          .filter((id: any) => typeof id === 'string' && id.startsWith('linkedin-'));
        if (found.length === 1) {
          resolvedPlatformId = found[0];
        }
      }
    }

    let backend = 'manual';
    if (publoraKey && resolvedPlatformId) {
      backend = 'publora';
    } else if (process.env.LINKEDIN_SKILLS_CUSTOM_POSTER) {
      backend = 'diy';
    }

    const { localDate, scheduledUtc } = calculateScheduleSlot();

    res.json({
      backend,
      credentials: {
        publoraConfigured: !!publoraKey,
        publoraKeyPrefix: publoraKey ? `${publoraKey.slice(0, 4)}...${publoraKey.slice(-3)}` : null,
        platformIdConfigured: !!resolvedPlatformId,
        platformIdValue: resolvedPlatformId || null,
        apifyConfigured: !!apifyToken,
        geminiConfigured: !!geminiKey,
      },
      nextDefaultSlot: {
        date: localDate,
        scheduledUtc,
      },
      connectedChannels: connections,
      publoraHealth: getPubloraHealth(),
      safeMode: !publoraKey || !resolvedPlatformId,
    });
  });

  // Test configuration connections
  app.post('/api/config/test', async (req, res) => {
    const publoraKey = process.env.PUBLORA_API_KEY;
    const platformId = process.env.LINKEDIN_PLATFORM_ID;
    const geminiKey = process.env.GEMINI_API_KEY;

    const results: any = {
      publora: { status: 'unconfigured', message: 'PUBLORA_API_KEY not set' },
      gemini: { status: 'unconfigured', message: 'GEMINI_API_KEY not set' },
    };

    if (publoraKey) {
      try {
        const conns = await listPlatformConnections(publoraKey);
        const health = getPubloraHealth();
        if (health.isMaintenance) {
          results.publora = {
            status: 'maintenance',
            channelsCount: 0,
            matchedPlatformId: false,
            message: health.message || 'Publora is temporarily unavailable for scheduled maintenance. Operating in safe dry-run mode.'
          };
        } else {
          results.publora = {
            status: 'connected',
            channelsCount: conns.length,
            matchedPlatformId: conns.some((c: any) => c.platformId === platformId),
            message: `Publora connected with ${conns.length} active platform channels.`
          };
        }
      } catch (err: any) {
        results.publora = { status: 'error', message: err.message };
      }
    }

    if (geminiKey) {
      results.gemini = {
        status: 'active',
        model: 'gemini-3.8-flash',
        message: 'Gemini 3.8 Flash initialized for ghostwriting & humanization.'
      };
    }

    res.json(results);
  });

  // Schedule a LinkedIn post
  app.post('/api/linkedin/schedule', async (req, res) => {
    try {
      const { content, scheduledTime, angle, sources, dryRun } = req.body;
      const result = await scheduleLinkedInPost({
        content,
        scheduledTime,
        angle,
        sources,
        dryRun,
      });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Immediate post (or nearest 5-minute lead slot)
  app.post('/api/linkedin/post-now', async (req, res) => {
    try {
      const { content, angle, dryRun } = req.body;
      const result = await scheduleLinkedInPost({
        content,
        angle: angle || 'manual-publish',
        dryRun,
      });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Post a LinkedIn comment
  app.post('/api/linkedin/comment', async (req, res) => {
    try {
      const { postUrn, message, parentComment, dryRun } = req.body;
      const result = await postLinkedInComment({
        postUrn,
        message,
        parentComment,
        dryRun,
      });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Post a LinkedIn reaction
  app.post('/api/linkedin/reaction', async (req, res) => {
    try {
      const { postUrn, reactionType, dryRun } = req.body;
      const result = await postLinkedInReaction({
        postUrn,
        reactionType: reactionType || 'LIKE',
        dryRun,
      });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Cancel or unpublish a scheduled post
  app.delete('/api/linkedin/posts/:id', async (req, res) => {
    try {
      const result = await cancelScheduledPost(req.params.id);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Retrieve scheduling and routine history
  app.get('/api/linkedin/history', (req, res) => {
    const wsId = extractWorkspaceId(req);
    const history = getRoutineLogs(wsId);
    res.json({
      count: history.length,
      history,
    });
  });

  // Content Strategy & Generation Pipeline
  app.post('/api/content/strategy', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const {
        subject,
        sourceDocuments,
        sourceFacts,
        userIdea,
        userAssets,
        performanceData,
        customAngleOverride,
        customFormatOverride
      } = req.body;
      const profile = req.body.voiceProfile || getVoiceProfile(wsId);

      if (!subject) {
        return res.status(400).json({ error: 'Missing subject for content strategy' });
      }

      const strategy = await formulateContentStrategy({
        subject,
        sourceDocuments,
        sourceFacts,
        userIdea,
        profile,
        userAssets,
        performanceData,
        customAngleOverride,
        customFormatOverride,
      });

      res.json({ strategy });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // End-to-End Pipeline: Public Article -> Strategy -> Format -> Content -> Provenance -> Quality Gates
  app.post('/api/content/pipeline/article', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const { url, simulateAiFailure, fallbackArticle } = req.body;
      if (!url) {
        return res.status(400).json({ error: 'Missing article url' });
      }
      const profile = req.body.voiceProfile || getVoiceProfile(wsId);
      const result = await pipelineArticleToContent(url, profile, {
        simulateAiFailure: Boolean(simulateAiFailure),
        fallbackArticle,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // End-to-End Pipeline: User Idea -> Autonomous Strategy -> Format -> Content -> Provenance -> Quality Gates
  app.post('/api/content/pipeline/idea', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const { idea, simulateAiFailure } = req.body;
      if (!idea || typeof idea !== 'string') {
        return res.status(400).json({ error: 'Missing idea string' });
      }
      const profile = req.body.voiceProfile || getVoiceProfile(wsId);
      const result = await pipelineIdeaToContent(idea, profile, {
        simulateAiFailure: Boolean(simulateAiFailure),
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Carousel & Document Format Inspection and Quality Validation Gate
  app.post('/api/content/carousel/validate', (req, res) => {
    try {
      const { execution } = req.body;
      const val = validateFormatExecution('CAROUSEL_DOCUMENT', execution);
      res.json(val);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Persona Switching (Tech Creator <-> D2C Founder) with Clean Context Isolation
  app.post('/api/persona/switch', (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const { persona } = req.body;
      if (!persona || !['TECH_CREATOR', 'D2C_FOUNDER'].includes(persona)) {
        return res.status(400).json({ error: 'persona must be TECH_CREATOR or D2C_FOUNDER' });
      }
      const switched = switchPersona(persona, wsId);
      res.json({ success: true, persona, profile: switched });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Bridge: Sales Friction/Objections -> Content Opportunities
  app.post('/api/bridge/sales-to-content', (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const { objectionText, prospectName, company } = req.body;
      if (!objectionText) {
        return res.status(400).json({ error: 'Missing objectionText' });
      }
      const profile = getVoiceProfile(wsId);
      const opp = addSharedContentOpportunity(
        {
          suggestedTopic: `Navigating: ${objectionText.slice(0, 60)}`,
          targetAudience: profile.audience || 'Target Buyers',
          recommendedFormat: 'CAROUSEL_DOCUMENT',
          businessObjective: 'CONVERSION',
          originContext: `Sales objection from ${prospectName || 'prospect'} (${company || 'target company'}): "${objectionText}"`,
          suggestedAngle: `Technical breakdown addressing "${objectionText}" directly with architectural trade-offs.`,
        },
        wsId
      );
      res.json({ success: true, opportunity: opp });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Bridge: Content Topic -> Targeted Outreach Matching
  app.post('/api/bridge/content-to-sales', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const { contentTopic, contentText } = req.body;
      if (!contentTopic) {
        return res.status(400).json({ error: 'Missing contentTopic' });
      }
      let prospects: any[] = [];
      try {
        const pRes = await runSalesApi('list-prospects', {}, wsId);
        prospects = Array.isArray(pRes) ? pRes : (pRes.prospects || []);
      } catch {}

      const topicKeywords = contentTopic.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
      const matched = prospects.filter((p: any) => {
        const pStr = `${p.name} ${p.job_title} ${p.company} ${p.industry} ${JSON.stringify(p.research || {})}`.toLowerCase();
        return topicKeywords.some((kw: string) => pStr.includes(kw));
      });

      const targets = (matched.length > 0 ? matched : prospects.slice(0, 3)).map((p: any) => ({
        prospectId: p.id,
        name: p.name,
        company: p.company,
        jobTitle: p.job_title,
        suggestedReference: `Saw you're building ${p.company}—we just published an architectural breakdown on "${contentTopic}" that maps out the exact trade-offs you might be navigating right now.`,
      }));

      res.json({
        contentTopic,
        matchedCount: targets.length,
        targets,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/content/strategy/patterns', (req, res) => {
    res.json({ patterns: PUBLIC_CONTENT_PATTERNS });
  });

  app.post('/api/content/validate-hook', (req, res) => {
    try {
      const { hook, subject, angle, strategy } = req.body;
      if (!hook || !subject) {
        return res.status(400).json({ error: 'Missing hook or subject' });
      }
      const result = validateHookRelevance(hook, subject, angle || 'General', strategy);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/content/ideas', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const profile = req.body.voiceProfile || getVoiceProfile(wsId);
      const ideas = await generateContentIdeas(profile, wsId);
      res.json({ ideas });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/content/hooks', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const { idea } = req.body;
      const profile = req.body.voiceProfile || getVoiceProfile(wsId);
      if (!idea) {
        return res.status(400).json({ error: 'Missing idea payload' });
      }
      const hooks = await generateContentHooks(idea, profile);
      res.json({ hooks, strategy: idea.strategy });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/content/complete-post', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const { idea, hook, customNotes, sourceContext, includeSources, sources, strategy } = req.body;
      const profile = req.body.voiceProfile || getVoiceProfile(wsId);
      if (!idea || !hook) {
        return res.status(400).json({ error: 'Missing idea or hook payload' });
      }
      const result = await generateCompletePost({
        idea,
        hook,
        profile,
        customNotes,
        sourceContext,
        includeSources,
        sources,
        strategy,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/content/validate', (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const { post, sourceDocuments, extractedFacts } = req.body;
      const profile = req.body.voiceProfile || getVoiceProfile(wsId);
      const validation = validatePostFacts(post || '', profile, sourceDocuments, extractedFacts);
      res.json(validation);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Web Trend Intelligence Endpoints ---

  app.get('/api/content/trends', (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const store = getStoredResearch(wsId);
      res.json({
        trends: store.trends,
        status: store.status,
        discoveredAt: store.discoveredAt,
        documentCount: store.documents.length,
        sourceCount: store.status.sourcesScanned,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/content/trends/:id', (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const store = getStoredResearch(wsId);
      const trend = store.trends.find((t) => t.id === req.params.id);
      if (!trend) {
        return res.status(404).json({ error: 'Trend cluster not found' });
      }
      res.json(trend);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/content/research', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const { mode, topic, url, maxSources } = req.body;
      const store = await runTrendResearch(wsId, { mode, topic, url, maxSources });
      res.json(store);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/content/research/status', (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const store = getStoredResearch(wsId);
      res.json(store.status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/content/research/diagnostics', (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const store = getStoredResearch(wsId);
      res.json(store.diagnostics || {
        researchRunId: 'none',
        startedAt: null,
        completedAt: null,
        durationMs: 0,
        topics: [],
        sourcesAttempted: 0,
        sourcesSucceeded: 0,
        sourcesFailed: 0,
        documentsFetched: 0,
        documentsNormalized: 0,
        documentsDeduplicated: 0,
        trendClustersCreated: 0,
        errors: [],
        sourceReports: [],
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/content/ideas/from-trend', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const { trend, angle, strategy: passedStrategy } = req.body;
      const profile = req.body.voiceProfile || getVoiceProfile(wsId);
      if (!trend || !angle) {
        return res.status(400).json({ error: 'Missing trend or angle payload' });
      }
      const strategy = passedStrategy || await formulateContentStrategy({
        subject: trend.title,
        sourceDocuments: trend.sources,
        profile,
        customAngleOverride: angle.type,
      });
      const idea = generateIdeaFromTrend(trend, angle, profile, strategy);
      res.json({ idea, strategy });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/content/research-url', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'Missing URL parameter' });
      const store = await runTrendResearch(wsId, { mode: 'URL_RESEARCH', url });
      res.json(store);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/content/sources', (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const sources = getWorkspaceSources(wsId);
      res.json({ sources });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/content/sources', (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const saved = saveWorkspaceSource(req.body, wsId);
      res.json({ source: saved });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Content Machine 2.0 Strategy Engine Endpoints ---

  app.get('/api/strategy/patterns', (req, res) => {
    res.json({ patterns: PUBLIC_CONTENT_PATTERNS });
  });

  app.post('/api/strategy/formulate', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const { subject, sourceDocuments, userAssets, customAngleOverride, voiceProfile } = req.body;
      const profile = voiceProfile || getVoiceProfile(wsId);
      if (!subject || typeof subject !== 'string') {
        return res.status(400).json({ error: 'Missing subject parameter' });
      }
      const strategy = await formulateContentStrategy({
        subject,
        sourceDocuments,
        userAssets,
        customAngleOverride,
        profile,
      });

      const strategyVal = validateContentStrategy(strategy);
      const formatFit = validateFormatFit(strategy, subject, userAssets);
      const visualFit = validateVisualFit(strategy);

      res.json({
        strategy,
        qualityGate: {
          strategyValid: strategyVal.isValid,
          strategyErrors: strategyVal.errors,
          formatFit: formatFit.isFit,
          formatReason: formatFit.reason,
          visualFit: visualFit.isFit,
          visualReason: visualFit.reason,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/strategy/validate-hook', (req, res) => {
    try {
      const { hookText, subject, angle, strategy } = req.body;
      if (!hookText || !subject) {
        return res.status(400).json({ error: 'Missing hookText or subject' });
      }
      const validation = validateHookRelevance(hookText, subject, angle || 'GENERAL', strategy);
      res.json(validation);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/strategy/generate-post', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const { strategy, hook, customNotes, sourceContext, includeSources, sources, voiceProfile } = req.body;
      const profile = voiceProfile || getVoiceProfile(wsId);
      if (!strategy || !hook) {
        return res.status(400).json({ error: 'Missing strategy or hook payload' });
      }
      const result = await generateStructuredPost({
        strategy,
        hook,
        profile,
        customNotes,
        sourceContext,
        includeSources,
        sources,
      });

      const qualityCheck = validateFinalContentQuality(result.post, strategy, profile, sources);

      res.json({
        ...result,
        finalQualityCheck: qualityCheck,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/strategy/validate-quality', (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const { postText, strategy, voiceProfile, sources } = req.body;
      const profile = voiceProfile || getVoiceProfile(wsId);
      if (!postText || !strategy) {
        return res.status(400).json({ error: 'Missing postText or strategy payload' });
      }
      const qualityCheck = validateFinalContentQuality(postText, strategy, profile, sources);
      res.json(qualityCheck);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // AI Ghostwriting generation
  app.post('/api/ai/generate-post', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const { topic, formulaCode, formulaName, angleCode, angleName, receipts, targetAudience, voiceProfile, idea, hook } = req.body;
      const effectiveVoiceProfile = voiceProfile || getVoiceProfile(wsId);
      const result = await generateAiPost({
        topic,
        formulaCode,
        formulaName,
        angleCode,
        angleName,
        receipts,
        targetAudience,
        voiceProfile: effectiveVoiceProfile,
        idea,
        hook,
        workspaceId: wsId,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // AI Comment Reply generator
  app.post('/api/ai/reply', async (req, res) => {
    try {
      const { comment, commenterName, formulaCode, postContext } = req.body;
      const result = await generateCommentReplyWithAi({
        comment,
        commenterName,
        formulaCode,
        postContext,
      });
      res.json({ reply: result.reply, modelUsed: result.modelUsed });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Routine Status: next angle, weekly plan
  app.get('/api/routine/status', (req, res) => {
    const wsId = extractWorkspaceId(req);
    const nextAngle = getNextRoutineAngle();
    const history = getRoutineLogs(wsId);
    res.json({
      nextAngle,
      allAngles: FOUNDER_ANGLE_SLUGS,
      totalScheduledInRoutine: history.length,
      lastRun: history[0] || null,
    });
  });

  // Discover fresh public-source items that match the configured content pillars.
  app.get('/api/discovery/latest', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const profile = getVoiceProfile(wsId);
      const requestedPillars = typeof req.query.pillars === 'string'
        ? req.query.pillars.split(',').map(value => value.trim()).filter(Boolean)
        : profile.contentPillars;
      const result = await discoverLatestContent({ pillars: requestedPillars, limit: 18 });
      res.json(result);
    } catch (err: any) {
      res.status(502).json({ error: `Content discovery failed: ${err.message}` });
    }
  });

  // 1-Click Run Automated Daily Routine
  app.post('/api/routine/run-daily', async (req, res) => {
    try {
      const { topic, pillar, receipts, dryRun, scheduledTime } = req.body;
      const result = await runAutomatedDailyRoutine({
        topic,
        pillar,
        receipts,
        dryRun,
        scheduledTime,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Voice & Content Preferences Profile
  app.get('/api/voice-profile', (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const profile = getVoiceProfile(wsId);
      res.json(profile);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/voice-profile', (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const updated = saveVoiceProfile(req.body, wsId);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // SALES COPILOT API BOUNDARY
  // ==========================================

  // Dashboard & Briefing
  app.get('/api/sales/dashboard', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('dashboard', req.query, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/sales/daily-briefing', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('daily-briefing', req.query, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Autopilot & Daily Growth Briefing
  app.get('/api/autopilot/daily-briefing', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const briefing = await generateDailyBriefing(wsId);
      res.json(briefing);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Learning Engine & Memory
  app.get('/api/learning/store', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const store = getLearningStore(wsId);
      res.json(store);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/learning/edit', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const { originalText, editedText, contentId } = req.body;
      const record = analyzeAndRecordUserEdit(originalText || '', editedText || '', contentId || 'draft', wsId);
      res.json(record);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/learning/feedback', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const record = recordUserFeedback(req.body, wsId);
      res.json(record);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/learning/opportunities', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const opps = deriveContentOpportunitiesFromSales(wsId);
      res.json({ opportunities: opps });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/learning/repetition-check', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const result = checkContentRepetition(req.body, wsId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/learning/experiments', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const experiments = listGrowthExperiments(wsId);
      res.json({ experiments });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/learning/experiments', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const exp = createGrowthExperiment(req.body, wsId);
      res.json(exp);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/learning/experiments/conclude', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const { experimentId, winningVariantId, takeaway } = req.body;
      const exp = concludeGrowthExperiment(experimentId, winningVariantId, takeaway, wsId);
      res.json(exp);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Content Quality & Opportunity Evaluation
  app.post('/api/content/opportunity-eval', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const profile = getVoiceProfile(wsId);
      const { subject, sourceDocuments } = req.body;
      const evaluation = evaluateContentOpportunity(subject || '', sourceDocuments, profile);
      res.json(evaluation);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/content/quality-eval', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const profile = getVoiceProfile(wsId);
      const { postText, strategy, sources } = req.body;
      const scorecard = evaluateMultiDimensionalQuality(postText || '', strategy, profile, sources);
      res.json(scorecard);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/content/publish-record', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      recordPublishedContent(req.body, wsId);
      res.json({ recorded: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Prospects
  app.get('/api/sales/prospects', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('list-prospects', req.query, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sales/prospects/discover', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('discover-prospects', req.body, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sales/prospects/qualify', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('qualify-prospect', req.body, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sales/prospects/research', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('research-prospect', req.body, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sales/prospects/save', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('save-prospect', req.body, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Outreach & Approvals
  app.post('/api/sales/outreach/draft', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('draft-outreach', req.body, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/sales/outreach/pending', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('list-pending', req.query, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sales/outreach/approve', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('approve-outreach', req.body, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sales/outreach/reject', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('reject-outreach', req.body, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sales/outreach/execute', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('execute-outreach', req.body, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sales/outreach/card', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('create-approval', req.body, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Inbox & Next Action
  app.get('/api/sales/inbox', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('inbox-list', req.query, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sales/inbox/classify', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('inbox-classify', req.body, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sales/inbox/next-action', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('inbox-next-action', req.body, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // CRM Pipeline
  app.get('/api/sales/crm', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('crm-list', req.query, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sales/crm/save', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('save-crm', req.body, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/sales/crm/:id', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('crm-get', { prospect_id: req.params.id }, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sales/crm/:id/stage', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('crm-stage', {
        prospect_id: req.params.id,
        stage: req.body.stage,
        reason: req.body.reason,
      }, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sales/crm/:id/note', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('crm-note', {
        prospect_id: req.params.id,
        note: req.body.note,
      }, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Content Drafts (Calendar & Repository)
  app.get('/api/sales/drafts', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('list-drafts', req.query, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sales/drafts', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('save-draft', req.body, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Analytics Engine
  app.get('/api/sales/analytics', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const data = await runSalesApi('analytics', req.query, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Sales copilot workspace reset
  app.post('/api/sales/reset', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      setWorkspaceState({ isDemoMode: false, demoLoadedAt: null }, wsId);
      const data = await runSalesApi('reset-workspace', req.body, wsId);
      clearRoutineLogs(wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Load sample demo workspace (Testing / Sandbox only)
  app.post('/api/sales/load-sample', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      setWorkspaceState({ isDemoMode: true, demoLoadedAt: new Date().toISOString() }, wsId);
      const data = await runSalesApi('load-sample-workspace', req.body, wsId);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Full workspace reset (sales data + routine logs + optionally voice profile)
  app.post('/api/workspace/reset', async (req, res) => {
    try {
      const wsId = extractWorkspaceId(req);
      const { resetProfile } = req.body || {};
      setWorkspaceState({ isDemoMode: false, demoLoadedAt: null }, wsId);
      clearRoutineLogs(wsId);
      const salesResult = await runSalesApi('reset-workspace', {}, wsId);
      let profileResult = null;
      if (resetProfile) {
        profileResult = resetVoiceProfile(wsId);
      }
      res.json({
        status: 'ok',
        sales: salesResult,
        profile: profileResult,
        message: 'Workspace reset complete. All data restored to authentic state.'
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/workspace/status', (req, res) => {
    const wsId = extractWorkspaceId(req);
    const state = getWorkspaceState(wsId);
    const profile = getVoiceProfile(wsId);
    res.json({
      isDemoMode: state.isDemoMode,
      demoLoadedAt: state.demoLoadedAt || null,
      voiceProfileFilled: profile.filled,
    });
  });

  // ---- VITE MIDDLEWARE -----------------------------------------------------

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LinkedIn Skills Studio server running on port ${PORT}`);
  });
}

startServer();
