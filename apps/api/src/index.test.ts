import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';
import bcrypt from 'bcryptjs';

describe('API Health Endpoints', () => {
  it('GET /api/v1/health returns healthy status', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);

    expect(response.body).toMatchObject({
      status: 'healthy',
      service: 'growth-operator-api',
    });
    expect(response.body.timestamp).toBeDefined();
  });

  it('GET /api/v1/ready returns ready when database is connected', async () => {
    const response = await request(app).get('/api/v1/ready').expect(200);

    expect(response.body).toMatchObject({
      status: 'ready',
      service: 'growth-operator-api',
      dependencies: {
        database: 'connected',
      },
    });
    expect(response.body.timestamp).toBeDefined();
  });
});

describe('API Validation', () => {
  it('POST /api/v1/auth/register validates required fields', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({})
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toBeDefined();
  });

  it('POST /api/v1/auth/login validates required fields', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({})
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/auth/register rejects invalid email', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'invalid', password: 'password123', name: 'Test' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/auth/register rejects short password', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test@example.com', password: 'short', name: 'Test' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('Authentication', () => {
  let testUser: { id: string; email: string; password: string; token: string };

  beforeAll(async () => {
    const password = 'testpassword123';
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email: `test-${Date.now()}@example.com`,
        passwordHash,
        name: 'Test User',
      },
    });

    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password })
      .expect(200);

    testUser = {
      id: user.id,
      email: user.email,
      password,
      token: loginResponse.body.token,
    };
  });

  afterAll(async () => {
    if (testUser) {
      await prisma.user.delete({ where: { id: testUser.id } });
    }
  });

  it('POST /api/v1/auth/login returns token for valid credentials', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: testUser.password })
      .expect(200);

    expect(response.body.token).toBeDefined();
    expect(response.body.user).toMatchObject({
      id: testUser.id,
      email: testUser.email,
      name: 'Test User',
    });
  });

  it('POST /api/v1/auth/login rejects invalid password', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testUser.email, password: 'wrongpassword' })
      .expect(401);

    expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('GET /api/v1/auth/me returns user with valid token', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${testUser.token}`)
      .expect(200);

    expect(response.body.user).toMatchObject({
      id: testUser.id,
      email: testUser.email,
      name: 'Test User',
    });
  });

  it('GET /api/v1/auth/me rejects request without token', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .expect(401);

    expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('GET /api/v1/auth/me rejects invalid token', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
  });

  it('POST /api/v1/auth/verify validates token', async () => {
    const response = await request(app)
      .post('/api/v1/auth/verify')
      .set('Authorization', `Bearer ${testUser.token}`)
      .expect(200);

    expect(response.body.valid).toBe(true);
  });
});

describe('Workspace Authorization', () => {
  let testUser: { id: string; email: string; password: string; token: string };
  let testWorkspace: { id: string; slug: string };
  let otherWorkspace: { id: string; slug: string };

  beforeAll(async () => {
    const password = 'testpassword123';
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email: `workspace-test-${Date.now()}@example.com`,
        passwordHash,
        name: 'Workspace Test User',
      },
    });

    const loginResponse = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password })
      .expect(200);

    testUser = {
      id: user.id,
      email: user.email,
      password,
      token: loginResponse.body.token,
    };

    const workspace = await prisma.workspace.create({
      data: {
        name: 'Test Workspace',
        slug: `test-workspace-${Date.now()}`,
        memberships: {
          create: { userId: user.id, role: 'OWNER' },
        },
      },
    });
    testWorkspace = { id: workspace.id, slug: workspace.slug };

    const otherWorkspaceData = await prisma.workspace.create({
      data: {
        name: 'Other Workspace',
        slug: `other-workspace-${Date.now()}`,
      },
    });
    otherWorkspace = { id: otherWorkspaceData.id, slug: otherWorkspaceData.slug };
  });

  afterAll(async () => {
    await prisma.workspaceMembership.deleteMany({
      where: { userId: testUser.id },
    });
    await prisma.workspace.deleteMany({
      where: { id: { in: [testWorkspace.id, otherWorkspace.id] } },
    });
    await prisma.user.delete({ where: { id: testUser.id } });
  });

  it('GET /api/v1/workspaces returns user workspaces', async () => {
    const response = await request(app)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${testUser.token}`)
      .expect(200);

    expect(response.body.workspaces).toHaveLength(1);
    expect(response.body.workspaces[0].id).toBe(testWorkspace.id);
    expect(response.body.workspaces[0].role).toBe('OWNER');
  });

  it('GET /api/v1/workspaces/:id returns workspace details', async () => {
    const response = await request(app)
      .get(`/api/v1/workspaces/${testWorkspace.id}`)
      .set('Authorization', `Bearer ${testUser.token}`)
      .set('X-Workspace-ID', testWorkspace.id)
      .expect(200);

    expect(response.body.workspace.id).toBe(testWorkspace.id);
    expect(response.body.workspace.memberships).toHaveLength(1);
  });

  it('GET /api/v1/workspaces/:id rejects access to non-member workspace', async () => {
    const response = await request(app)
      .get(`/api/v1/workspaces/${otherWorkspace.id}`)
      .set('Authorization', `Bearer ${testUser.token}`)
      .set('X-Workspace-ID', otherWorkspace.id)
      .expect(403);

    expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
  });

  it('POST /api/v1/workspaces creates new workspace', async () => {
    const response = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${testUser.token}`)
      .send({ name: 'New Workspace' })
      .expect(201);

    expect(response.body.workspace.name).toBe('New Workspace');
    expect(response.body.workspace.memberships[0].role).toBe('OWNER');

    // Step A contract: remove the workspace this test created.
    await prisma.workspace.delete({ where: { id: response.body.workspace.id as string } });
  });

  it('POST /api/v1/workspaces/:id/members adds member', async () => {
    const otherUser = await prisma.user.create({
      data: {
        email: `member-${Date.now()}@example.com`,
        passwordHash: await bcrypt.hash('password123', 12),
        name: 'Member User',
      },
    });

    const response = await request(app)
      .post(`/api/v1/workspaces/${testWorkspace.id}/members`)
      .set('Authorization', `Bearer ${testUser.token}`)
      .set('X-Workspace-ID', testWorkspace.id)
      .send({ userId: otherUser.id, role: 'member' })
      .expect(201);

    expect(response.body.membership.userId).toBe(otherUser.id);
    expect(response.body.membership.role).toBe('MEMBER');

    await prisma.user.delete({ where: { id: otherUser.id } });
  });

  it('Workspace isolation: cannot access other workspace data', async () => {
    const response = await request(app)
      .get('/api/v1/profiles')
      .set('Authorization', `Bearer ${testUser.token}`)
      .set('X-Workspace-ID', otherWorkspace.id)
      .expect(403);

    expect(response.body.error.code).toBe('AUTHORIZATION_ERROR');
  });
});

describe('Database Connectivity', () => {
  it('Prisma client connects to database', async () => {
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    expect(result).toEqual([{ test: 1 }]);
  });

  it('Can create and read user', async () => {
    const passwordHash = await bcrypt.hash('password123', 12);
    const user = await prisma.user.create({
      data: {
        email: `db-test-${Date.now()}@example.com`,
        passwordHash,
        name: 'DB Test User',
      },
    });

    const found = await prisma.user.findUnique({ where: { id: user.id } });
    expect(found).toMatchObject({
      id: user.id,
      email: user.email,
      name: 'DB Test User',
    });

    await prisma.user.delete({ where: { id: user.id } });
  });

  it('Can create and read workspace-scoped entity (Profile)', async () => {
    const passwordHash = await bcrypt.hash('password123', 12);
    const user = await prisma.user.create({
      data: {
        email: `profile-test-${Date.now()}@example.com`,
        passwordHash,
        name: 'Profile Test User',
      },
    });

    const workspace = await prisma.workspace.create({
      data: {
        name: 'Profile Test Workspace',
        slug: `profile-test-${Date.now()}`,
        memberships: { create: { userId: user.id, role: 'OWNER' } },
      },
    });

    const profile = await prisma.profile.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        headline: 'Test Headline',
      },
    });

    const found = await prisma.profile.findUnique({
      where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
    });
    expect(found).toMatchObject({
      id: profile.id,
      userId: user.id,
      workspaceId: workspace.id,
      headline: 'Test Headline',
    });

    await prisma.profile.delete({ where: { id: profile.id } });
    await prisma.workspace.delete({ where: { id: workspace.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});