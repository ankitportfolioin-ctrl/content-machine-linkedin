import { GoogleGenAI } from '@google/genai';
import { getVoiceProfile, VoiceProfile } from './voiceProfileService';
import { checkContentOriginality, checkSourceSimilarity, SimilarityAnalysis } from './trendIntelligence';
import {
  ContentStrategy,
  ContentType,
  ContentFormat,
  VisualType,
  VisualStrategy,
  formulateContentStrategy,
  generateStructuredPost,
  validateHookRelevance,
  validateContentStrategy,
  validateFormatFit,
  validateVisualFit,
  validateFinalContentQuality,
  PUBLIC_CONTENT_PATTERNS,
  extractSourceFacts,
  StructuredPostResult,
} from './contentStrategyEngine';

export type {
  ContentStrategy,
  ContentType,
  ContentFormat,
  VisualType,
  VisualStrategy,
};

export {
  formulateContentStrategy,
  generateStructuredPost,
  validateHookRelevance,
  validateContentStrategy,
  validateFormatFit,
  validateVisualFit,
  validateFinalContentQuality,
  PUBLIC_CONTENT_PATTERNS,
  extractSourceFacts,
};

export interface ContentIdea {
  id: string;
  idea: string;
  targetPillar: string;
  intendedAudience: string;
  angle: string;
  structure: string;
  summary: string;
  trendId?: string;
  sourceReferences?: any[];
  provenance?: any;
  strategy?: ContentStrategy;
}

export interface ContentHook {
  id: string;
  hook: string;
  angleName: string;
  characterCount: number;
}

export type FactProvenance =
  | 'VERIFIED_SOURCE'
  | 'VERIFIED_USER_RECEIPT'
  | 'VERIFIED_INTERNAL_DATA'
  | 'USER_ENTERED'
  | 'ESTIMATED'
  | 'UNAVAILABLE';

export type ClaimClassification =
  | 'SUPPORTED_BY_SOURCE'
  | 'USER_VERIFIED_RECEIPT'
  | 'GENERAL_KNOWLEDGE'
  | 'UNSUPPORTED'
  | 'UNCERTAIN'
  | 'SUPPORTED_USER_FACT'
  | 'UNSUPPORTED_PERSONAL_CLAIM'
  | 'UNSUPPORTED_STATISTIC';

export interface FactualClaim {
  claim: string;
  classification: ClaimClassification;
  explanation: string;
  provenance: FactProvenance;
  replacement?: string;
}

export interface FactValidationResult {
  isValid: boolean;
  validatedPost: string;
  claims: FactualClaim[];
  unsupportedCount: number;
  unsupportedClaimsCount?: number;
  leakageDetected: boolean;
  leakageDetails: string[];
}

let aiClient: GoogleGenAI | null = null;
let lastQuotaExceededAt = 0;

function getAiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

const CANDIDATE_FAST_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'];

/**
 * Execute Gemini call with fallback models and 10s timeout.
 */
async function callGeminiFast(prompt: string, maxTokens: number = 1800): Promise<{ text: string; model: string } | null> {
  const client = getAiClient();
  if (!client) return null;

  // If quota was exhausted recently, short-circuit immediately to avoid UI delay
  if (Date.now() - lastQuotaExceededAt < 60000) {
    return null;
  }

  for (const candidateModel of CANDIDATE_FAST_MODELS) {
    try {
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('AI generation timed out')), 8000)
      );

      const callPromise = client.models.generateContent({
        model: candidateModel,
        contents: prompt,
        config: {
          temperature: 0.7,
          maxOutputTokens: maxTokens,
        },
      }).then((res) => ({ text: res.text?.trim() || '', model: candidateModel }));

      const res = await Promise.race([callPromise, timeoutPromise]);
      if (res && res.text) return res;
    } catch (err: any) {
      const isTransient =
        err.message?.includes('429') ||
        err.message?.includes('RESOURCE_EXHAUSTED') ||
        err.message?.includes('503') ||
        err.message?.includes('UNAVAILABLE') ||
        err.message?.includes('high demand') ||
        err.message?.includes('timed out');

      if (isTransient) {
        continue;
      }
      break;
    }
  }

  lastQuotaExceededAt = Date.now();
  console.info('[ContentEngine] Gemini models temporarily busy. Engaging grounded fallback ideas.');
  return null;
}

