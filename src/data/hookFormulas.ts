import { HookFormula } from '../types/skills';

export const HOOK_FORMULAS: HookFormula[] = [
  {
    id: 'f1',
    code: 'F1',
    name: 'Platform Risk Anaphora',
    goal: 'reposts',
    referenceEng: '4,240 eng',
    bestFor: 'Highlighting platform dependencies, SaaS risk, or rented attention vulnerabilities.',
    whyItWorks: 'Loss aversion stacked 5x with increasing specificity. Identity threat followed by earned tactics.',
    skeleton: `{Platform1} can throttle you overnight.\n{Platform2} can change policy without notice.\n\nYou do not own {audience}. You are renting attention.\n\n[Horror anecdote with real numbers]\n\nSo I changed how we work:\n- [Tactic 1]\n- [Tactic 2]\n- [Tactic 3]\n\n[Metaphor close]`,
    defaultTemplate: `LinkedIn can throttle your organic reach in an afternoon.
Google can de-index your primary SEO funnel on a Tuesday.
Substack can revise their discovery algorithm while you sleep.

You don't own your followers. You don't own the feed. You are renting attention.

In 2023, a close friend watched their entire inbound revenue funnel disappear when their primary ad account was restricted without an appeal route.

So we restructured our distribution playbook:
- Convert 30% of social impressions into direct email subscribers weekly
- Host customer teardowns on our own domain instead of third-party platforms
- Never let a single traffic channel account for more than 40% of pipeline

Castles built on rented land crumble quietly. Build roads you actually own.

What percentage of your pipeline comes from platforms you control?`,
    reachNote2026: 'Specific numbers in line 1 or 2 lift median likes by +34%. Avoid generic "Here is what most people miss" bridges.'
  },
  {
    id: 'f2',
    code: 'F2',
    name: 'R.I.P. Category Obituary',
    goal: 'comments',
    referenceEng: '3,822 eng',
    bestFor: 'Proclaiming the death of an outdated playbook, tool category, or obsolete methodology.',
    whyItWorks: 'High pattern-interrupt morbidity hook. Contrarian autopsy supported by chronological receipts.',
    skeleton: `R.I.P. {Category}.\n\nCause of death: {Specific mechanism + numbers}.\n\n[Concrete evidence with dates and stats]\n\nHere is what actually replaced it:\n- [Shift 1]\n- [Shift 2]\n\n[Discussion question]`,
    defaultTemplate: `R.I.P. 50-page enterprise pitch decks.

Cause of death: Buyers now research you on LinkedIn and GitHub before they ever reply to your SDR.

We audited 42 enterprise sales cycles over the past 9 months:
- Decks sent as attachments were opened an average of 1.4 times
- 84% of prospect stakeholders reviewed our team's public posts and technical tear-downs
- The deals that closed in under 30 days started as asynchronous technical conversations

The PDF pitch deck didn't die because founders stopped writing them. It died because buyers stopped reading marketing fluff.

In 2026, your team's public craft is the pitch deck.

When was the last time you refreshed your technical proof points?`,
    reachNote2026: 'Pair the obituary with numerical evidence in lines 2-4 to avoid being flagged as cheap engagement-bait.'
  },
  {
    id: 'f3',
    code: 'F3',
    name: 'Year-over-Year Pivot',
    goal: 'saves',
    referenceEng: '3,110 eng',
    bestFor: 'Documenting a structural strategy reversal between two fiscal years or market phases.',
    whyItWorks: 'Clean temporal contrast showing maturity and learning through public accountability.',
    skeleton: `In 2024: [Old approach that failed or cost too much]\nIn 2026: [New approach that scaled with numbers]\n\nWhat caused the pivot:\n1. [Catalyst 1]\n2. [Catalyst 2]\n\n[Takeaway for operators]`,
    defaultTemplate: `In 2024: We hired 8 SDRs to send 1,200 cold outbound messages a day. Result: $18,400 monthly burn for 3 closed deals.
In 2026: 2 technical founders publish 3 teardowns a week and reply personally to every prospect. Result: $42,000 in inbound ARR.

What forced the pivot:
1. Deliverability filters stopped 68% of automated domain sequences before they reached inboxes.
2. Senior engineering buyers refuse to talk to scripts—they only engage with peers who understand latency and unit costs.

Volume was the 2022 moat. Relevance and craft is the 2026 moat.

Are you scaling outreach volume or outreach relevance this quarter?`,
    reachNote2026: 'Contrasts perform well if backed by authentic unit metrics.'
  },
  {
    id: 'f4',
    code: 'F4',
    name: 'Time-Anchor Confession',
    goal: 'comments',
    referenceEng: '2,940 eng',
    bestFor: 'Sharing a pivotal leadership decision with an exact timestamp or uncomfortable turning point.',
    whyItWorks: 'Vulnerability backed by narrative urgency and concrete timeline stakes.',
    skeleton: `[Exact date/time]: [Crisis or turning point].\n\n[What went wrong with numbers]\n\nHere is what we decided in the next 48 hours:\n- [Step 1]\n- [Step 2]\n\n[Core lesson]`,
    defaultTemplate: `November 14, 2023 at 4:15 PM.

That was the exact moment our lead term sheet was pulled with 41 days of bank runway remaining.

We had two options:
Option A: Spend the remaining 4 weeks pitching 30 more venture funds with our hat in hand.
Option B: Cut every non-essential tool, launch our self-serve tier in 12 days, and reach customer profitability.

We chose Option B.

By February 1st, we reached cashflow breakeven with $34,200 in monthly recurring revenue.

Relying on external capital had made us complacent about actual conversion velocity.

What was the catalyst that forced your team to become radically self-sufficient?`,
    reachNote2026: 'Ground the timeline in concrete friction rather than generalized melodrama.'
  },
  {
    id: 'f5',
    code: 'F5',
    name: 'Self-Proving Meta',
    goal: 'likes',
    referenceEng: '3,450 eng',
    bestFor: 'Demonstrating a psychological or algorithmic insight directly within the post itself.',
    whyItWorks: 'The reader experiences the phenomenon being described in real-time.',
    skeleton: `You stopped scrolling on this post because [exact mechanism].\n\nNotice what happened:\n- [Observation 1]\n- [Observation 2]\n\nHere is how to apply this to your own writing:\n...`,
    defaultTemplate: `You stopped scrolling on this post because of the white space above this sentence.

Your brain processes line breaks 4x faster than paragraph blocks in the mobile feed.

Here is the exact framework behind it:
1. Line 1 is a visual tripwire under 120 characters.
2. The second paragraph introduces tension before the mobile "see more" cutoff at 210 characters.
3. Every subsequent block answers the question: "Why does this matter right now?"

Great writing isn't about vocabulary. It's about pacing, cadence, and respecting the reader's attention span.

Save this framework for your next draft.`,
    reachNote2026: 'Keep meta-commentary clean; avoid cliché AI phrases like "game changer".'
  },
  {
    id: 'f6',
    code: 'F6',
    name: 'Comment-Gate Lead Magnet',
    goal: 'comments',
    referenceEng: '5,200 eng',
    bestFor: 'Distributing a high-value swipe file, benchmark dataset, or blueprint asset.',
    whyItWorks: 'Direct exchange of value. High comment velocity signals algorithmic distribution.',
    skeleton: `We spent [X weeks/months] compiling [high-value asset].\n\nWhat is inside:\n- [Asset detail 1]\n- [Asset detail 2]\n\nComment "[KEYWORD]" below and I will send you the access link.`,
    defaultTemplate: `We spent months compiling our internal operational benchmark ledger across our customer base.

What is inside the teardown breakdown:
- The exact workflow configuration that cut customer response turnaround from hours to minutes
- Key operational friction points that drain team bandwidth and inflate customer churn
- The checklist our team uses to maintain consistent, predictable execution

Want the benchmark breakdown?

Comment "PLAYBOOK" below and I'll send the direct summary to your inbox.`,
    reachNote2026: 'LinkedIn restricts engagement bait. Deliver actual value and follow up manually.'
  },
  {
    id: 'f7',
    code: 'F7',
    name: 'Odd-Precision Money Ledger',
    goal: 'saves',
    referenceEng: '19.64x baseline',
    bestFor: 'Financial teardowns, cloud bills, SaaS margins, or operational spending audits.',
    whyItWorks: 'Odd-precision numbers trigger immediate believability over rounded estimates.',
    skeleton: `$[Exact Amount].\n\nThat was our exact spend for [Scope / Timeline].\n\n[What we discovered under the hood with dates and line items]\n\nHere is what we cut to reach $[New Amount]:\n- [Action 1]\n- [Action 2]\n\n[Core lesson on operational efficiency]`,
    defaultTemplate: `$[Exact Amount].

That was our exact expenditure for [Context / Timeline].

Earlier this year, our team was managing [Initial Setup] and spending [Original Amount] just to maintain baseline operations.

We simplified our workflow:
- [Action 1: What was removed or consolidated]
- [Action 2: What replaced it]

Result: Turnaround improved by [Metric]% and ongoing overhead dropped by [Percentage]%.

What is a tool or recurring process your team eliminated recently?`,
    reachNote2026: 'The #1 performing formula for B2B engineering and founder leadership. Keep precision intact.'
  },
  {
    id: 'f8',
    code: 'F8',
    name: 'Paid-vs-Free Reversal',
    goal: 'reposts',
    referenceEng: '4,100 eng',
    bestFor: 'Comparing bloated paid enterprise software against lean open-source or native workflows.',
    whyItWorks: 'Empowers operators by showing they can achieve superior results with simpler tools.',
    skeleton: `Tool A costs $30,000/year.\nTool B is free and open-source.\n\nWe tested both across [sample size]. Here is what happened:\n...`,
    defaultTemplate: `Expensive bloated software suite: $24,000/year.
Focused native workflow: $400/year.

We ran both in parallel across 6 months of daily customer operations.

The results:
- Core turnaround: Identical or faster on the focused workflow
- Team onboarding: Days instead of multi-week training
- Hours spent dealing with vendor billing disputes: Zero

Enterprise software often charges a 50x premium for features teams end up bypassing anyway.

Where has your team replaced an overpriced tool with a streamlined native solution?`,
    reachNote2026: 'Avoid sensationalism; provide genuine comparison criteria.'
  },
  {
    id: 'f9',
    code: 'F9',
    name: 'Curiosity-Gap Teaser',
    goal: 'likes',
    referenceEng: '3,890 eng',
    bestFor: 'Sharing a counter-intuitive finding or unexpected breakthrough from production testing.',
    whyItWorks: 'Withholds resolution just enough to pull the reader past the fold, then delivers immediately.',
    skeleton: `Most engineers think [Common Assumption].\n\nOur data showed the exact opposite.\n\n[The discovery and the experiment]\n\n[The conclusion]`,
    defaultTemplate: `Most teams assume adding more tools improves execution velocity.

When we measured operational turnaround across 40 companies, the data showed the exact opposite.

Teams juggling multiple fragmented tools spent:
- Over 30% of their weekly time synchronizing data between systems
- 3x more time diagnosing miscommunicated updates
- Substantially more energy managing tool settings than serving customers

The highest-velocity operators were not the ones with the most complex stacks.
They were the teams maintaining clear, direct workflows with minimal friction.

Is your current workflow optimizing for real customer velocity or tool complexity?`,
    reachNote2026: 'Resolve the curiosity gap within 3 lines to maintain reader trust.'
  },
  {
    id: 'f10',
    code: 'F10',
    name: 'Contrarian + Historical Receipts',
    goal: 'comments',
    referenceEng: '6,100 eng',
    bestFor: 'Debunking an accepted industry dogma using historical precedent or decades-long data.',
    whyItWorks: 'High authority. Contrarian stance protected by historical validation.',
    skeleton: `Everyone in tech is currently rushing to [Trend].\n\nHistory shows this cycle happens every [X] years.\n\n[Historical precedent 1]\n[Historical precedent 2]\n\n[What operators should do today]`,
    defaultTemplate: `Every software vendor is currently rebranding as an "AI Agent Platform."

History shows we have seen this movie three times before:
- 2000: Every business was an "e-business"
- 2011: Every app was "social, local, mobile (SoLoMo)"
- 2021: Every database had a web3 token attached

In every cycle, 95% of the wrapper companies evaporated within 24 months.
The 5% that survived weren't the ones with the flashiest terminology—they were the ones that solved an unglamorous data plumbing bottleneck.

Don't buy hype. Buy durable workflows.

What was an industry buzzword your team successfully ignored?`,
    reachNote2026: 'Generates intense discussion in comment sections. Monitor replies promptly.'
  },
  {
    id: 'f11',
    code: 'F11',
    name: 'Emotional Cold-Open',
    goal: 'likes',
    referenceEng: '3,200 reach',
    bestFor: 'Personal leadership reflections, founder resilience, or burnout retrospectives.',
    whyItWorks: 'Strikes an immediate empathetic chord without corporate posturing.',
    skeleton: `I almost shut down the company on [Specific Date].\n\n[What happened behind closed doors]\n\n[The shift in perspective]\n\n[Closing takeaway]`,
    defaultTemplate: `I almost shut down our startup on October 18th.

We had 6 weeks of runway, two enterprise deals stalled in procurement, and our core database corrupted at 2:00 AM.

Sitting on the floor of my office, I realized the problem wasn't market timing.
The problem was that I had been building features for hypothetical investors instead of solving the acute operational pain of our 12 paying users.

We shipped a single hotfix, spent the entire weekend talking directly to those 12 customers, and signed our first annual prepayment on Tuesday.

When everything feels chaotic, talk to your real users. The noise disappears.`,
    reachNote2026: 'Must feel raw and authentic. Clichés like "hustle harder" will trigger negative feedback.'
  },
  {
    id: 'f12',
    code: 'F12',
    name: 'Permission Slip',
    goal: 'saves',
    referenceEng: '2,800 reach',
    bestFor: 'Reassuring builders that it is acceptable to bypass vanity metrics or hustle culture.',
    whyItWorks: 'Relieves cognitive load and validation anxiety for busy operators.',
    skeleton: `You do not need to [Common Industry Expectation].\n\nIt is completely fine to:\n- [Permission 1]\n- [Permission 2]\n- [Permission 3]\n\n[Grounding reminder]`,
    defaultTemplate: `You don't need to raise venture capital to build a consequential software business.

It is completely fine to:
- Stay a 4-person team doing $1.5M in high-margin ARR
- Say no to enterprise prospects whose requirements derail your core roadmap
- Log off at 6:00 PM and spend dinner with your family
- Write vanilla TypeScript instead of chasing every new JavaScript runtime

The tech industry loves to celebrate headcount and funding rounds.
The bank only cares about cashflow and durable customer retention.

Build a business that serves your life, not your ego.`,
    reachNote2026: 'Consistently high save rates from senior leaders.'
  },
  {
    id: 'f13',
    code: 'F13',
    name: 'Bait-and-Switch Reversal',
    goal: 'comments',
    referenceEng: '3,600 reach',
    bestFor: 'Subverting a common cliché with an unexpected, practical conclusion.',
    whyItWorks: 'Pattern interruption that rewards the reader for paying attention.',
    skeleton: `Everyone wants [Desirable Outcome].\n\nNobody wants [The Uncomfortable Prerequisite].\n\n[Breakdown of the prerequisite]\n\n[Call to action]`,
    defaultTemplate: `Everyone wants product-led viral growth.

Nobody wants to spend 4 hours on Zoom watching a non-technical user get stuck on your onboarding modal.

Here is what happens when you sit with real users in silence:
- You discover your "intuitive" dropdown makes zero sense to anyone outside your company
- You realize your pricing tiers hide the one feature customers actually want to buy
- You learn that 80% of your roadmap is solving problems customers don't have

Growth isn't magic. It's the willingness to watch people struggle with your software until you fix the friction.

When was the last time you watched an unassisted customer onboarding session?`,
    reachNote2026: 'High comment generation from founders and product leads.'
  },
  {
    id: 'f14',
    code: 'F14',
    name: 'Named Gratitude / Tribute',
    goal: 'likes',
    referenceEng: '4,500 reach',
    bestFor: 'Honoring an employee, mentor, partner, or customer with specific receipts.',
    whyItWorks: 'Celebrates human connection with documented deeds rather than empty corporate praise.',
    skeleton: `3 years ago, [Name] joined our team when [Context].\n\n[3 specific accomplishments with numbers]\n\n[What this taught me about leadership]`,
    defaultTemplate: `3 years ago today, Marcus joined our team as employee #3 when we had $4k in MRR and zero health insurance benefits.

Since then, Marcus has:
- Single-handedly architected our payment reconciliation engine handling $18M in transactions
- Mentored 6 junior engineers into senior technical leads
- Fixed our P0 database failover at 3:00 AM on New Year's Eve without complaining

Founders love to take credit for company milestones on LinkedIn.
The reality is that great companies are built by quiet craftsmen who take immense pride in their work.

Thank you, Marcus. We wouldn't be here without you.`,
    reachNote2026: 'High engagement across teams and network connections.'
  },
  {
    id: 'f15',
    code: 'F15',
    name: 'Explain-to-Kids Simplification',
    goal: 'saves',
    referenceEng: '3,900 reach',
    bestFor: 'Demystifying a complex technical architecture, algorithm, or financial model.',
    whyItWorks: 'High clarity and accessibility. Makes advanced concepts immediately understandable.',
    skeleton: `How to explain [Complex Concept] to a 10-year-old:\n\nImagine [Simple Everyday Analogy].\n\n[Breakdown in 3 simple steps]\n\n[Why this matters in production]`,
    defaultTemplate: `How to explain database indexing to a 10-year-old:

Imagine a 1,000-page book on world history.

If you want to find every page mentioning "Alexander the Great" without an index, you have to read all 1,000 pages line by line. That takes hours.

An index is the 10-page glossary in the back that says: "Alexander: pages 42, 88, 114."
You flip right to those pages in 3 seconds.

In software, when your app feels slow, 80% of the time it's because your database is reading all 1,000 pages instead of using an index.

Always check your indexes before paying for bigger cloud servers.`,
    reachNote2026: 'One of the most saved post styles for technical educators.'
  },
  {
    id: 'f16',
    code: 'F16',
    name: 'Status-Strip Humility',
    goal: 'comments',
    referenceEng: '3,300 reach',
    bestFor: 'Stripping away founder vanity and discussing real operational struggles.',
    whyItWorks: 'Total contrast to typical LinkedIn executive braggadocio.',
    skeleton: `My title is [Prestigious Title].\n\nHere is what I actually did this week:\n- [Unglue Task 1]\n- [Unglue Task 2]\n- [Unglue Task 3]\n\n[Reality check for founders]`,
    defaultTemplate: `My LinkedIn title is "Founder & CEO."

Here is what I actually did this Tuesday:
- Manually unsubscribed 40 spam contacts from our CRM database
- Spent 45 minutes on hold with Stripe verifying our business tax address
- Swept the office floor because the cleaning contractor canceled
- Apologized to a customer because our automated email sent them the wrong receipt

Building a company isn't keynote speeches and strategy retreats.
It's an endless stream of unglamorous logistical friction that you solve with a smile.

Never get too proud to do the dirty work.`,
    reachNote2026: 'Encourages peers to share their unvarnished reality.'
  },
  {
    id: 'f17',
    code: 'F17',
    name: 'Controlled A/B Anecdote',
    goal: 'reposts',
    referenceEng: '4,800 reach',
    bestFor: 'Structural comparison of two identical cohorts tested with a single variable change.',
    whyItWorks: 'Scientific rigor applied to operational business decisions.',
    skeleton: `We split our [Team/Cohort] into two groups for 90 days.\n\nCohort A did [X].\nCohort B did [Y].\n\nHere were the results:\n...`,
    defaultTemplate: `We split our 20 outbound sales accounts into two equal cohorts for 90 days.

Cohort A: Sent 500 automated LinkedIn connection blasts per week using standard SaaS templates.
Cohort B: Sent 15 hyper-researched, personalized observations per week citing the prospect's public posts.

Here were the results after 90 days:

Cohort A:
- 1.6% connection accept rate
- 2 accounts flagged for automation
- 0 closed deals

Cohort B:
- 42% connection accept rate
- 8 enterprise discovery calls booked
- $38,000 in closed ARR

Automation magnifies noise. Craft magnifies signal.

Are you running on volume or precision?`,
    reachNote2026: 'Strongest proof format for B2B methodology validation.'
  },
  {
    id: 'f18',
    code: 'F18',
    name: 'False-Binary Dissolve',
    goal: 'comments',
    referenceEng: '3,700 reach',
    bestFor: 'Dissolving a tired industry debate (e.g. Remote vs In-Office, Build vs Buy).',
    whyItWorks: 'Elevates above partisan debates and provides actionable third-way synthesis.',
    skeleton: `The debate between [Option A] and [Option B] is a false dichotomy.\n\nNeither matters if [Underlying Core Truth].\n\n[Synthesis and actionable framework]`,
    defaultTemplate: `The debate between "Microservices vs Monoliths" is a distraction.

Both architectures will fail if your team hasn't defined clear domain boundaries.

A chaotic monolith becomes a chaotic distributed nightmare when you split it across 20 network calls.
A clean monolith with modular interfaces can serve 100,000 users on a single container for $50 a month.

Don't fix team communication bottlenecks with network protocols.
Fix your domain models first.

How has your architecture evolved as your team grew?`,
    reachNote2026: 'Attracts high-level architectural leaders and thoughtful comments.'
  },
  {
    id: 'f19',
    code: 'F19',
    name: 'Anecdote-Meets-Evidence Bridge',
    goal: 'saves',
    referenceEng: '4,400 reach',
    bestFor: 'Starting with a personal story and transitioning smoothly into empirical industry data.',
    whyItWorks: 'Hooks with emotional storytelling and seals authority with empirical proof.',
    skeleton: `[Personal story with emotional stakes]\n\nAt first, I thought this was just our team.\n\nThen I looked at the industry benchmark data across [X] companies:\n- [Data point 1]\n- [Data point 2]\n\n[Actionable takeaway]`,
    defaultTemplate: `Last year, our top engineer handed in their resignation with no notice.

They weren't leaving for higher pay or a sexier brand.
They were leaving because they were spending 60% of every week sitting in status update meetings that could have been an asynchronous message.

At first, I thought this was just our internal failure.
Then we audited 35 software teams across the industry:
- 72% of senior engineers cite meeting fragmentation as their #1 reason for burnout
- Developers with 4+ hours of uninterrupted focus time ship 3.2x more code with 45% fewer regression bugs

We instituted "Zero Meetings Before 11:00 AM" the following Monday.
Developer retention rose to 100% across the following 12 months.

Protect your team's focus time like your company's life depends on it—because it does.`,
    reachNote2026: 'High save and repost rate across engineering and HR executives.'
  },
  {
    id: 'f20',
    code: 'F20',
    name: 'Diverging-Curves Close',
    goal: 'reposts',
    referenceEng: '5,100 reach',
    bestFor: 'Predicting two diverging trajectories for companies adopting vs ignoring a major shift.',
    whyItWorks: 'Compelling forward-looking strategic perspective.',
    skeleton: `Over the next 24 months, two types of companies will emerge:\n\nType 1: [Company that doubles down on obsolete practices]\nType 2: [Company that embraces modern lean craft]\n\n[The mathematical divergence between the two]\n\nWhich path is your team on?`,
    defaultTemplate: `Over the next 24 months, two types of B2B software companies will diverge sharply:

Type 1: Teams that continue burning capital on bloated 30-person sales armies sending automated outbound spam to burned inboxes.
Type 2: Lean 5-person technical teams where founders publish high-signal teardowns and attract qualified buyers organically.

The math behind the divergence:
- Type 1 CAC is increasing by 40% year-over-year as email deliverability collapses
- Type 2 CAC is near zero, with 80%+ gross margins from day one

The era of subsidized vanity growth is over. The era of high-margin founder craft has arrived.

Which trajectory is your organization engineered for?`,
    reachNote2026: 'Executive repost magnet.'
  }
];
