import { PrismaClient } from '@prisma/client';
import { SourceIngestionService } from '@growth-operator/intelligence';

const prisma = new PrismaClient();
const ingestion = new SourceIngestionService(prisma);

async function test() {
  try {
    const result = await ingestion.ingest('062f7b8e-e5fb-4dc8-bfb5-b2603af2f5bd', 'https://www.deepseek.com/en/harness/', {});
    console.log('Ingestion result:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('Error:', e.message, e.stack);
  } finally {
    await prisma.$disconnect();
  }
}

test();