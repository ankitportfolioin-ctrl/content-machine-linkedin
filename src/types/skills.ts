export interface StoryBankItem {
  id: string;
  category: string;
  title: string;
  dateOrYear: string;
  rawDetails: string;
  uncomfortableFact: string;
}

export interface HookFormula {
  id: string;
  code: string;
  name: string;
  goal: string;
  referenceEng: string;
  bestFor: string;
  whyItWorks: string;
  skeleton: string;
  defaultTemplate: string;
  reachNote2026?: string;
}

export interface FounderAngle {
  id: string;
  code: string;
  name: string;
  goal: string;
  tension: string;
  template: string;
  bestFormula?: string;
}

export type HumanizerMode = 'audit' | 'rewrite';
export type ScrubTier = 'forensic' | 'strict' | 'aesthetic';

export interface TellHit {
  matchedText: string;
  reason: string;
}

export interface ParagraphScore {
  index: number;
  text: string;
  count: number;
  hits: TellHit[];
  status: 'clean' | 'borderline' | 'flagged';
  suggestedAction: string;
}

export interface AuditResult {
  readConfidence: 'Reads Human' | 'Mixed' | 'Flagged AI';
  tellDensity: number;
  fleschScore: number;
  paragraphScores: ParagraphScore[];
  blockers: string[];
  warnings: string[];
}

export interface RewriteChange {
  rule: string;
  before: string;
  after: string;
  explanation: string;
}

export interface RewriteDiff {
  original: string;
  rewritten: string;
  changesApplied: RewriteChange[];
}
