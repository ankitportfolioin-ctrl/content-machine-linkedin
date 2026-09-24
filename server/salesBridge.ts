import { spawn } from 'child_process';
import path from 'path';
import { getVoiceProfile, getWorkspaceState, resolveDataDir } from './voiceProfileService';

export async function runSalesApi(command: string, payload: Record<string, any> = {}, workspaceId?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const cwd = path.resolve(process.cwd(), 'linkedin-skills-main');
    const wsId = workspaceId || payload.workspace_id || payload.workspaceId || 'default';
    const voiceProfile = getVoiceProfile(wsId);
    const workspaceState = getWorkspaceState(wsId);
    const dataDir = resolveDataDir(wsId);

    const enrichedPayload = {
      ...payload,
      workspace_id: wsId,
      voiceProfile: payload.voiceProfile || voiceProfile,
      isDemoMode: workspaceState.isDemoMode,
      data_dir: dataDir,
    };

    const child = spawn('python3', ['-m', 'lib.sales_api', command, JSON.stringify(enrichedPayload)], {
      cwd,
      env: {
        ...process.env,
        PYTHONPATH: cwd,
        COPILOT_DATA_DIR: dataDir,
        COPILOT_WORKSPACE_ID: wsId,
        COPILOT_DEMO_MODE: workspaceState.isDemoMode ? 'true' : 'false',
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        try {
          const parsed = JSON.parse(stdout);
          return reject(new Error(parsed.error || `Process failed with exit code ${code}`));
        } catch {
          return reject(new Error(stderr || stdout || `Process exited with code ${code}`));
        }
      }

      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (err: any) {
        reject(new Error(`Failed to parse Python JSON output: ${err.message}. Raw output: ${stdout}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}
