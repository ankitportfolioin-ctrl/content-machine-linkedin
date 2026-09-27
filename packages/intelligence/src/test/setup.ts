import { vi } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../../../.env') });

vi.setConfig({ testTimeout: 30000 });