/**
 * Clean audience string so it defines an appropriate focal audience
 * without dumping an entire 10-item raw ICP list.
 */
export function getFocusedAudience(profile: VoiceProfile): string {
  if (!profile.audience) return 'Developers and technical builders';
  const parts = profile.audience
    .split(/,|\band\b/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 2) return profile.audience;
  return `${parts[0]} and ${parts[1]}`;
}

/**
 * Detects if the text contains raw internal settings leaks:
 * - Literal role descriptions
 * - Multi-role ICP dump strings
 * - Unsupported "first comment" boilerplate
 */
export function detectContextLeakage(
  text: string,
  profile: VoiceProfile
): { detected: boolean; details: string[] } {
  const details: string[] = [];
  const lower = text.toLowerCase();

  // 1. Role verbatim leak check
  if (profile.role && profile.role.trim().length > 15) {
    const roleLower = profile.role.toLowerCase().trim();
    if (lower.includes(roleLower)) {
      details.push(`Literal Profile & Voice role string detected: "${profile.role.slice(0, 60)}..."`);
    } else {
      // Check for significant subphrase
      const chunks = profile.role.split(/,|&|\./).map((c) => c.trim().toLowerCase()).filter((c) => c.length > 20);
      for (const chunk of chunks) {
        if (lower.includes(chunk)) {
          details.push(`Internal role sub-phrase detected: "${chunk.slice(0, 50)}..."`);
          break;
        }
      }
    }
  }

  // 2. Audience / ICP dump check
  if (profile.audience && (profile.audience.includes(',') || profile.audience.length > 25)) {
    const audienceLower = profile.audience.toLowerCase().trim();
    if (lower.includes(audienceLower)) {
      details.push('Literal audience/ICP raw string list dumped verbatim.');
    } else {
      // Check if 3 or more comma-separated role titles appear in one sentence
      const roles = profile.audience.split(',').map((r) => r.trim().toLowerCase()).filter(Boolean);
      let count = 0;
      for (const r of roles) {
        if (new RegExp(`\\b${escapeRegex(r)}\\b`, 'i').test(lower)) count++;
      }
      if (count >= 3) {
        details.push(`Raw ICP role list detected (${count} roles matched in post text).`);
      }
    }
  }

  // 3. Fake "first comment" leak
  if (
    lower.includes('in the first comment') ||
    lower.includes('details are in the first comment') ||
    lower.includes('link in the first comment') ||
    lower.includes('link in comments')
  ) {
    details.push('Automated "first comment" promise detected without user asset.');
  }

  return {
    detected: details.length > 0,
    details,
  };
}

/**
 * Fact Validation & Anti-Hallucination Engine:
 * Scans text for numerical claims, statistical metrics, and personal assertions.
 * Classifies them, flags unsupported claims, and produces a sanitized, validated post.
 * Supports claims verified by EITHER user profile receipts OR source documents/evidence.
 */
