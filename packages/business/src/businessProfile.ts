import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

export const BusinessProfileSchema = z.object({
  name: z.string().max(100),
  description: z.string().optional(),
  mission: z.string().optional(),
  products: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    type: z.string(),
    price: z.number().optional(),
    url: z.string().url().optional(),
    features: z.array(z.string()).default([]),
    targetOutcomes: z.array(z.string()).default([]),
    status: z.string().default('ACTIVE'),
  })).default([]),
  services: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    type: z.string(),
    price: z.number().optional(),
  })).default([]),
  skills: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    level: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']),
  })).default([]),
  ebooks: z.array(z.object({
    title: z.string(),
    description: z.string().optional(),
    url: z.string().url().optional(),
    topics: z.array(z.string()).default([]),
  })).default([]),
  guides: z.array(z.object({
    title: z.string(),
    description: z.string().optional(),
    url: z.string().url().optional(),
    topics: z.array(z.string()).default([]),
  })).default([]),
  targetOutcomes: z.array(z.object({
    outcome: z.string(),
    metric: z.string().optional(),
    target: z.number().optional(),
  })).default([]),
  monetizationGoals: z.array(z.object({
    goal: z.string(),
    target: z.number().optional(),
    timeline: z.string().optional(),
  })).default([]),
});

export type BusinessProfileInput = z.infer<typeof BusinessProfileSchema>;

export interface BusinessProfileWithRelations {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  mission: string | null;
  products: BusinessProfileInput['products'];
  services: BusinessProfileInput['services'];
  skills: BusinessProfileInput['skills'];
  ebooks: BusinessProfileInput['ebooks'];
  guides: BusinessProfileInput['guides'];
  targetOutcomes: BusinessProfileInput['targetOutcomes'];
  monetizationGoals: BusinessProfileInput['monetizationGoals'];
  createdAt: Date;
  updatedAt: Date;
}

export class BusinessProfileService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async getOrCreate(workspaceId: string): Promise<BusinessProfileWithRelations> {
    let profile = await this.prisma.businessProfile.findUnique({
      where: { workspaceId },
    });

    if (!profile) {
      profile = await this.prisma.businessProfile.create({
        data: {
          workspaceId,
          name: '',
          products: [],
          services: [],
          skills: [],
          ebooks: [],
          guides: [],
          targetOutcomes: [],
          monetizationGoals: [],
        },
      });
    }

