import { PrismaClient } from '@prisma/client';
import { SourceIngestionService } from '@growth-operator/intelligence';

const prisma = new PrismaClient();
const ingestion = new SourceIngestionService(prisma);

async function test() {
  const result = await ingestion.ingest('062f7b8e-e5fb-4dc8-bfb5-b2603af2f5bd', 'https://www.deepseek.com/en/harness/', {});
  console.log('Result:', JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

test().catch(e => { console.error(e); prisma.$disconnect(); });