export function validatePostFacts(
  postText: string,
  profile: VoiceProfile,
  sourceDocuments?: { title?: string; body?: string; text?: string; description?: string; snippet?: string; url?: string }[],
  extractedFacts?: { evidence?: string[]; importantFacts?: string[]; centralClaim?: string }
): FactValidationResult {
  const claims: FactualClaim[] = [];
  const verifiedReceipts = (profile.keyReceipts || []).map((r) => r.toLowerCase().trim());
  const signatureExamples = (profile.signatureExamples || []).map((s) => s.toLowerCase().trim());
  const allUserVerified = [...verifiedReceipts, ...signatureExamples];

  // Aggregate source documents text for source evidence verification
  const sourceEvidenceList = (extractedFacts?.evidence || []).map((e) => e.toLowerCase().trim());
  const sourceDocsFullText = (sourceDocuments || [])
    .map((d) => `${d.title || ''} ${d.body || d.text || d.description || d.snippet || ''}`.toLowerCase())
    .join(' ');

  let sanitized = postText;

  // 1. Remove Context Leakage if any exists (silently clean without injecting alien persona words)
  if (profile.role) {
    sanitized = sanitized.replace(new RegExp(`(?:In our work as|Working as(?: a| an)?|As a|As an)\\s+${escapeRegex(profile.role)}[;,]?\\s*`, 'gi'), '');
    sanitized = sanitized.replace(new RegExp(`^${escapeRegex(profile.role)}[;,:]\\s*`, 'gim'), '');
  }

  // Remove raw ICP lists if present
  if (profile.audience) {
    sanitized = sanitized.replace(new RegExp(`(?:When working with|When collaborating with|For)\\s+${escapeRegex(profile.audience)}[;,]?\\s*`, 'gi'), '');
    sanitized = sanitized.replace(new RegExp(`(?:approach for)\\s+${escapeRegex(profile.audience)}[;,:]?\\s*`, 'gi'), 'approach: ');
  }

  // Remove fake first comment boilerplate
  sanitized = sanitized.replace(/\n*P\.S\.\s*(?:Details|Links?|Resource|Check the)[^\n]*first comment[^\n]*/gi, '');
  sanitized = sanitized.replace(/\n*(?:Details|Link|Resource) (?:are |is )?in the (?:first )?comment[^\n]*/gi, '');

  const leakage = detectContextLeakage(sanitized, profile);

  // 2. Identify and classify claims
  const paragraphs = sanitized.split(/\n+/).map((p) => p.trim()).filter(Boolean);

  for (const para of paragraphs) {
    // Check for numerical / statistical claims (percentages, multipliers, currency, metrics)
    const statMatches = para.match(/\$\d+(?:\.\d+)?(?:\s*(?:billion|million|trillion|B|M|k))?|\b\d+(?:\.\d+)?%|\b\d+x\b|\b\d+\s*(?:hours|minutes|seconds|days|weeks|months)\b|\b\d{1,3}(?:,\d{3})+\b/gi);
    if (statMatches && statMatches.length > 0) {
      for (const match of statMatches) {
        const matchLower = match.toLowerCase();
        const isUserSupported = allUserVerified.some((rec) => rec.includes(matchLower));
        const isSourceSupported =
          sourceEvidenceList.some((e) => e.includes(matchLower) || matchLower.includes(e)) ||
          sourceDocsFullText.includes(matchLower);

        if (isUserSupported) {
          claims.push({
            claim: `Statistic: "${match}" in context: "${para.slice(0, 70)}..."`,
            classification: 'SUPPORTED_USER_FACT',
            explanation: 'Supported by stored user verified receipt or proof point.',
            provenance: 'VERIFIED_USER_RECEIPT',
          });
        } else if (isSourceSupported) {
          claims.push({
            claim: `Source statistic: "${match}" in context: "${para.slice(0, 70)}..."`,
            classification: 'SUPPORTED_BY_SOURCE',
            explanation: 'Supported by source documents or extracted trend evidence.',
            provenance: 'VERIFIED_SOURCE',
          });
        } else {
          // Truly unsupported statistic
          claims.push({
            claim: `Unverified metric: "${match}" in "${para.slice(0, 70)}..."`,
            classification: 'UNSUPPORTED_STATISTIC',
            explanation: 'Metric not present in user receipts or source documents.',
            provenance: 'UNAVAILABLE',
            replacement: 'Qualitative educational statement',
          });
        }
      }
    }

    // Check specifically for research/study sample claims: "We analyzed 40 B2B founders...", "Surveyed 100 leaders..."
    const studyMatch = para.match(/(?:we|i)\s+(?:analyzed|studied|audited|reviewed|surveyed|interviewed)\s+(\d+)\s+([a-zA-Z\s]+)/i);
    if (studyMatch) {
      const matchLower = studyMatch[0].toLowerCase();
      const isUserSupported = allUserVerified.some((rec) => rec.includes(matchLower) || rec.includes(studyMatch[1]));
      const isSourceSupported = sourceDocsFullText.includes(matchLower) || sourceDocsFullText.includes(studyMatch[1]);
      if (isUserSupported) {
        claims.push({
          claim: `Study claim: "${studyMatch[0]}"`,
          classification: 'SUPPORTED_USER_FACT',
          explanation: 'Supported by user verified study receipts.',
          provenance: 'VERIFIED_USER_RECEIPT',
        });
      } else if (isSourceSupported) {
        claims.push({
          claim: `Source study claim: "${studyMatch[0]}"`,
          classification: 'SUPPORTED_BY_SOURCE',
          explanation: 'Supported by source research evidence.',
          provenance: 'VERIFIED_SOURCE',
        });
      } else {
        claims.push({
          claim: `Unsupported study/sample claim: "${studyMatch[0]}"`,
          classification: 'UNSUPPORTED_STATISTIC',
          explanation: 'Sample size or analysis count not verified by source or receipts.',
          provenance: 'UNAVAILABLE',
          replacement: 'Qualitative domain observation',
        });
      }
    }

    // Check specifically for revenue/ARR claims: "$1M ARR", "$500k MRR"
    const arrMatch = para.match(/\$(\d+(?:\.\d+)?\s*(?:k|m|b|million|billion)?)\s*(?:in\s+)?(?:arr|mrr|revenue|valuation|sales)/i);
    if (arrMatch) {
      const matchLower = arrMatch[0].toLowerCase();
      const isUserSupported = allUserVerified.some((rec) => rec.includes(matchLower) || rec.includes(arrMatch[1].toLowerCase()));
      const isSourceSupported = sourceDocsFullText.includes(matchLower);
      if (!isUserSupported && !isSourceSupported) {
        claims.push({
          claim: `Unsupported financial claim: "${arrMatch[0]}"`,
          classification: 'UNSUPPORTED_STATISTIC',
          explanation: 'Revenue/ARR figure not verified by receipts or source.',
          provenance: 'UNAVAILABLE',
          replacement: 'Sustainable revenue growth',
        });
      }
    }

    // Check specifically for conversion/response rate jumps: "Response rate jumps from 1.5% to 24%"
    const rateJumpMatch = para.match(/(?:response|conversion|open|reply)\s+rate\s+jumps?\s+(?:from\s+[\d.]+%?\s+to\s+[\d.]+%?)/i) ||
      para.match(/\bfrom\s+(\d+(?:\.\d+)?%?)\s+to\s+(\d+(?:\.\d+)?%?)\b/i);
    if (rateJumpMatch && (para.toLowerCase().includes('rate') || para.toLowerCase().includes('jump') || para.toLowerCase().includes('increase'))) {
      const matchLower = rateJumpMatch[0].toLowerCase();
      const isUserSupported = allUserVerified.some((rec) => rec.includes(matchLower));
      const isSourceSupported = sourceDocsFullText.includes(matchLower);
      if (!isUserSupported && !isSourceSupported) {
        claims.push({
          claim: `Unsupported metric jump: "${rateJumpMatch[0]}"`,
          classification: 'UNSUPPORTED_STATISTIC',
          explanation: 'Conversion/response rate jump not verified.',
          provenance: 'UNAVAILABLE',
          replacement: 'Measurable improvement in engagement',
        });
      }
    }

    // Check specifically for hiring/chronology claims: "In 2024, I hired...", "I hired 5 engineers..."
    const hireMatch = para.match(/\bin\s+(20\d\d),\s*(?:i|we)\s+hired\b/i) ||
      para.match(/\b(?:i|we)\s+hired\s+(\d+)\s+([a-zA-Z\s]+)/i);
    if (hireMatch) {
      const matchLower = hireMatch[0].toLowerCase();
      const isUserSupported = allUserVerified.some((rec) => rec.includes(matchLower));
      if (!isUserSupported) {
        claims.push({
          claim: `Unsupported hiring claim: "${hireMatch[0]}"`,
          classification: 'UNSUPPORTED_PERSONAL_CLAIM',
          explanation: 'Hiring history not verified by user receipts.',
          provenance: 'UNAVAILABLE',
          replacement: 'When staffing and scaling operations',
        });
      }
    }

    // Check specifically for outcome claims: "zero closed meetings", "5 closed meetings"
    const meetingsMatch = para.match(/\b(?:zero|\d+)\s+closed\s+meetings\b/i) ||
      para.match(/\b(?:zero|\d+)\s+booked\s+(?:calls|meetings|demos)\b/i);
    if (meetingsMatch) {
      const matchLower = meetingsMatch[0].toLowerCase();
      const isUserSupported = allUserVerified.some((rec) => rec.includes(matchLower));
      const isSourceSupported = sourceDocsFullText.includes(matchLower);
      if (!isUserSupported && !isSourceSupported) {
        claims.push({
          claim: `Unsupported meeting outcome claim: "${meetingsMatch[0]}"`,
          classification: 'UNSUPPORTED_PERSONAL_CLAIM',
          explanation: 'Closed/booked meetings metric not verified by receipts or source.',
          provenance: 'UNAVAILABLE',
          replacement: 'without qualified discovery conversations',
        });
      }
    }

    // Check for personal experience claims
    const personalClaimTriggers = [
      'in our work',
      'i reduced',
      'we reduced',
      'i increased',
      'we increased',
      'our customers',
      'our team',
      'we saved',
      'i saved',
      'our api bill',
      'our users',
      'we achieved',
      'i achieved',
      'our implementation',
      'in our verified operational tracking',
      'our operational tracking',
      'in our tracking',
    ];

    for (const trigger of personalClaimTriggers) {
      const triggerRegex = new RegExp(`\\b${escapeRegex(trigger)}\\b`, 'i');
      if (triggerRegex.test(para)) {
        // A personal claim is ONLY supported if a verified receipt specifically matches substantive keywords of this sentence
        const paraWords = para.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
        const matchingReceipt = allUserVerified.find((rec) => {
          const recWords = rec.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
          const matchCount = paraWords.filter((pw) => recWords.includes(pw)).length;
          return matchCount >= 2;
        });

        if (matchingReceipt) {
          claims.push({
            claim: `Personal experience: "${para.slice(0, 70)}..."`,
            classification: 'SUPPORTED_USER_FACT',
            explanation: `Matches verified user receipt: "${matchingReceipt.slice(0, 45)}..."`,
            provenance: 'VERIFIED_USER_RECEIPT',
          });
        } else {
          claims.push({
            claim: `Personal claim without receipt: "${para.slice(0, 70)}..."`,
            classification: 'UNSUPPORTED_PERSONAL_CLAIM',
            explanation: 'Personal/operational outcome claim without matching verified receipt.',
            provenance: 'UNAVAILABLE',
            replacement: 'Objective educational principle',
          });
        }
      }
    }
  }

  // 3. Clean and rewrite ONLY unsupported numbers or claims into qualitative principles
  // Replace ungrounded "64% of ... disappears"
  sanitized = sanitized.replace(/\b\d+%\s+of\s+([a-zA-Z\s]+)\s+disappears\b/gi, (orig, subject) => {
    const isSupported = allUserVerified.some((rec) => orig.toLowerCase().includes(rec)) ||
      sourceDocsFullText.includes(orig.toLowerCase());
    return isSupported ? orig : `A substantial amount of ${subject} disappears`;
  });

  // Replace unsupported percentages
  sanitized = sanitized.replace(/\b(\d+(?:\.\d+)?)%/g, (match) => {
    const matchLower = match.toLowerCase();
    const isSupported = allUserVerified.some((rec) => rec.includes(matchLower)) ||
      sourceEvidenceList.some((e) => e.includes(matchLower)) ||
      sourceDocsFullText.includes(matchLower);
    return isSupported ? match : 'a significant portion';
  });

  // Replace unsupported Nx improvement
  sanitized = sanitized.replace(/\b(\d+)x\s+improvement\b/gi, (match) => {
    const matchLower = match.toLowerCase();
    const isSupported = allUserVerified.some((rec) => rec.includes(matchLower)) ||
      sourceEvidenceList.some((e) => e.includes(matchLower)) ||
      sourceDocsFullText.includes(matchLower);
    return isSupported ? match : 'noticeable, measurable improvement';
  });

  // Replace ungrounded "Turnaround times dropped from hours to minutes"
  sanitized = sanitized.replace(/Turnaround times dropped from hours to minutes[.,]?/gi, 'Workflows become significantly faster, cleaner, and easier to maintain.');
  sanitized = sanitized.replace(/dropped from hours to minutes[.,]?/gi, 'speed up substantially');

  // Replace "Direct data shows an immediate 3x improvement..."
  sanitized = sanitized.replace(/Direct data shows an immediate \d+x improvement in turnaround once manual friction is removed\./gi, 'Removing manual friction consistently yields cleaner handoffs and faster turnaround.');

  // Replace "When working with [roles], here is what the data showed:"
  sanitized = sanitized.replace(/here is what the data showed:/gi, 'here are the core principles that make the biggest difference:');

  // Sanitize unsupported study sample sizes into non-quantified observations
  sanitized = sanitized.replace(/(?:we|i)\s+(?:analyzed|studied|audited|reviewed|surveyed|interviewed)\s+(\d+)\s+([a-zA-Z\s]+)/gi, (orig, count, subj) => {
    const isSupported = allUserVerified.some((rec) => orig.toLowerCase().includes(rec) || rec.includes(count)) ||
      sourceDocsFullText.includes(orig.toLowerCase()) || sourceDocsFullText.includes(count);
    return isSupported ? orig : `Analyzing ${subj.trim()}`;
  });

  // Sanitize unsupported $ARR/MRR
  sanitized = sanitized.replace(/\$(\d+(?:\.\d+)?\s*(?:k|m|b|million|billion)?)\s*(?:in\s+)?(arr|mrr|revenue)/gi, (orig, amt, metric) => {
    const isSupported = allUserVerified.some((rec) => orig.toLowerCase().includes(rec) || rec.includes(amt.toLowerCase())) ||
      sourceDocsFullText.includes(orig.toLowerCase());
    return isSupported ? orig : `sustainable ${metric.toUpperCase()}`;
  });

  // Sanitize unsupported response rate jumps
  sanitized = sanitized.replace(/(?:response|conversion|reply)\s+rate\s+jumps?\s+from\s+[\d.]+%?\s+to\s+[\d.]+%?/gi, (orig) => {
    const isSupported = allUserVerified.some((rec) => orig.toLowerCase().includes(rec)) ||
      sourceDocsFullText.includes(orig.toLowerCase());
    return isSupported ? orig : 'response rates improve significantly';
  });

  // Sanitize unsupported hiring chronology
  sanitized = sanitized.replace(/\bin\s+(20\d\d),\s*(?:i|we)\s+hired\b/gi, (orig) => {
    const isSupported = allUserVerified.some((rec) => orig.toLowerCase().includes(rec));
    return isSupported ? orig : 'When building and staffing team operations';
  });

  // Sanitize unsupported closed meetings claims
  sanitized = sanitized.replace(/\b(?:zero|\d+)\s+closed\s+meetings\b/gi, (orig) => {
    const isSupported = allUserVerified.some((rec) => orig.toLowerCase().includes(rec)) ||
      sourceDocsFullText.includes(orig.toLowerCase());
    return isSupported ? orig : 'without qualified discovery conversations';
  });

  // If no claims were identified, record general domain knowledge
  if (claims.length === 0) {
    claims.push({
      claim: profile.role ? `${profile.role} domain observations` : 'Operational domain insights',
      classification: 'GENERAL_KNOWLEDGE',
      explanation: 'Educational domain concepts and best practices without fabricated statistics.',
      provenance: 'VERIFIED_USER_RECEIPT',
    });
  }

  const unsupportedClaims = claims.filter(
    (c) => c.classification === 'UNSUPPORTED_STATISTIC' || c.classification === 'UNSUPPORTED_PERSONAL_CLAIM'
  );

  return {
    isValid: unsupportedClaims.length === 0 && !leakage.detected,
    validatedPost: sanitized.trim(),
    claims,
    unsupportedCount: unsupportedClaims.length,
    unsupportedClaimsCount: unsupportedClaims.length,
    leakageDetected: leakage.detected,
    leakageDetails: leakage.details,
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * STEP 1 & 2: Generate 5 distinct, high-value content ideas grounded in user's pillars and ICP.
 */
export async function generateContentIdeas(
  profile: VoiceProfile,
  workspaceId?: string
): Promise<ContentIdea[]> {
  const pillars = profile.contentPillars && profile.contentPillars.length > 0
    ? profile.contentPillars
    : [
        'AI Tools, AI News & Practical AI',
        'Software Development, Coding & Developer Tools',
        'Technology News, Trends & Emerging Technology',
        'Startup, SaaS & Practical Lessons for Builders',
        'Tech Career, Learning & Developer Productivity',
      ];

  const targetPillarsList = pillars.slice(0, 5);
  const client = getAiClient();
  const authorRole = profile.role || 'Industry leader & domain operator';
  const targetAudience = profile.audience || 'Operators, founders, and decision makers';

  if (client) {
    const prompt = `You are a strategic editorial planner for: ${authorRole}.
Generate exactly 5 distinct, high-value post ideas tailored for: ${targetAudience}.

AUTHOR INTERNAL CONTEXT (FOR AUDIENCE RELEVANCE ONLY - DO NOT REPEAT IN OUTPUT):
- Positioning / Role: ${authorRole}
- ICP / Audience Focus: ${targetAudience}
- Content Pillars Available:
${targetPillarsList.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}

STRICT RULES:
1. Each idea must directly map to one of the user's Content Pillars.
2. DO NOT repeat the entire raw audience list. Choose a natural focal group appropriate for this domain.
3. DO NOT invent fake statistics or personal company numbers. Focus on real domain problems, operational trade-offs, or practical frameworks.
4. Each idea must have a clear educational structure (e.g. "mistake → why it happens → better approach", "problem → explanation → solution", or "framework → steps → example").

Output a JSON array of exactly 5 objects with keys:
- "id": "idea_1", "idea_2", etc.
- "idea": A punchy, concrete 1-2 sentence core thesis or concept
- "targetPillar": Exact name of the matched Content Pillar
- "intendedAudience": Focused domain audience slice (under 6 words)
- "angle": e.g. "Practical Framework", "Mistake Breakdown", "Contrarian Observation", "Workflow Optimization"
- "structure": e.g. "problem → explanation → solution", "mistake → why it happens → better approach", "framework → steps → example"
- "summary": 1-sentence description of what the reader learns

Return ONLY raw valid JSON (no markdown fences, no preamble).`;

    try {
      const res = await callGeminiFast(prompt, 1200);
      if (res && res.text) {
        const clean = res.text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed) && parsed.length >= 5) {
          return parsed.slice(0, 5).map((item, idx) => ({
            id: item.id || `idea_${idx + 1}`,
            idea: String(item.idea),
            targetPillar: String(item.targetPillar || targetPillarsList[idx % targetPillarsList.length]),
            intendedAudience: String(item.intendedAudience || getFocusedAudience(profile)),
            angle: String(item.angle || 'Practical Framework'),
            structure: String(item.structure || 'problem → explanation → solution'),
            summary: String(item.summary || item.idea),
          }));
        }
      }
    } catch (err: any) {
      console.info(`[ContentEngine] Ideas generation note: ${err?.message?.slice(0, 80) || 'busy'}. Using grounded fallback templates.`);
    }
  }

  // Deterministic Grounded Fallback Ideas tailored directly to active persona pillars & audience
  const focalGroup = getFocusedAudience(profile);
  const fallbackTemplates = [
    {
      angle: 'Operational Framework',
      structure: 'problem → explanation → solution',
      titleGen: (pillar: string) => `The operational framework for scaling ${pillar} with predictable repeatability.`,
      summaryGen: (pillar: string) => `Breaks down the core operational checkpoints to scale ${pillar} without adding administrative drag.`,
    },
    {
      angle: 'Contrarian Observation',
      structure: 'mistake → why it happens → better approach',
      titleGen: (pillar: string) => `Why conventional playbooks for ${pillar} backfire once volume increases.`,
      summaryGen: (pillar: string) => `Explains why relying on manual coordination creates hidden exceptions that erode margins.`,
    },
    {
      angle: 'Practical Checklist',
      structure: 'observation → reasoning → practical lesson',
      titleGen: (pillar: string) => `3 non-negotiable standards before automating workflows in ${pillar}.`,
      summaryGen: (pillar: string) => `A tactical sanity check to prevent broken handoffs and customer friction.`,
    },
    {
      angle: 'Efficiency Playbook',
      structure: 'framework → steps → example',
      titleGen: (pillar: string) => `Eliminating handoff friction in ${pillar}: how disciplined operators protect turnaround speed.`,
      summaryGen: (pillar: string) => `Shows how removing intermediate status checks speeds up resolution and execution.`,
    },
    {
      angle: 'Root Cause Breakdown',
      structure: 'problem → analysis → resolution',
      titleGen: (pillar: string) => `The hidden bottleneck in ${pillar} that most teams only discover after scaling.`,
      summaryGen: (pillar: string) => `Identifies the structural breakdown point and how to resolve it cleanly.`,
    },
  ];

  return Array.from({ length: 5 }).map((_, idx) => {
    const pillar = targetPillarsList[idx % targetPillarsList.length];
    const tmpl = fallbackTemplates[idx % fallbackTemplates.length];
    return {
      id: `idea_${idx + 1}`,
      idea: tmpl.titleGen(pillar),
      targetPillar: pillar,
      intendedAudience: focalGroup,
      angle: tmpl.angle,
      structure: tmpl.structure,
      summary: tmpl.summaryGen(pillar),
    };
  });
}

