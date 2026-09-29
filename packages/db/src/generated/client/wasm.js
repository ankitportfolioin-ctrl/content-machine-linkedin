
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  email: 'email',
  passwordHash: 'passwordHash',
  name: 'name',
  avatarUrl: 'avatarUrl',
  isActive: 'isActive',
  emailVerified: 'emailVerified',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  lastLoginAt: 'lastLoginAt'
};

exports.Prisma.BusinessProfileScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  name: 'name',
  description: 'description',
  mission: 'mission',
  products: 'products',
  services: 'services',
  skills: 'skills',
  ebooks: 'ebooks',
  guides: 'guides',
  targetOutcomes: 'targetOutcomes',
  monetizationGoals: 'monetizationGoals',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BrandProfileScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  tone: 'tone',
  writingStyle: 'writingStyle',
  bannedPhrases: 'bannedPhrases',
  preferredVocabulary: 'preferredVocabulary',
  visualIdentity: 'visualIdentity',
  contentBoundaries: 'contentBoundaries',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StrategyProfileScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  businessGoals: 'businessGoals',
  audienceGoals: 'audienceGoals',
  contentGoals: 'contentGoals',
  growthGoals: 'growthGoals',
  productGoals: 'productGoals',
  salesGoals: 'salesGoals',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AudienceSegmentScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  name: 'name',
  type: 'type',
  description: 'description',
  problems: 'problems',
  goals: 'goals',
  interests: 'interests',
  tools: 'tools',
  skills: 'skills',
  painPoints: 'painPoints',
  motivations: 'motivations',
  contentPreferences: 'contentPreferences',
  isDefault: 'isDefault',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProblemScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  audienceSegmentId: 'audienceSegmentId',
  title: 'title',
  description: 'description',
  severity: 'severity',
  frequency: 'frequency',
  source: 'source',
  evidence: 'evidence',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProductScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  problemId: 'problemId',
  name: 'name',
  description: 'description',
  type: 'type',
  price: 'price',
  url: 'url',
  features: 'features',
  targetOutcomes: 'targetOutcomes',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ContentDNAScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  contentIdeaId: 'contentIdeaId',
  contentDraftId: 'contentDraftId',
  contentVersionId: 'contentVersionId',
  topic: 'topic',
  subtopic: 'subtopic',
  audienceSegmentId: 'audienceSegmentId',
  skillLevel: 'skillLevel',
  pillar: 'pillar',
  format: 'format',
  angle: 'angle',
  hookType: 'hookType',
  hook: 'hook',
  hookLength: 'hookLength',
  title: 'title',
  structure: 'structure',
  bodyLength: 'bodyLength',
  visualType: 'visualType',
  visualConcept: 'visualConcept',
  ctaType: 'ctaType',
  cta: 'cta',
  hashtags: 'hashtags',
  sourceIds: 'sourceIds',
  freshness: 'freshness',
  publishTime: 'publishTime',
  stage: 'stage',
  impressions: 'impressions',
  reach: 'reach',
  reactions: 'reactions',
  comments: 'comments',
  reposts: 'reposts',
  saves: 'saves',
  sends: 'sends',
  linkClicks: 'linkClicks',
  profileViews: 'profileViews',
  followerGain: 'followerGain',
  businessActions: 'businessActions',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ContentStageHistoryScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  contentDNAId: 'contentDNAId',
  fromStage: 'fromStage',
  toStage: 'toStage',
  actorId: 'actorId',
  notes: 'notes',
  metadata: 'metadata',
  createdAt: 'createdAt'
};

exports.Prisma.CommentScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  contentVersionId: 'contentVersionId',
  externalId: 'externalId',
  platform: 'platform',
  authorName: 'authorName',
  authorUrl: 'authorUrl',
  text: 'text',
  type: 'type',
  sentiment: 'sentiment',
  isQuestion: 'isQuestion',
  isRequest: 'isRequest',
  isLeadSignal: 'isLeadSignal',
  parentId: 'parentId',
  threadId: 'threadId',
  postedAt: 'postedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AudienceSignalScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  audienceSegmentId: 'audienceSegmentId',
  signalType: 'signalType',
  source: 'source',
  description: 'description',
  evidence: 'evidence',
  strength: 'strength',
  createdAt: 'createdAt'
};

exports.Prisma.ExperimentScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  hypothesis: 'hypothesis',
  variable: 'variable',
  controlDescription: 'controlDescription',
  variantDescription: 'variantDescription',
  controlContentDNAId: 'controlContentDNAId',
  variantContentDNAId: 'variantContentDNAId',
  metricName: 'metricName',
  status: 'status',
  sampleSize: 'sampleSize',
  controlMetrics: 'controlMetrics',
  variantMetrics: 'variantMetrics',
  result: 'result',
  confidence: 'confidence',
  conclusion: 'conclusion',
  nextTest: 'nextTest',
  startedAt: 'startedAt',
  completedAt: 'completedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.IntelligenceReportScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  frequency: 'frequency',
  periodStart: 'periodStart',
  periodEnd: 'periodEnd',
  audienceCaredAbout: 'audienceCaredAbout',
  emergingTopics: 'emergingTopics',
  strongSignals: 'strongSignals',
  weakSignals: 'weakSignals',
  hookObservations: 'hookObservations',
  formatObservations: 'formatObservations',
  audienceObservations: 'audienceObservations',
  businessSignals: 'businessSignals',
  experiments: 'experiments',
  learnedPatterns: 'learnedPatterns',
  contradictoryEvidence: 'contradictoryEvidence',
  recommendedExperiments: 'recommendedExperiments',
  recommendedTopics: 'recommendedTopics',
  topicsToAvoid: 'topicsToAvoid',
  confidenceLevel: 'confidenceLevel',
  generatedAt: 'generatedAt',
  createdAt: 'createdAt'
};

exports.Prisma.ContentDiversitySnapshotScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  periodStart: 'periodStart',
  periodEnd: 'periodEnd',
  pillarDist: 'pillarDist',
  topicDist: 'topicDist',
  formatDist: 'formatDist',
  audienceDist: 'audienceDist',
  angleDist: 'angleDist',
  createdAt: 'createdAt'
};

exports.Prisma.WorkspaceSettingsScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  timezone: 'timezone',
  dailyRunTime: 'dailyRunTime',
  dailyLlmCallCap: 'dailyLlmCallCap',
  dailyFetchCap: 'dailyFetchCap',
  dailyPreparationCap: 'dailyPreparationCap',
  dailyExecutionCap: 'dailyExecutionCap',
  paused: 'paused',
  killSwitch: 'killSwitch',
  autonomyTier: 'autonomyTier',
  scheduleConfigured: 'scheduleConfigured',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AutonomyPolicyScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  tier1PostingEnabled: 'tier1PostingEnabled',
  tier1PostingDailyCap: 'tier1PostingDailyCap',
  tier1RequireApprovedPost: 'tier1RequireApprovedPost',
  tier2HumanApprovalAck: 'tier2HumanApprovalAck',
  autoPrepareApprovedWork: 'autoPrepareApprovedWork',
  autoPrepareColdWork: 'autoPrepareColdWork',
  dailyAutoPreparationQuota: 'dailyAutoPreparationQuota',
  updatedBy: 'updatedBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.FeedSourceScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  url: 'url',
  type: 'type',
  name: 'name',
  active: 'active',
  lastFetchedAt: 'lastFetchedAt',
  lastCursor: 'lastCursor',
  lastError: 'lastError',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DailyRunScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  runDate: 'runDate',
  status: 'status',
  startedAt: 'startedAt',
  finishedAt: 'finishedAt',
  summary: 'summary',
  error: 'error',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RunStageScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  dailyRunId: 'dailyRunId',
  stage: 'stage',
  status: 'status',
  counts: 'counts',
  durationMs: 'durationMs',
  error: 'error',
  startedAt: 'startedAt',
  finishedAt: 'finishedAt',
  attempt: 'attempt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ApprovalSnapshotScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  dailyRunId: 'dailyRunId',
  runDate: 'runDate',
  capturedAt: 'capturedAt',
  items: 'items',
  counts: 'counts',
  createdAt: 'createdAt'
};

exports.Prisma.OnboardingStateScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  currentStep: 'currentStep',
  completedSteps: 'completedSteps',
  profileDone: 'profileDone',
  audienceDone: 'audienceDone',
  pillarsDone: 'pillarsDone',
  offersDone: 'offersDone',
  sourcesDone: 'sourcesDone',
  leadsDone: 'leadsDone',
  policyDone: 'policyDone',
  scheduleDone: 'scheduleDone',
  completedAt: 'completedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LeadImportBatchScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  filename: 'filename',
  fileHash: 'fileHash',
  totalRows: 'totalRows',
  importedRows: 'importedRows',
  skippedRows: 'skippedRows',
  status: 'status',
  error: 'error',
  importedBy: 'importedBy',
  createdAt: 'createdAt'
};

exports.Prisma.WorkspaceScalarFieldEnum = {
  id: 'id',
  name: 'name',
  slug: 'slug',
  description: 'description',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WorkspaceMembershipScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  workspaceId: 'workspaceId',
  role: 'role',
  joinedAt: 'joinedAt'
};

exports.Prisma.ProfileScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  workspaceId: 'workspaceId',
  linkedinUrl: 'linkedinUrl',
  headline: 'headline',
  role: 'role',
  summary: 'summary',
  professionalContext: 'professionalContext',
  industry: 'industry',
  location: 'location',
  avatarUrl: 'avatarUrl',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ICPScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  name: 'name',
  description: 'description',
  criteria: 'criteria',
  targetRoles: 'targetRoles',
  industries: 'industries',
  companySize: 'companySize',
  problems: 'problems',
  exclusions: 'exclusions',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ContentIdeaScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  authorId: 'authorId',
  title: 'title',
  description: 'description',
  angle: 'angle',
  format: 'format',
  status: 'status',
  tags: 'tags',
  opportunityId: 'opportunityId',
  topicId: 'topicId',
  sourceIds: 'sourceIds',
  claimIds: 'claimIds',
  trendSignalIds: 'trendSignalIds',
  thesis: 'thesis',
  audience: 'audience',
  objective: 'objective',
  reasoning: 'reasoning',
  evidenceSnapshot: 'evidenceSnapshot',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  publishedAt: 'publishedAt'
};

exports.Prisma.ContentDraftScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  contentIdeaId: 'contentIdeaId',
  planId: 'planId',
  authorId: 'authorId',
  body: 'body',
  structure: 'structure',
  version: 'version',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ContentVersionScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  contentDraftId: 'contentDraftId',
  authorId: 'authorId',
  body: 'body',
  version: 'version',
  changeSummary: 'changeSummary',
  isFinal: 'isFinal',
  createdAt: 'createdAt'
};

exports.Prisma.LeadScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  assigneeId: 'assigneeId',
  linkedinUrl: 'linkedinUrl',
  name: 'name',
  headline: 'headline',
  company: 'company',
  location: 'location',
  status: 'status',
  tags: 'tags',
  notes: 'notes',
  lastContactAt: 'lastContactAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ConversationScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  leadId: 'leadId',
  userId: 'userId',
  subject: 'subject',
  lastMessageAt: 'lastMessageAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MessageScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  conversationId: 'conversationId',
  senderId: 'senderId',
  body: 'body',
  direction: 'direction',
  linkedinMessageId: 'linkedinMessageId',
  sentAt: 'sentAt',
  createdAt: 'createdAt'
};

