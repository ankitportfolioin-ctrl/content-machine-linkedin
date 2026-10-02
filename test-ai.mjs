const API_URL = 'http://localhost:3001/api/v1';

async function test() {
  const email = `test-${Date.now()}@example.com`;
  const password = 'testpassword123';
  
  // Register
  const reg = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: 'Test User' })
  });
  const regData = await reg.json();
  const token = regData.token;
  console.log('Registered:', reg.status);
  
  // Create workspace
  const ws = await fetch(`${API_URL}/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'Test WS' })
  });
  const wsData = await ws.json();
  const wsId = wsData.workspace.id;
  console.log('Workspace created:', ws.status);
  
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Workspace-ID': wsId
  };
  
  // Create content idea
  const idea = await fetch(`${API_URL}/content-ideas`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: 'Test', description: 'Test' })
  });
  const ideaData = await idea.json();
  const ideaId = ideaData.contentIdea.id;
  console.log('Idea created:', idea.status);
  
  // Test content plan generate
  console.log('\n--- Testing /content-plans/generate ---');
  const start = Date.now();
  const planGen = await fetch(`${API_URL}/content-plans/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ contentIdeaId: ideaId, thesisOverride: 'Test thesis', audienceOverride: 'Developers' })
  });
  const duration = Date.now() - start;
  const planText = await planGen.text();
  console.log(`Status: ${planGen.status} (${duration}ms)`);
  console.log('Response:', planText);
  
  if (planGen.status === 201) {
    const planData = JSON.parse(planText);
    const planId1 = planData.plan.id;
    
    // Test compose
    console.log('\n--- Testing /content-drafts/compose ---');
    const plan = await fetch(`${API_URL}/content-plans`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contentIdeaId: ideaId,
        thesis: 'Test thesis',
        audience: 'Developers',
        objective: 'EDUCATE',
        angle: 'EDUCATIONAL',
        format: 'TEXT_POST',
        narrativeStructure: 'PROBLEM_WHY_SOLUTION',
        keyPoints: ['Point 1'],
        evidenceMap: [],
        mustNotClaim: []
      })
    });
    const planData2 = await plan.json();
    const planId = planData2.plan.id;
    
    await fetch(`${API_URL}/content-plans/${planId}/approve`, {
      method: 'POST',
      headers
    });
    
    const composeStart = Date.now();
    const compose = await fetch(`${API_URL}/content-drafts/compose`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ planId })
    });
    const composeDuration = Date.now() - composeStart;
    const composeText = await compose.text();
    console.log(`Status: ${compose.status} (${composeDuration}ms)`);
    console.log('Response:', composeText);
  }
  
  // Test prospects research synthesize
  console.log('\n--- Testing /prospects/research/:id/synthesize ---');
  const lead = await fetch(`${API_URL}/leads`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Test Lead', headline: 'CTO', company: 'TestCo', linkedinUrl: 'https://linkedin.com/in/test' })
  });
  const leadData = await lead.json();
  const leadId = leadData.lead.id;
  
  const research = await fetch(`${API_URL}/prospects/research`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ leadId, name: 'Test Lead', title: 'CTO', company: 'TestCo' })
  });
  const researchData = await research.json();
  const researchId = researchData.research.id;
  
  const synthStart = Date.now();
  const synth = await fetch(`${API_URL}/prospects/research/${researchId}/synthesize`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ material: ['Test material'] })
  });
  const synthDuration = Date.now() - synthStart;
  const synthText = await synth.text();
  console.log(`Status: ${synth.status} (${synthDuration}ms)`);
  console.log('Response:', synthText);
  
  // Test outreach drafts
  console.log('\n--- Testing /outreach/drafts ---');
  const strategy = await fetch(`${API_URL}/outreach/strategies`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      leadId,
      briefId: null,
      objective: 'INTRODUCE',
      audience: 'CTO at TestCo',
      relationshipStage: 'COLD',
      angle: 'EDUCATIONAL',
      reasonForContact: 'Test reason',
      relevantEvidence: [],
      personalizationLevel: 'LIGHT',
      ctaType: null,
      riskFlags: [],
      mustNotClaim: []
    })
  });
  const strategyData = await strategy.json();
  const strategyId = strategyData.strategy.id;
  
  await fetch(`${API_URL}/outreach/strategies/${strategyId}/approve`, {
    method: 'POST',
    headers
  });
  
  const draftStart = Date.now();
  const draft = await fetch(`${API_URL}/outreach/drafts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ strategyId, draftType: 'FIRST_MESSAGE' })
  });
  const draftDuration = Date.now() - draftStart;
  const draftText = await draft.text();
  console.log(`Status: ${draft.status} (${draftDuration}ms)`);
  console.log('Response:', draftText);
}

test().catch(console.error);