/**
 * STEP 3: Generate 3 distinct hooks for the chosen idea.
 * Must be under 210 characters (mobile fold), NO fabricated percentages or statistics.
 * Hooks are dynamically derived from the ContentStrategy and semantically rooted in the subject.
 */
export async function generateContentHooks(
  idea: ContentIdea,
  profile: VoiceProfile
): Promise<ContentHook[]> {
  // If the idea already carries an AI-formulated ContentStrategy with hooks, use them!
  if (idea.strategy?.hookConcepts && idea.strategy.hookConcepts.length >= 3) {
    return idea.strategy.hookConcepts.map((h, idx) => ({
      id: h.id || `hook_${idx + 1}`,
      hook: h.hook,
      angleName: h.angleName || `Angle ${idx + 1}`,
      characterCount: h.characterCount || h.hook.length,
    }));
  }

  // Formulate a dynamic, topic-specific ContentStrategy
  const strategy = await formulateContentStrategy({
    subject: idea.idea,
    profile,
    userIdea: idea.idea,
    sourceDocuments: idea.sourceReferences,
  });

  idea.strategy = strategy;

  return strategy.hookConcepts.map((h, idx) => ({
    id: h.id || `hook_${idx + 1}`,
    hook: h.hook,
    angleName: h.angleName || `Angle ${idx + 1}`,
    characterCount: h.characterCount || h.hook.length,
  }));
}