exports.Prisma.PipelineOpportunityScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  leadId: 'leadId',
  ownerId: 'ownerId',
  name: 'name',
  stage: 'stage',
  value: 'value',
  expectedCloseDate: 'expectedCloseDate',
  probability: 'probability',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  closedAt: 'closedAt'
};

exports.Prisma.AnalyticsEventScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  userId: 'userId',
  eventType: 'eventType',
  eventName: 'eventName',
  properties: 'properties',
  timestamp: 'timestamp'
};

exports.Prisma.LearningSignalScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  userId: 'userId',
  sourceType: 'sourceType',
  sourceId: 'sourceId',
  signalType: 'signalType',
  signalValue: 'signalValue',
  metadata: 'metadata',
  createdAt: 'createdAt'
};

exports.Prisma.IntelligenceSourceScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  url: 'url',
  canonicalUrl: 'canonicalUrl',
  sourceType: 'sourceType',
  title: 'title',
  publisher: 'publisher',
  author: 'author',
  publishedAt: 'publishedAt',
  publishedAtConfidence: 'publishedAtConfidence',
  description: 'description',
  contentHash: 'contentHash',
  urlHash: 'urlHash',
  status: 'status',
  lastFetchedAt: 'lastFetchedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SourceDocumentScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  sourceId: 'sourceId',
  rawContent: 'rawContent',
  cleanContent: 'cleanContent',
  contentType: 'contentType',
  wordCount: 'wordCount',
  language: 'language',
  extractionMethod: 'extractionMethod',
  extractionStatus: 'extractionStatus',
  extractionWarnings: 'extractionWarnings',
  fetchedAt: 'fetchedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SourceClaimScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  sourceId: 'sourceId',
  documentId: 'documentId',
  claimText: 'claimText',
  claimType: 'claimType',
  evidenceText: 'evidenceText',
  evidenceLocation: 'evidenceLocation',
  confidence: 'confidence',
  status: 'status',
  provenance: 'provenance',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TopicScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  name: 'name',
  canonicalName: 'canonicalName',
  description: 'description',
  aliases: 'aliases',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TopicMentionScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  topicId: 'topicId',
  sourceId: 'sourceId',
  mentionStrength: 'mentionStrength',
  relevanceScore: 'relevanceScore',
  context: 'context',
  createdAt: 'createdAt'
};

exports.Prisma.TrendSignalScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  topicId: 'topicId',
  status: 'status',
  mentionCount: 'mentionCount',
  sourceCount: 'sourceCount',
  firstSeenAt: 'firstSeenAt',
  lastSeenAt: 'lastSeenAt',
  recencyScore: 'recencyScore',
  sourceDiversityScore: 'sourceDiversityScore',
  frequencyScore: 'frequencyScore',
  evidenceSummary: 'evidenceSummary',
  calculatedAt: 'calculatedAt'
};

exports.Prisma.ContentOpportunityScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  topicId: 'topicId',
  title: 'title',
  thesis: 'thesis',
  problem: 'problem',
  audience: 'audience',
  angle: 'angle',
  objective: 'objective',
  contentFormat: 'contentFormat',
  opportunityScore: 'opportunityScore',
  status: 'status',
  sourceIds: 'sourceIds',
  claimIds: 'claimIds',
  trendSignalIds: 'trendSignalIds',
  reasoning: 'reasoning',
  evidenceSummary: 'evidenceSummary',
  originKind: 'originKind',
  originId: 'originId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ContentGapScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  topicId: 'topicId',
  gapType: 'gapType',
  description: 'description',
  importanceScore: 'importanceScore',
  evidence: 'evidence',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OpportunityFeedbackScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  opportunityId: 'opportunityId',
  userId: 'userId',
  feedback: 'feedback',
  reason: 'reason',
  createdAt: 'createdAt'
};

exports.Prisma.ContentPlanScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  contentIdeaId: 'contentIdeaId',
  opportunityId: 'opportunityId',
  topicId: 'topicId',
  thesis: 'thesis',
  coreQuestion: 'coreQuestion',
  audience: 'audience',
  audienceReason: 'audienceReason',
  objective: 'objective',
  angle: 'angle',
  format: 'format',
  narrativeStructure: 'narrativeStructure',
  keyPoints: 'keyPoints',
  hookDirection: 'hookDirection',
  ctaStrategy: 'ctaStrategy',
  evidenceMap: 'evidenceMap',
  contradictionNotes: 'contradictionNotes',
  voiceInstructions: 'voiceInstructions',
  mustNotClaim: 'mustNotClaim',
  sourceIds: 'sourceIds',
  claimIds: 'claimIds',
  trendSignalIds: 'trendSignalIds',
  reasoning: 'reasoning',
  evidenceSnapshot: 'evidenceSnapshot',
  status: 'status',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DraftClaimBindingScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  draftId: 'draftId',
  span: 'span',
  sourceClaimId: 'sourceClaimId',
  evidenceStatus: 'evidenceStatus',
  confidence: 'confidence',
  contradictionState: 'contradictionState',
  createdAt: 'createdAt'
};

exports.Prisma.ContentQualityGateResultScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  draftId: 'draftId',
  planId: 'planId',
  gate: 'gate',
  status: 'status',
  severity: 'severity',
  message: 'message',
  evidence: 'evidence',
  createdAt: 'createdAt'
};

