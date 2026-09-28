import { prisma } from '@growth-operator/db';

/**
 * Step A contract: every API test file removes exactly the rows it created.
 *
 * Deleting a workspace cascades to all workspace-scoped children
 * (memberships, profiles, content, leads, intelligence, learning, …),
 * so callers only pass their workspace ids plus any users they created.
 * Users are deleted after workspaces so Restrict-linked author rows are
 * already gone via the workspace cascade.
 *
 * deleteMany (not delete) is used throughout so cleanup is idempotent and
 * never throws on already-removed rows. Each file uses unique stamped
 * ids/emails, so parallel workers can never collide here.
 */
export async function cleanupTestData(input: {
  workspaceIds?: Array<string | undefined | null>;
  userIds?: Array<string | undefined | null>;
  userEmails?: Array<string | undefined | null>;
}): Promise<void> {
  const workspaceIds = (input.workspaceIds ?? []).filter(
    (id): id is string => typeof id === 'string' && id.length > 0
  );
  const userIds = (input.userIds ?? []).filter(
    (id): id is string => typeof id === 'string' && id.length > 0
  );
  const userEmails = (input.userEmails ?? []).filter(
    (email): email is string => typeof email === 'string' && email.length > 0
  );

  if (workspaceIds.length > 0) {
    await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  }
  if (userIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
  if (userEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: userEmails } } });
  }
}