/**
 * STEP 4: Generate a complete LinkedIn post from selected idea and chosen hook.
 * Strictly driven by the ContentStrategy's dynamic narrativeStructure, format, and source facts.
 */
export async function generateCompletePost(params: {
  idea: ContentIdea;
  hook: string;
  profile?: VoiceProfile;
  voiceProfile?: VoiceProfile;
  customNotes?: string;
  sourceContext?: string;
  includeSources?: boolean;
  sources?: { title: string; url: string; sourceName: string }[];
  strategy?: ContentStrategy;
}): Promise<StructuredPostResult> {
  const profile = params.profile || params.voiceProfile || ({} as VoiceProfile);
  const { idea, hook, customNotes, sourceContext, includeSources, sources } = params;

  // Use existing strategy or formulate dynamically for the idea and sources
  const strategy = params.strategy || idea.strategy || (await formulateContentStrategy({
    subject: idea.idea,
    sourceDocuments: sources || idea.sourceReferences,
    userIdea: idea.idea,
    profile,
  }));

  idea.strategy = strategy;

  return generateStructuredPost({
    strategy,
    hook,
    profile,
    customNotes,
    sourceContext,
    includeSources,
    sources: sources || idea.sourceReferences,
  });
}

/**
 * Transforms a detected web trend and chosen angle into an original, structured ContentIdea
 * with an attached ContentStrategy.
 */