exports.Prisma.ContentReviewScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  draftId: 'draftId',
  status: 'status',
  requestedBy: 'requestedBy',
  reviewerId: 'reviewerId',
  note: 'note',
  gateSummary: 'gateSummary',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VoiceProfileScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  userId: 'userId',
  role: 'role',
  headline: 'headline',
  professionalContext: 'professionalContext',
  tone: 'tone',
  writingStyle: 'writingStyle',
  bannedWords: 'bannedWords',
  preferredVocabulary: 'preferredVocabulary',
  contentPillars: 'contentPillars',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VoiceReceiptScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  fact: 'fact',
  context: 'context',
  verifiedAt: 'verifiedAt',
  createdAt: 'createdAt'
};

exports.Prisma.WritingSampleScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  title: 'title',
  content: 'content',
  createdAt: 'createdAt'
};

exports.Prisma.ProspectResearchScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  leadId: 'leadId',
  name: 'name',
  title: 'title',
  company: 'company',
  companyDomain: 'companyDomain',
  location: 'location',
  publicSourceUrls: 'publicSourceUrls',
  facts: 'facts',
  unknowns: 'unknowns',
  confidence: 'confidence',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProspectSignalScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  leadId: 'leadId',
  signalType: 'signalType',
  source: 'source',
  observedAt: 'observedAt',
  confidence: 'confidence',
  evidence: 'evidence',
  interpretation: 'interpretation',
  createdAt: 'createdAt'
};

exports.Prisma.QualificationResultScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  leadId: 'leadId',
  status: 'status',
  dimensions: 'dimensions',
  evidence: 'evidence',
  missingData: 'missingData',
  reasoning: 'reasoning',
  confidence: 'confidence',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ProspectBriefScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  leadId: 'leadId',
  who: 'who',
  whyFit: 'whyFit',
  knownFacts: 'knownFacts',
  unknowns: 'unknowns',
  signals: 'signals',
  relevance: 'relevance',
  risks: 'risks',
  doNotClaim: 'doNotClaim',
  recommendedApproach: 'recommendedApproach',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OutreachStrategyScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  leadId: 'leadId',
  briefId: 'briefId',
  objective: 'objective',
  audience: 'audience',
  relationshipStage: 'relationshipStage',
  angle: 'angle',
  reasonForContact: 'reasonForContact',
  relevantEvidence: 'relevantEvidence',
  personalizationLevel: 'personalizationLevel',
  ctaType: 'ctaType',
  riskFlags: 'riskFlags',
  mustNotClaim: 'mustNotClaim',
  relevantContentId: 'relevantContentId',
  contentReason: 'contentReason',
  status: 'status',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OutreachDraftScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  strategyId: 'strategyId',
  leadId: 'leadId',
  draftType: 'draftType',
  opening: 'opening',
  relevance: 'relevance',
  evidence: 'evidence',
  value: 'value',
  cta: 'cta',
  body: 'body',
  structure: 'structure',
  version: 'version',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OutreachReviewScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  draftId: 'draftId',
  status: 'status',
  requestedBy: 'requestedBy',
  reviewerId: 'reviewerId',
  note: 'note',
  gateSummary: 'gateSummary',
  draftVersion: 'draftVersion',
  approvedBodyHash: 'approvedBodyHash',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PreparedActionScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  actionType: 'actionType',
  target: 'target',
  draftId: 'draftId',
  approvalId: 'approvalId',
  evidence: 'evidence',
  status: 'status',
  expiresAt: 'expiresAt',
  createdAt: 'createdAt'
};

exports.Prisma.ConversationClassificationResultScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  conversationId: 'conversationId',
  classification: 'classification',
  confidence: 'confidence',
  evidence: 'evidence',
  recommendedNextStep: 'recommendedNextStep',
  createdAt: 'createdAt'
};

exports.Prisma.FollowUpRecommendationScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  conversationId: 'conversationId',
  leadId: 'leadId',
  recommendation: 'recommendation',
  why: 'why',
  evidence: 'evidence',
  risk: 'risk',
  timing: 'timing',
  createdAt: 'createdAt'
};

exports.Prisma.SalesContentSignalScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  signalType: 'signalType',
  sourceConversationIds: 'sourceConversationIds',
  evidence: 'evidence',
  frequency: 'frequency',
  recommendedAngle: 'recommendedAngle',
  reasoning: 'reasoning',
  createdAt: 'createdAt'
};

exports.Prisma.PublishRecordScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  contentVersionId: 'contentVersionId',
  outreachDraftId: 'outreachDraftId',
  pipelineOpportunityId: 'pipelineOpportunityId',
  channel: 'channel',
  externalRef: 'externalRef',
  recordedBy: 'recordedBy',
  recordedAt: 'recordedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.OutcomeMetricScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  publishRecordId: 'publishRecordId',
  contentVersionId: 'contentVersionId',
  outreachDraftId: 'outreachDraftId',
  pipelineOpportunityId: 'pipelineOpportunityId',
  metricName: 'metricName',
  metricValue: 'metricValue',
  unit: 'unit',
  source: 'source',
  recordedBy: 'recordedBy',
  recordedAt: 'recordedAt',
  idempotencyKey: 'idempotencyKey',
  createdAt: 'createdAt'
};