    return this.toProfile(profile);
  }

  async update(workspaceId: string, input: BusinessProfileInput): Promise<BusinessProfileWithRelations> {
    const validated = BusinessProfileSchema.parse(input);
    
    const profile = await this.prisma.businessProfile.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        ...validated,
      },
      update: validated,
    });

    return this.toProfile(profile);
  }

  async getProducts(workspaceId: string) {
    const profile = await this.getOrCreate(workspaceId);
    return profile.products;
  }

  async getProductByProblem(workspaceId: string, problemId: string) {
    return this.prisma.product.findMany({
      where: { workspaceId, problemId },
    });
  }

  private toProfile(profile: any): BusinessProfileWithRelations {
    return {
      id: profile.id,
      workspaceId: profile.workspaceId,
      name: profile.name,
      description: profile.description,
      mission: profile.mission,
      products: profile.products as BusinessProfileInput['products'],
      services: profile.services as BusinessProfileInput['services'],
      skills: profile.skills as BusinessProfileInput['skills'],
      ebooks: profile.ebooks as BusinessProfileInput['ebooks'],
      guides: profile.guides as BusinessProfileInput['guides'],
      targetOutcomes: profile.targetOutcomes as BusinessProfileInput['targetOutcomes'],
      monetizationGoals: profile.monetizationGoals as BusinessProfileInput['monetizationGoals'],
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}

export const BrandProfileSchema = z.object({
  tone: z.string().optional(),
  writingStyle: z.string().optional(),
  bannedPhrases: z.array(z.string()).default([]),
  preferredVocabulary: z.array(z.string()).default([]),
  visualIdentity: z.object({
    primaryColor: z.string().optional(),
    secondaryColor: z.string().optional(),
    font: z.string().optional(),
    logoUrl: z.string().url().optional(),
  }).optional(),
  contentBoundaries: z.string().optional(),
});

export type BrandProfileInput = z.infer<typeof BrandProfileSchema>;

export interface BrandProfileWithRelations {
  id: string;
  workspaceId: string;
  tone: string | null;
  writingStyle: string | null;
  bannedPhrases: string[];
  preferredVocabulary: string[];
  visualIdentity: BrandProfileInput['visualIdentity'] | null;
  contentBoundaries: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class BrandProfileService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async getOrCreate(workspaceId: string): Promise<BrandProfileWithRelations> {
    let profile = await this.prisma.brandProfile.findUnique({
      where: { workspaceId },
    });

    if (!profile) {
      profile = await this.prisma.brandProfile.create({
        data: {
          workspaceId,
          bannedPhrases: [],
          preferredVocabulary: [],
        },
      });
    }

    return this.toProfile(profile);
  }

  async update(workspaceId: string, input: BrandProfileInput): Promise<BrandProfileWithRelations> {
    const validated = BrandProfileSchema.parse(input);
    
    const profile = await this.prisma.brandProfile.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        ...validated,
      },
      update: validated,
    });

    return this.toProfile(profile);
  }

  private toProfile(profile: any): BrandProfileWithRelations {
    return {
      id: profile.id,
      workspaceId: profile.workspaceId,
      tone: profile.tone,
      writingStyle: profile.writingStyle,
      bannedPhrases: profile.bannedPhrases,
      preferredVocabulary: profile.preferredVocabulary,
      visualIdentity: profile.visualIdentity as BrandProfileInput['visualIdentity'] | null,
      contentBoundaries: profile.contentBoundaries,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}

export type ObjectiveLevel = 'BUSINESS' | 'CONTENT' | 'SALES';

export const ObjectiveSchema = z.object({
  goal: z.string(),
  level: z.enum(['BUSINESS', 'CONTENT', 'SALES']).optional(),
  metric: z.string().optional(),
  target: z.number().optional(),
  deadline: z.string().optional(),
  pillar: z.string().optional(),
  format: z.string().optional(),
  segment: z.string().optional(),
  productId: z.string().optional(),
});

export const StrategyProfileSchema = z.object({
  businessGoals: z.array(ObjectiveSchema.extend({ level: z.literal('BUSINESS').optional() })).default([]),
  audienceGoals: z.array(ObjectiveSchema.extend({ level: z.literal('BUSINESS').optional() })).default([]),
  contentGoals: z.array(ObjectiveSchema.extend({ level: z.literal('CONTENT').optional() })).default([]),
  growthGoals: z.array(ObjectiveSchema.extend({ level: z.literal('BUSINESS').optional() })).default([]),
  productGoals: z.array(ObjectiveSchema.extend({ level: z.literal('BUSINESS').optional() })).default([]),
  salesGoals: z.array(ObjectiveSchema.extend({ level: z.literal('SALES').optional() })).default([]),
});

export type StrategyProfileInput = z.infer<typeof StrategyProfileSchema>;

export interface StrategyGoal {
  goal: string;
  level?: ObjectiveLevel;
  metric?: string;
  target?: number;
  deadline?: string;
  pillar?: string;
  format?: string;
  segment?: string;
  productId?: string;
}

export interface StrategyProfileWithRelations {
  id: string;
  workspaceId: string;
  businessGoals: StrategyGoal[];
  audienceGoals: StrategyGoal[];
  contentGoals: StrategyGoal[];
  growthGoals: StrategyGoal[];
  productGoals: StrategyGoal[];
  salesGoals: StrategyGoal[];
  createdAt: Date;
  updatedAt: Date;
}

export class StrategyProfileService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async getOrCreate(workspaceId: string): Promise<StrategyProfileWithRelations> {
    let profile = await this.prisma.strategyProfile.findUnique({
      where: { workspaceId },
    });

    if (!profile) {
      profile = await this.prisma.strategyProfile.create({
        data: {
          workspaceId,
          businessGoals: [],
          audienceGoals: [],
          contentGoals: [],
          growthGoals: [],
          productGoals: [],
        },
      });
    }

    return this.toProfile(profile);
  }

  async update(workspaceId: string, input: StrategyProfileInput): Promise<StrategyProfileWithRelations> {
    const validated = StrategyProfileSchema.parse(input);
    
    const profile = await this.prisma.strategyProfile.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        ...validated,
      },
      update: validated,
    });

    return this.toProfile(profile);
  }

  private toProfile(profile: any): StrategyProfileWithRelations {
    const addLevel = (goals: any[], level: ObjectiveLevel) => 
      (goals ?? []).map((g: any) => ({ ...g, level: g.level ?? level }));

    return {
      id: profile.id,
      workspaceId: profile.workspaceId,
      businessGoals: addLevel(profile.businessGoals, 'BUSINESS') as StrategyGoal[],
      audienceGoals: addLevel(profile.audienceGoals, 'BUSINESS') as StrategyGoal[],
      contentGoals: addLevel(profile.contentGoals, 'CONTENT') as StrategyGoal[],
      growthGoals: addLevel(profile.growthGoals, 'BUSINESS') as StrategyGoal[],
      productGoals: addLevel(profile.productGoals, 'BUSINESS') as StrategyGoal[],
      salesGoals: addLevel(profile.salesGoals, 'SALES') as StrategyGoal[],
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}

export class BusinessBrainService {
  private businessProfile: BusinessProfileService;
  private brandProfile: BrandProfileService;
  private strategyProfile: StrategyProfileService;

  constructor(prisma: PrismaClient) {
    this.businessProfile = new BusinessProfileService(prisma);
    this.brandProfile = new BrandProfileService(prisma);
    this.strategyProfile = new StrategyProfileService(prisma);
  }

  async getFullProfile(workspaceId: string) {
    const [business, brand, strategy] = await Promise.all([
      this.businessProfile.getOrCreate(workspaceId),
      this.brandProfile.getOrCreate(workspaceId),
      this.strategyProfile.getOrCreate(workspaceId),
    ]);

    return {
      business,
      brand,
      strategy,
    };
  }

  async getBusinessContext(workspaceId: string): Promise<string> {
    const profile = await this.getFullProfile(workspaceId);
    
    let context = `BUSINESS: ${profile.business.name}\n`;
    if (profile.business.mission) context += `MISSION: ${profile.business.mission}\n`;
    if (profile.business.description) context += `DESCRIPTION: ${profile.business.description}\n`;
    
    if (profile.business.products.length > 0) {
      context += `\nPRODUCTS:\n`;
      profile.business.products.forEach((p: any) => {
        context += `- ${p.name}: ${p.description || 'No description'} (${p.type})`;
        if (p.price) context += ` - $${p.price}`;
        context += '\n';
      });
    }

    if (profile.business.skills.length > 0) {
      context += `\nSKILLS TAUGHT:\n`;
      profile.business.skills.forEach((s: any) => {
        context += `- ${s.name} (${s.level})\n`;
      });
    }

    if (profile.brand.tone) context += `\nBRAND TONE: ${profile.brand.tone}\n`;
    if (profile.brand.writingStyle) context += `WRITING STYLE: ${profile.brand.writingStyle}\n`;
    if (profile.brand.bannedPhrases.length > 0) context += `BANNED PHRASES: ${profile.brand.bannedPhrases.join(', ')}\n`;
    if (profile.brand.preferredVocabulary.length > 0) context += `PREFERRED VOCABULARY: ${profile.brand.preferredVocabulary.join(', ')}\n`;
    if (profile.brand.contentBoundaries) context += `CONTENT BOUNDARIES: ${profile.brand.contentBoundaries}\n`;

    if (profile.strategy.contentGoals.length > 0) {
      context += `\nCONTENT GOALS:\n`;
      profile.strategy.contentGoals.forEach((g: any) => {
        context += `- [${g.level ?? 'CONTENT'}] ${g.goal}${g.pillar ? ` (${g.pillar})` : ''}${g.format ? ` [${g.format}]` : ''}\n`;
      });
    }

    if (profile.strategy.salesGoals.length > 0) {
      context += `\nSALES GOALS:\n`;
      profile.strategy.salesGoals.forEach((g: any) => {
        context += `- [${g.level ?? 'SALES'}] ${g.goal}${g.metric ? ` (${g.metric})` : ''}\n`;
      });
    }

    if (profile.strategy.businessGoals.length > 0) {
      context += `\nBUSINESS GOALS:\n`;
      profile.strategy.businessGoals.forEach((g: any) => {
        context += `- [${g.level ?? 'BUSINESS'}] ${g.goal}${g.metric ? ` (${g.metric})` : ''}${g.target ? ` target: ${g.target}` : ''}\n`;
      });
    }

    return context;
  }
}