export function generateIdeaFromTrend(
  trend: { id: string; title: string; summary: string; matchedPillar: string; targetAudience: string; sources: any[] },
  angle: { type: string; hookConcept: string; angleDescription: string; proposedThesis: string },
  profile: VoiceProfile,
  strategy?: ContentStrategy
): ContentIdea {
  return {
    id: `idea_trend_${Date.now()}`,
    idea: angle.proposedThesis || trend.title,
    targetPillar: trend.matchedPillar || (profile.contentPillars?.[0] || 'Strategic Operations'),
    intendedAudience: trend.targetAudience || getFocusedAudience(profile),
    angle: `${angle.type} perspective: ${angle.angleDescription}`,
    structure: strategy ? strategy.narrativeStructure.join(' → ') : 'problem → explanation → solution',
    summary: `${angle.hookConcept} Grounded in analysis of ${trend.sources?.length || 1} public sources.`,
    trendId: trend.id,
    sourceReferences: trend.sources || [],
    strategy,
    provenance: {
      type: 'TREND_RESEARCH',
      trendTitle: trend.title,
      sourceCount: trend.sources?.length || 1,
      timestamp: new Date().toISOString(),
      contentType: strategy?.contentType,
      recommendedFormat: strategy?.recommendedFormat,
    },
  };
}