exports.Prisma.OperatorActionScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  identityKey: 'identityKey',
  kind: 'kind',
  subjectId: 'subjectId',
  title: 'title',
  score: 'score',
  reasons: 'reasons',
  evidenceLinks: 'evidenceLinks',
  subjectMeta: 'subjectMeta',
  status: 'status',
  dismissedAt: 'dismissedAt',
  completedAt: 'completedAt',
  acceptedAt: 'acceptedAt',
  acceptedBy: 'acceptedBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  decidedBy: 'decidedBy',
  decidedAt: 'decidedAt',
  decisionReason: 'decisionReason',
  evidenceRefs: 'evidenceRefs',
  model: 'model',
  modelVersion: 'modelVersion',
  policySnapshot: 'policySnapshot'
};

exports.Prisma.LearningProposalScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  dimension: 'dimension',
  observedPattern: 'observedPattern',
  supportingMeasurements: 'supportingMeasurements',
  sourceMetricIds: 'sourceMetricIds',
  sampleSize: 'sampleSize',
  denominator: 'denominator',
  proposedAdjustment: 'proposedAdjustment',
  reason: 'reason',
  confidence: 'confidence',
  status: 'status',
  confirmedBy: 'confirmedBy',
  confirmedAt: 'confirmedAt',
  maturity: 'maturity',
  evidenceCount: 'evidenceCount',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AttributionLinkScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  sourceType: 'sourceType',
  sourceId: 'sourceId',
  targetType: 'targetType',
  targetId: 'targetId',
  attributionType: 'attributionType',
  evidenceRefs: 'evidenceRefs',
  reason: 'reason',
  recordedBy: 'recordedBy',
  recordedAt: 'recordedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PreparationLogScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  kind: 'kind',
  subjectType: 'subjectType',
  subjectId: 'subjectId',
  resultType: 'resultType',
  resultId: 'resultId',
  authorizationSource: 'authorizationSource',
  authorizationReason: 'authorizationReason',
  status: 'status',
  skipReason: 'skipReason',
  createdAt: 'createdAt'
};

exports.Prisma.CommentSalesSignalScalarFieldEnum = {
  id: 'id',
  workspaceId: 'workspaceId',
  commentId: 'commentId',
  audienceSignalId: 'audienceSignalId',
  signalType: 'signalType',
  evidence: 'evidence',
  reason: 'reason',
  status: 'status',
  reviewedBy: 'reviewedBy',
  reviewedAt: 'reviewedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};
exports.AudienceSegmentType = exports.$Enums.AudienceSegmentType = {
  BEGINNER_DEVELOPER: 'BEGINNER_DEVELOPER',
  AI_LEARNER: 'AI_LEARNER',
  AI_BUILDER: 'AI_BUILDER',
  SOFTWARE_DEVELOPER: 'SOFTWARE_DEVELOPER',
  STARTUP_BUILDER: 'STARTUP_BUILDER',
  TECH_STUDENT: 'TECH_STUDENT',
  TECHNOLOGY_ENTHUSIAST: 'TECHNOLOGY_ENTHUSIAST',
  CUSTOM: 'CUSTOM'
};

exports.ContentDNAFormat = exports.$Enums.ContentDNAFormat = {
  TEXT_POST: 'TEXT_POST',
  CAROUSEL: 'CAROUSEL',
  DOCUMENT: 'DOCUMENT',
  IMAGE: 'IMAGE',
  VIDEO_SCRIPT: 'VIDEO_SCRIPT',
  TUTORIAL: 'TUTORIAL',
  NEWS_EXPLANATION: 'NEWS_EXPLANATION',
  HOW_TO: 'HOW_TO',
  LIST: 'LIST',
  COMPARISON: 'COMPARISON',
  CASE_STUDY: 'CASE_STUDY',
  EXPERIMENT: 'EXPERIMENT',
  MYTH_VS_FACT: 'MYTH_VS_FACT',
  TOOL_BREAKDOWN: 'TOOL_BREAKDOWN',
  PROJECT_WALKTHROUGH: 'PROJECT_WALKTHROUGH'
};

exports.HookType = exports.$Enums.HookType = {
  PROBLEM: 'PROBLEM',
  QUESTION: 'QUESTION',
  STATEMENT: 'STATEMENT',
  STORY: 'STORY',
  STATISTIC: 'STATISTIC',
  CONTRARIAN: 'CONTRARIAN',
  PREDICTION: 'PREDICTION',
  FRAMEWORK: 'FRAMEWORK'
};

exports.CTAType = exports.$Enums.CTAType = {
  COMMENT: 'COMMENT',
  SHARE: 'SHARE',
  FOLLOW: 'FOLLOW',
  DOWNLOAD: 'DOWNLOAD',
  SIGNUP: 'SIGNUP',
  BUY: 'BUY',
  LEARN_MORE: 'LEARN_MORE',
  DM: 'DM',
  SAVE: 'SAVE'
};

exports.ContentStage = exports.$Enums.ContentStage = {
  RESEARCH: 'RESEARCH',
  OPPORTUNITY: 'OPPORTUNITY',
  IDEA: 'IDEA',
  ANGLE: 'ANGLE',
  HOOK: 'HOOK',
  SCRIPT: 'SCRIPT',
  VISUAL_CONCEPT: 'VISUAL_CONCEPT',
  CAPTION: 'CAPTION',
  HASHTAGS: 'HASHTAGS',
  FACT_CHECK: 'FACT_CHECK',
  ORIGINALITY_CHECK: 'ORIGINALITY_CHECK',
  QUALITY_CHECK: 'QUALITY_CHECK',
  HUMAN_APPROVAL: 'HUMAN_APPROVAL',
  PUBLISHING: 'PUBLISHING'
};

exports.CommentType = exports.$Enums.CommentType = {
  QUESTION: 'QUESTION',
  REQUEST: 'REQUEST',
  PRAISE: 'PRAISE',
  CRITICISM: 'CRITICISM',
  DISAGREEMENT: 'DISAGREEMENT',
  TECHNICAL_QUESTION: 'TECHNICAL_QUESTION',
  LEAD_SIGNAL: 'LEAD_SIGNAL',
  SPAM: 'SPAM',
  CONVERSATION: 'CONVERSATION'
};

exports.ExperimentStatus = exports.$Enums.ExperimentStatus = {
  DESIGNED: 'DESIGNED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED'
};

exports.ReportFrequency = exports.$Enums.ReportFrequency = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY'
};

