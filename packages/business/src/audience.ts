import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

export const AudienceSegmentSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum([
    'BEGINNER_DEVELOPER',
    'AI_LEARNER',
    'AI_BUILDER',
    'SOFTWARE_DEVELOPER',
    'STARTUP_BUILDER',
    'TECH_STUDENT',
    'TECHNOLOGY_ENTHUSIAST',
    'CUSTOM',
  ]),
  description: z.string().max(2000).optional(),
  problems: z.array(z.string().max(500)).default([]),
  goals: z.array(z.string().max(500)).default([]),
  interests: z.array(z.string().max(200)).default([]),
  tools: z.array(z.string().max(200)).default([]),
  skills: z.array(z.string().max(200)).default([]),
  painPoints: z.array(z.string().max(500)).default([]),
  motivations: z.array(z.string().max(500)).default([]),
  contentPreferences: z.array(z.string().max(200)).default([]),
});

export type AudienceSegmentInput = z.infer<typeof AudienceSegmentSchema>;

export const DEFAULT_YFP_SEGMENTS: AudienceSegmentInput[] = [
  {
    name: 'Beginner Developer',
    type: 'BEGINNER_DEVELOPER',
    description: 'Learning to code, overwhelmed by tools and AI, needs first real projects.',
    problems: [
      "doesn't know what to build",
      "doesn't understand modern tools",
      'overwhelmed by AI',
      "doesn't know how to get practical experience",
    ],
    goals: ['build projects', 'learn coding', 'understand AI', 'get first client/job/project'],
    interests: ['coding', 'AI tools', 'GitHub', 'web development', 'automation', 'projects'],
    tools: ['ChatGPT', 'Claude', 'GitHub', 'VS Code', 'AI coding tools'],
    skills: [],
    painPoints: ['tutorial hell', 'no portfolio', 'fear of blank page'],
    motivations: ['get hired', 'build something real', 'keep up with AI'],
    contentPreferences: ['tutorials', 'how-to', 'project walkthrough', 'tool breakdown'],
  },
  {
    name: 'AI Learner',
    type: 'AI_LEARNER',
    description: 'Curious about AI capabilities, wants practical understanding not hype.',
    problems: ['AI hype overload', 'no mental model of models/agents', 'unsure what is safe to use'],
    goals: ['understand new AI capabilities', 'discover useful tools', 'avoid wasted time'],
    interests: ['AI models', 'AI tools', 'prompts', 'workflows'],
    tools: ['ChatGPT', 'Claude', 'Gemini', 'Perplexity'],
    skills: [],
    painPoints: ['conflicting advice', 'too many launches'],
    motivations: ['stay relevant', 'work smarter'],
    contentPreferences: ['news explanation', 'myth vs fact', 'comparison'],
  },
  {
    name: 'AI Builder',
    type: 'AI_BUILDER',
    description: 'Building with AI APIs, agents and coding assistants.',
    problems: ['choosing stack', 'prompt reliability', 'shipping prototypes fast'],
    goals: ['build AI projects', 'learn agents', 'ship portfolio pieces'],
    interests: ['AI coding tools', 'agents', 'RAG', 'prototyping'],
    tools: ['Cursor', 'Copilot', 'v0', 'LangChain', 'OpenAI API'],
    skills: ['javascript', 'python'],
    painPoints: ['hallucinations', 'cost control', 'evaluation'],
    motivations: ['ship faster', 'get users'],
    contentPreferences: ['tutorial', 'project walkthrough', 'experiment'],
  },
  {
    name: 'Software Developer',
    type: 'SOFTWARE_DEVELOPER',
    description: 'Working dev who wants better workflows and tools.',
    problems: ['tool sprawl', 'keeping skills sharp', 'solving technical problems faster'],
    goals: ['improve workflow', 'learn frameworks', 'solve real bugs'],
    interests: ['developer tools', 'frameworks', 'libraries', 'GitHub'],
    tools: ['VS Code', 'GitHub', 'Docker', 'TypeScript'],
    skills: ['web dev', 'APIs'],
    painPoints: ['legacy code', 'time pressure'],
    motivations: ['productivity', 'craft'],
    contentPreferences: ['tool breakdown', 'how-to', 'case study'],
  },
  {
    name: 'Startup Builder',
    type: 'STARTUP_BUILDER',
    description: 'Technical founder or early builder validating ideas.',
    problems: ['what to build', 'how to prototype cheaply', 'founder technical gaps'],
    goals: ['validate ideas', 'build MVP', 'learn SaaS lessons'],
    interests: ['SaaS', 'product building', 'founder lessons', 'rapid prototyping'],
    tools: ['Supabase', 'Vercel', 'Stripe', 'AI tools'],
    skills: [],
    painPoints: ['limited time', 'no team'],
    motivations: ['launch', 'revenue'],
    contentPreferences: ['framework', 'case study', 'experiment'],
  },
  {
    name: 'Tech Student',
    type: 'TECH_STUDENT',
    description: 'Student learning CS or self-taught path.',
    problems: ['what to learn first', 'free resources', 'portfolio projects'],
    goals: ['learn coding', 'build portfolio', 'get internship'],
    interests: ['tutorials', 'free tools', 'projects'],
    tools: ['free AI tools', 'GitHub Student', 'VS Code'],
    skills: [],
    painPoints: ['tuition cost', 'impostor syndrome'],
    motivations: ['career start'],
    contentPreferences: ['list', 'how-to', 'project walkthrough'],
  },
  {
    name: 'Technology Enthusiast',
    type: 'TECHNOLOGY_ENTHUSIAST',
    description: 'Follows tech launches and platforms.',
    problems: ['signal vs noise', 'understanding implications'],
    goals: ['discover tools', 'understand trends'],
    interests: ['launches', 'platforms', 'cybersecurity', 'infrastructure'],
    tools: [],
    skills: [],
    painPoints: ['hype cycles'],
    motivations: ['curiosity'],
    contentPreferences: ['news explanation', 'comparison'],
  },
];

export class AudienceBrainService {
  private prisma: PrismaClient;
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async list(workspaceId: string) {
    return this.prisma.audienceSegment.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' } });
  }

  async upsert(workspaceId: string, id: string | undefined, input: AudienceSegmentInput) {
    const validated = AudienceSegmentSchema.parse(input);
    if (id) {
      const existing = await this.prisma.audienceSegment.findFirst({ where: { id, workspaceId } });
      if (!existing) throw new Error('Audience segment not found in this workspace.');
      return this.prisma.audienceSegment.update({ where: { id }, data: validated });
    }
    return this.prisma.audienceSegment.create({ data: { workspaceId, ...validated } });
  }

  async seedDefaults(workspaceId: string) {
    const existing = await this.prisma.audienceSegment.count({ where: { workspaceId } });
    if (existing > 0) return this.list(workspaceId);
    for (const seg of DEFAULT_YFP_SEGMENTS) {
      await this.prisma.audienceSegment.create({ data: { workspaceId, ...seg } });
    }
    return this.list(workspaceId);
  }

  async answerWhoWhy(segmentId: string, workspaceId: string): Promise<{ who: string; whyCare: string } | null> {
    const seg = await this.prisma.audienceSegment.findFirst({ where: { id: segmentId, workspaceId } });
    if (!seg) return null;
    const problems = (seg.problems as string[]) ?? [];
    const goals = (seg.goals as string[]) ?? [];
    return {
      who: `${seg.name}: ${seg.description ?? ''}`.trim(),
      whyCare: `Problems: ${problems.slice(0, 3).join('; ')}. Goals: ${goals.slice(0, 3).join('; ')}.`,
    };
  }
}