exports.FeedSourceType = exports.$Enums.FeedSourceType = {
  RSS: 'RSS',
  ATOM: 'ATOM',
  HACKERNEWS: 'HACKERNEWS',
  GITHUB_RELEASES: 'GITHUB_RELEASES',
  BLOG: 'BLOG',
  SITE: 'SITE'
};

exports.DailyRunStatus = exports.$Enums.DailyRunStatus = {
  STARTED: 'STARTED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  COMPLETED_WITH_FAILURES: 'COMPLETED_WITH_FAILURES',
  FAILED: 'FAILED',
  SKIPPED_PAUSED: 'SKIPPED_PAUSED',
  SKIPPED_KILLED: 'SKIPPED_KILLED'
};

exports.RunStageName = exports.$Enums.RunStageName = {
  INTELLIGENCE: 'INTELLIGENCE',
  DECISION: 'DECISION',
  CONTENT: 'CONTENT',
  SALES: 'SALES',
  APPROVAL_SNAPSHOT: 'APPROVAL_SNAPSHOT',
  EXECUTION: 'EXECUTION',
  OBSERVE_LEARN: 'OBSERVE_LEARN',
  DIGEST: 'DIGEST'
};

exports.RunStageStatus = exports.$Enums.RunStageStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED'
};

exports.LeadImportStatus = exports.$Enums.LeadImportStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  COMPLETED_WITH_SKIPS: 'COMPLETED_WITH_SKIPS',
  FAILED: 'FAILED'
};

exports.UserRole = exports.$Enums.UserRole = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
  VIEWER: 'VIEWER'
};

exports.ContentFormat = exports.$Enums.ContentFormat = {
  POST: 'POST',
  TEXT_POST: 'TEXT_POST',
  ARTICLE: 'ARTICLE',
  CAROUSEL: 'CAROUSEL',
  VIDEO: 'VIDEO',
  POLL: 'POLL',
  CHECKLIST: 'CHECKLIST',
  FRAMEWORK: 'FRAMEWORK',
  CONTRARIAN: 'CONTRARIAN'
};

exports.ContentStatus = exports.$Enums.ContentStatus = {
  DRAFT: 'DRAFT',
  REVIEW: 'REVIEW',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED'
};

exports.LeadStatus = exports.$Enums.LeadStatus = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  CONNECTED: 'CONNECTED',
  RESPONDING: 'RESPONDING',
  QUALIFIED: 'QUALIFIED',
  DISQUALIFIED: 'DISQUALIFIED',
  CLOSED: 'CLOSED'
};

exports.MessageDirection = exports.$Enums.MessageDirection = {
  INBOUND: 'INBOUND',
  OUTBOUND: 'OUTBOUND'
};

exports.PipelineStage = exports.$Enums.PipelineStage = {
  PROSPECTING: 'PROSPECTING',
  QUALIFICATION: 'QUALIFICATION',
  PROPOSAL: 'PROPOSAL',
  NEGOTIATION: 'NEGOTIATION',
  CLOSED_WON: 'CLOSED_WON',
  CLOSED_LOST: 'CLOSED_LOST'
};

exports.LearningSignalSourceType = exports.$Enums.LearningSignalSourceType = {
  CONTENT_PERFORMANCE: 'CONTENT_PERFORMANCE',
  ENGAGEMENT: 'ENGAGEMENT',
  CONVERSION: 'CONVERSION',
  FEEDBACK: 'FEEDBACK'
};

exports.SourceType = exports.$Enums.SourceType = {
  ARTICLE: 'ARTICLE',
  RSS: 'RSS',
  ATOM: 'ATOM',
  SITEMAP: 'SITEMAP',
  WEBSITE: 'WEBSITE',
  USER_URL: 'USER_URL'
};

exports.PublishedAtConfidence = exports.$Enums.PublishedAtConfidence = {
  VERIFIED: 'VERIFIED',
  INFERRED: 'INFERRED',
  UNKNOWN: 'UNKNOWN'
};

exports.SourceStatus = exports.$Enums.SourceStatus = {
  ACTIVE: 'ACTIVE',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED',
  STALE: 'STALE'
};

exports.ContentType = exports.$Enums.ContentType = {
  HTML: 'HTML',
  RSS_XML: 'RSS_XML',
  ATOM_XML: 'ATOM_XML',
  SITEMAP_XML: 'SITEMAP_XML',
  TEXT: 'TEXT'
};

exports.ExtractionMethod = exports.$Enums.ExtractionMethod = {
  HTML: 'HTML',
  RSS: 'RSS',
  ATOM: 'ATOM',
  SITEMAP: 'SITEMAP',
  TEXT: 'TEXT',
  USER_PROVIDED: 'USER_PROVIDED'
};

exports.ExtractionStatus = exports.$Enums.ExtractionStatus = {
  SUCCESS: 'SUCCESS',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED'
};

exports.ClaimType = exports.$Enums.ClaimType = {
  FACT: 'FACT',
  OPINION: 'OPINION',
  PREDICTION: 'PREDICTION',
  RECOMMENDATION: 'RECOMMENDATION',
  OBSERVATION: 'OBSERVATION',
  STATISTIC: 'STATISTIC'
};

exports.ClaimStatus = exports.$Enums.ClaimStatus = {
  SUPPORTED: 'SUPPORTED',
  CONTRADICTED: 'CONTRADICTED',
  UNCERTAIN: 'UNCERTAIN'
};

exports.TrendStatus = exports.$Enums.TrendStatus = {
  INSUFFICIENT_HISTORY: 'INSUFFICIENT_HISTORY',
  EMERGING: 'EMERGING',
  RELEVANT: 'RELEVANT',
  TRENDING: 'TRENDING',
  STALE: 'STALE'
};

exports.OpportunityStatus = exports.$Enums.OpportunityStatus = {
  NEW: 'NEW',
  REVIEWED: 'REVIEWED',
  CONVERTED: 'CONVERTED',
  DISMISSED: 'DISMISSED'
};

exports.GapType = exports.$Enums.GapType = {
  AUDIENCE: 'AUDIENCE',
  TOPIC: 'TOPIC',
  FORMAT: 'FORMAT',
  ANGLE: 'ANGLE',
  DEPTH: 'DEPTH',
  EVIDENCE: 'EVIDENCE'
};

exports.FeedbackType = exports.$Enums.FeedbackType = {
  USEFUL: 'USEFUL',
  NOT_USEFUL: 'NOT_USEFUL',
  ALREADY_COVERED: 'ALREADY_COVERED',
  WRONG_AUDIENCE: 'WRONG_AUDIENCE',
  WEAK_EVIDENCE: 'WEAK_EVIDENCE',
  NOT_TIMELY: 'NOT_TIMELY'
};

exports.ContentObjective = exports.$Enums.ContentObjective = {
  EDUCATE: 'EDUCATE',
  EXPLAIN: 'EXPLAIN',
  CHALLENGE: 'CHALLENGE',
  BUILD_AUTHORITY: 'BUILD_AUTHORITY',
  SHARE_FRAMEWORK: 'SHARE_FRAMEWORK',
  START_DISCUSSION: 'START_DISCUSSION',
  TEACH_PRACTICAL: 'TEACH_PRACTICAL',
  ANALYZE: 'ANALYZE',
  REFRAME: 'REFRAME'
};

exports.ContentAngle = exports.$Enums.ContentAngle = {
  EDUCATIONAL: 'EDUCATIONAL',
  CONTRARIAN: 'CONTRARIAN',
  PRACTICAL: 'PRACTICAL',
  FRAMEWORK: 'FRAMEWORK',
  ANALYSIS: 'ANALYSIS',
  OBSERVATION: 'OBSERVATION',
  BREAKDOWN: 'BREAKDOWN'
};

exports.ContentNarrative = exports.$Enums.ContentNarrative = {
  PROBLEM_WHY_SOLUTION: 'PROBLEM_WHY_SOLUTION',
  OBSERVATION_ANALYSIS_IMPLICATION: 'OBSERVATION_ANALYSIS_IMPLICATION',
  HOOK_CONTEXT_FRAMEWORK_APPLICATION_TAKEAWAY: 'HOOK_CONTEXT_FRAMEWORK_APPLICATION_TAKEAWAY',
  MISTAKE_CONSEQUENCE_BETTER_APPROACH: 'MISTAKE_CONSEQUENCE_BETTER_APPROACH',
  THESIS_EVIDENCE_TRADEOFF_CONCLUSION: 'THESIS_EVIDENCE_TRADEOFF_CONCLUSION'
};

exports.ContentPlanStatus = exports.$Enums.ContentPlanStatus = {
  DRAFT: 'DRAFT',
  APPROVED: 'APPROVED',
  ARCHIVED: 'ARCHIVED'
};

exports.EvidenceStatus = exports.$Enums.EvidenceStatus = {
  SUPPORTED: 'SUPPORTED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  BLOCKED: 'BLOCKED',
  CONTRADICTED: 'CONTRADICTED'
};

exports.GateStatus = exports.$Enums.GateStatus = {
  PASS: 'PASS',
  WARN: 'WARN',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  BLOCKED: 'BLOCKED'
};

exports.ReviewStatus = exports.$Enums.ReviewStatus = {
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  BLOCKED: 'BLOCKED'
};

exports.SalesSignalType = exports.$Enums.SalesSignalType = {
  HIRING: 'HIRING',
  PRODUCT_LAUNCH: 'PRODUCT_LAUNCH',
  TECH_MIGRATION: 'TECH_MIGRATION',
  EXPANSION: 'EXPANSION',
  OPERATIONAL_CHANGE: 'OPERATIONAL_CHANGE',
  ANNOUNCEMENT: 'ANNOUNCEMENT',
  PROBLEM_CONTENT: 'PROBLEM_CONTENT',
  COMPANY_INITIATIVE: 'COMPANY_INITIATIVE'
};

exports.QualificationStatus = exports.$Enums.QualificationStatus = {
  UNQUALIFIED: 'UNQUALIFIED',
  POSSIBLE_FIT: 'POSSIBLE_FIT',
  QUALIFIED: 'QUALIFIED',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA'
};

exports.RelationshipStage = exports.$Enums.RelationshipStage = {
  COLD: 'COLD',
  AWARE: 'AWARE',
  ENGAGED: 'ENGAGED',
  CONVERSATION: 'CONVERSATION',
  OPPORTUNITY: 'OPPORTUNITY',
  CUSTOMER: 'CUSTOMER'
};

exports.PersonalizationLevel = exports.$Enums.PersonalizationLevel = {
  NONE: 'NONE',
  LIGHT: 'LIGHT',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH'
};

exports.OutreachDraftType = exports.$Enums.OutreachDraftType = {
  CONNECTION_NOTE: 'CONNECTION_NOTE',
  FIRST_MESSAGE: 'FIRST_MESSAGE',
  FOLLOW_UP: 'FOLLOW_UP',
  VALUE_MESSAGE: 'VALUE_MESSAGE',
  CONTENT_BASED_OUTREACH: 'CONTENT_BASED_OUTREACH'
};

exports.PreparedActionStatus = exports.$Enums.PreparedActionStatus = {
  READY_FOR_AUTHORIZED_EXECUTION: 'READY_FOR_AUTHORIZED_EXECUTION',
  BLOCKED: 'BLOCKED',
  EXPIRED: 'EXPIRED',
  REQUIRES_APPROVAL: 'REQUIRES_APPROVAL'
};

exports.ConversationClassification = exports.$Enums.ConversationClassification = {
  INTERESTED: 'INTERESTED',
  NOT_INTERESTED: 'NOT_INTERESTED',
  QUESTION: 'QUESTION',
  OBJECTION: 'OBJECTION',
  NEEDS_INFO: 'NEEDS_INFO',
  MEETING_REQUEST: 'MEETING_REQUEST',
  POSITIVE: 'POSITIVE',
  NEGATIVE: 'NEGATIVE',
  NEUTRAL: 'NEUTRAL',
  UNCLEAR: 'UNCLEAR'
};

exports.FollowUpAction = exports.$Enums.FollowUpAction = {
  NO_FOLLOW_UP: 'NO_FOLLOW_UP',
  FOLLOW_UP_NOW: 'FOLLOW_UP_NOW',
  FOLLOW_UP_LATER: 'FOLLOW_UP_LATER',
  RESPOND_TO_QUESTION: 'RESPOND_TO_QUESTION',
  SEND_VALUE: 'SEND_VALUE',
  ASK_CLARIFYING_QUESTION: 'ASK_CLARIFYING_QUESTION',
  MOVE_TO_OPPORTUNITY: 'MOVE_TO_OPPORTUNITY',
  CLOSE_OUT: 'CLOSE_OUT',
  WAIT: 'WAIT',
  NURTURE: 'NURTURE',
  NO_OUTREACH: 'NO_OUTREACH',
  DISMISS: 'DISMISS'
};

exports.LearningProposalStatus = exports.$Enums.LearningProposalStatus = {
  PROPOSED: 'PROPOSED',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
  REVOKED: 'REVOKED'
};

exports.Prisma.ModelName = {
  User: 'User',
  BusinessProfile: 'BusinessProfile',
  BrandProfile: 'BrandProfile',
  StrategyProfile: 'StrategyProfile',
  AudienceSegment: 'AudienceSegment',
  Problem: 'Problem',
  Product: 'Product',
  ContentDNA: 'ContentDNA',
  ContentStageHistory: 'ContentStageHistory',
  Comment: 'Comment',
  AudienceSignal: 'AudienceSignal',
  Experiment: 'Experiment',
  IntelligenceReport: 'IntelligenceReport',
  ContentDiversitySnapshot: 'ContentDiversitySnapshot',
  WorkspaceSettings: 'WorkspaceSettings',
  AutonomyPolicy: 'AutonomyPolicy',
  FeedSource: 'FeedSource',
  DailyRun: 'DailyRun',
  RunStage: 'RunStage',
  ApprovalSnapshot: 'ApprovalSnapshot',
  OnboardingState: 'OnboardingState',
  LeadImportBatch: 'LeadImportBatch',
  Workspace: 'Workspace',
  WorkspaceMembership: 'WorkspaceMembership',
  Profile: 'Profile',
  ICP: 'ICP',
  ContentIdea: 'ContentIdea',
  ContentDraft: 'ContentDraft',
  ContentVersion: 'ContentVersion',
  Lead: 'Lead',
  Conversation: 'Conversation',
  Message: 'Message',
  PipelineOpportunity: 'PipelineOpportunity',
  AnalyticsEvent: 'AnalyticsEvent',
  LearningSignal: 'LearningSignal',
  IntelligenceSource: 'IntelligenceSource',
  SourceDocument: 'SourceDocument',
  SourceClaim: 'SourceClaim',
  Topic: 'Topic',
  TopicMention: 'TopicMention',
  TrendSignal: 'TrendSignal',
  ContentOpportunity: 'ContentOpportunity',
  ContentGap: 'ContentGap',
  OpportunityFeedback: 'OpportunityFeedback',
  ContentPlan: 'ContentPlan',
  DraftClaimBinding: 'DraftClaimBinding',
  ContentQualityGateResult: 'ContentQualityGateResult',
  ContentReview: 'ContentReview',
  VoiceProfile: 'VoiceProfile',
  VoiceReceipt: 'VoiceReceipt',
  WritingSample: 'WritingSample',
  ProspectResearch: 'ProspectResearch',
  ProspectSignal: 'ProspectSignal',
  QualificationResult: 'QualificationResult',
  ProspectBrief: 'ProspectBrief',
  OutreachStrategy: 'OutreachStrategy',
  OutreachDraft: 'OutreachDraft',
  OutreachReview: 'OutreachReview',
  PreparedAction: 'PreparedAction',
  ConversationClassificationResult: 'ConversationClassificationResult',
  FollowUpRecommendation: 'FollowUpRecommendation',
  SalesContentSignal: 'SalesContentSignal',
  PublishRecord: 'PublishRecord',
  OutcomeMetric: 'OutcomeMetric',
  OperatorAction: 'OperatorAction',
  LearningProposal: 'LearningProposal',
  AttributionLink: 'AttributionLink',
  PreparationLog: 'PreparationLog',
  CommentSalesSignal: 'CommentSalesSignal'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
