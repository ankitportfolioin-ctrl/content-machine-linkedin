/* Single source of truth for Growth Operator navigation.
   Redesign: one helpful AI operator, not technical modules.
   - 8 primary items in workflow order (Business → Research → … → Learning)
   - Plain language a 16-year-old can guess on first sight
   - Every entry answers: what is this, why does it matter, what do I do here
   - `to` values reuse existing stable routes so deep links never break.
     New friendly paths (/research, /create, /engage, /people, /sources, /help)
     are aliases registered in App.tsx rendering the same real screens. */

export interface NavEntry {
  to: string;
  label: string;
  section: string;
  icon: string;
  /** One line shown under the label: what this is for. */
  description: string;
  /** Why it matters — shown in tooltip / helper. */
  why: string;
  /** What to do here — shown in tooltip / helper. */
  whatToDo: string;
}

export const NAV_SECTIONS: Array<{ title: string; entries: NavEntry[] }> = [
  {
    title: 'Your operator',
    entries: [
      {
        to: '/',
        label: 'Home',
        section: 'Your operator',
        icon: 'command',
        description: 'Your brand, today',
        why: 'See what is happening and what needs you, in one calm list.',
        whatToDo: 'Start here every day. Follow “Today’s priorities” top to bottom.',
      },
      {
        to: '/observatory',
        label: 'Research',
        section: 'Your operator',
        icon: 'observe',
        description: 'Things worth talking about',
        why: 'Fresh ideas come from real sources you connected — never invented.',
        whatToDo: 'Browse new items, open “Why it matters”, save or turn one into content.',
      },
      {
        to: '/create',
        label: 'Create',
        section: 'Your operator',
        icon: 'studio',
        description: 'Start something new',
        why: 'Every post starts from an idea — yours or one AI found for you.',
        whatToDo: 'Pick Post, Idea, or “Find an idea for me”, then keep writing in Content.',
      },
      {
        to: '/content',
        label: 'Content',
        section: 'Your operator',
        icon: 'target',
        description: 'Ideas, drafts & schedule',
        why: 'Nothing publishes without your review. This is where writing becomes ready.',
        whatToDo: 'Open an idea, write or improve with AI, submit for review, check calendar.',
      },
      {
        to: '/inbox',
        label: 'Engage',
        section: 'Your operator',
        icon: 'radar',
        description: 'Replies & conversations',
        why: 'Thoughtful replies keep your presence useful. Suggestions are drafts only.',
        whatToDo: 'Read a conversation, copy or approve a suggested reply. Nothing sends by itself.',
      },
      {
        to: '/leads',
        label: 'People & Opportunities',
        section: 'Your operator',
        icon: 'audience',
        description: 'People & chances to help',
        why: 'Your own imported people plus topics that match your audience.',
        whatToDo: 'View a person, add a note, change status. Outreach always needs your approval.',
      },
      {
        to: '/analytics',
        label: 'Analytics',
        section: 'Your operator',
        icon: 'performance',
        description: 'How is your presence growing?',
        why: 'Only real recorded results — never demo numbers.',
        whatToDo: 'Check what published, what got attention, and what is still “Not enough data yet”.',
      },
      {
        to: '/learning',
        label: 'Learning',
        section: 'Your operator',
        icon: 'insights',
        description: 'What AI has learned',
        why: 'Observations only count when evidence supports them.',
        whatToDo: 'See evidence, accept or ignore an insight, or test it as an experiment.',
      },
    ],
  },
  {
    title: 'Setup & connections',
    entries: [
      {
        to: '/connections',
        label: 'Connections',
        section: 'Setup & connections',
        icon: 'plugs',
        description: 'Connect an account',
        why: 'LinkedIn and other platforms only work after you connect them officially.',
        whatToDo: 'Connect, reconnect, or check a connection. Publishing shows only if truly available.',
      },
      {
        to: '/sources',
        label: 'Research Sources',
        section: 'Setup & connections',
        icon: 'calendar',
        description: 'Where ideas come from',
        why: 'Research reads only sources you enable — RSS, blogs, Reddit, Google Trends.',
        whatToDo: 'Add a source, test it, pause or remove it. Errors are explained plainly.',
      },
      {
        to: '/settings',
        label: 'Settings',
        section: 'Setup & connections',
        icon: 'settings',
        description: 'Business, audience & voice',
        why: 'Your profile, audience, topics and voice shape every recommendation.',
        whatToDo: 'Edit business, audience, style, schedule, AI and safety settings.',
      },
      {
        to: '/help',
        label: 'Help',
        section: 'Setup & connections',
        icon: 'approve',
        description: 'What goes where?',
        why: 'A 2-minute tour of the whole workflow with real links.',
        whatToDo: 'Follow the Business → Research → Content → Review → Learning path.',
      },
    ],
  },
];

export const NAV_COMMANDS: NavEntry[] = NAV_SECTIONS.flatMap((s) => s.entries);

/* Legacy routes stay working (deep links, tests, bookmarks). They are
   grouped here so the sidebar stays calm but nothing breaks. */
export const LEGACY_LINKS: Array<{ to: string; label: string; parent: string }> = [
  { to: '/radar', label: 'Discover (older view of Research)', parent: '/observatory' },
  { to: '/opportunities', label: 'Post ideas (inside Research → Opportunities)', parent: '/observatory' },
  { to: '/trends', label: "What's trending (inside Research)", parent: '/observatory' },
  { to: '/audience', label: 'Your audience (inside Settings → Audience)', parent: '/settings' },
  { to: '/calendar', label: 'Pipeline (inside Content)', parent: '/content' },
  { to: '/approvals', label: 'Needs your decision (inside Content → Review)', parent: '/content' },
  { to: '/experiments', label: 'Try new things (inside Learning)', parent: '/learning' },
  { to: '/pipeline', label: 'Pipeline (inside People)', parent: '/leads' },
  { to: '/brain', label: 'Deep dive workbench', parent: '/observatory' },
  { to: '/dashboard', label: 'Today (older Home)', parent: '/' },
  { to: '/onboarding', label: 'Get set up', parent: '/' },
];

/* Breadcrumb + title metadata for the top bar.
   Every screen answers: Where am I? What am I looking at?
   Why does it matter? What should I do next? */
export interface RouteMeta {
  title: string;
  crumb: string;
  subtitle: string;
  nextStep: string;
  helpHref: string;
}

export const ROUTE_META: Record<string, RouteMeta> = {
  '/': {
    title: 'Home',
    crumb: 'Your brand, today',
    subtitle: 'Here is what is happening and what you can do next.',
    nextStep: 'Work through Today’s priorities top to bottom.',
    helpHref: '/help',
  },
  '/observatory': {
    title: 'Research',
    crumb: 'Things worth talking about',
    subtitle: 'Real items from sources you connected. Nothing here is invented.',
    nextStep: 'Open “Why it matters”, then save or create content from one item.',
    helpHref: '/help#research',
  },
  '/research': {
    title: 'Research',
    crumb: 'Things worth talking about',
    subtitle: 'Real items from sources you connected. Nothing here is invented.',
    nextStep: 'Open “Why it matters”, then save or create content from one item.',
    helpHref: '/help#research',
  },
  '/create': {
    title: 'Create',
    crumb: 'What would you like to create?',
    subtitle: 'Start from your idea or let AI find one — you always stay in control.',
    nextStep: 'Pick a format, then continue writing in Content.',
    helpHref: '/help#create',
  },
  '/content': {
    title: 'Content',
    crumb: 'Ideas, drafts & schedule',
    subtitle: 'Write, improve with AI, review, and schedule. Nothing publishes by itself.',
    nextStep: 'Open an idea → write → submit for review.',
    helpHref: '/help#content',
  },
  '/calendar': {
    title: 'Pipeline',
    crumb: 'Content · Pipeline',
    subtitle: 'Plans grouped by status. Time-based scheduling is not available.',
    nextStep: 'Open a plan in Content to continue writing, or record publication manually.',
    helpHref: '/help#content',
  },
  '/approvals': {
    title: 'Needs your decision',
    crumb: 'Content · Review',
    subtitle: 'AI suggests — you decide. Approval never means it already happened.',
    nextStep: 'Review → Approve, Edit, or Reject with a reason.',
    helpHref: '/help#approvals',
  },
  '/inbox': {
    title: 'Engage',
    crumb: 'Replies & conversations',
    subtitle: 'Prepare thoughtful replies. Suggestions are drafts until you approve.',
    nextStep: 'Read a conversation, then copy or approve a reply.',
    helpHref: '/help#engage',
  },
  '/engage': {
    title: 'Engage',
    crumb: 'Replies & conversations',
    subtitle: 'Prepare thoughtful replies. Suggestions are drafts until you approve.',
    nextStep: 'Read a conversation, then copy or approve a reply.',
    helpHref: '/help#engage',
  },
  '/leads': {
    title: 'People & Opportunities',
    crumb: 'People you imported',
    subtitle: 'Your own people and real chances to help. Nothing is scraped.',
    nextStep: 'Open a person → add a note → change status when ready.',
    helpHref: '/help#people',
  },
  '/people': {
    title: 'People & Opportunities',
    crumb: 'People you imported',
    subtitle: 'Your own people and real chances to help. Nothing is scraped.',
    nextStep: 'Open a person → add a note → change status when ready.',
    helpHref: '/help#people',
  },
  '/pipeline': {
    title: 'Pipeline',
    crumb: 'People · Pipeline',
    subtitle: 'Track real opportunities by stage. Stages come from your saved records.',
    nextStep: 'Move an opportunity only when something real changed.',
    helpHref: '/help#people',
  },
  '/opportunities': {
    title: 'Post ideas',
    crumb: 'Research · Opportunities',
    subtitle: 'Candidate topics with evidence and scores. Convert one to start writing.',
    nextStep: 'Convert an opportunity into an idea in Content.',
    helpHref: '/help#research',
  },
  '/radar': {
    title: 'Discover',
    crumb: 'Research · Older view',
    subtitle: 'This older recommendation list now lives inside Research.',
    nextStep: 'Go to Research for the simpler view.',
    helpHref: '/help#research',
  },
  '/trends': {
    title: 'What is gaining attention',
    crumb: 'Research · Trends',
    subtitle: 'Topics only count as trending when independent sources agree.',
    nextStep: 'Open a trend to see evidence before creating content.',
    helpHref: '/help#research',
  },
  '/audience': {
    title: 'Your audience',
    crumb: 'Settings · Audience',
    subtitle: 'Who you want to reach — managed in Settings.',
    nextStep: 'Edit audiences in Settings, then return here to see problems they discuss.',
    helpHref: '/help#settings',
  },
  '/analytics': {
    title: 'Analytics',
    crumb: 'How is your presence growing?',
    subtitle: 'Recorded results only. Missing data says so honestly.',
    nextStep: 'Change the period or open related content for evidence.',
    helpHref: '/help#analytics',
  },
  '/experiments': {
    title: 'Try new things',
    crumb: 'Learning · Experiments',
    subtitle: 'Small tests with a clear guess and a measured result.',
    nextStep: 'Start an experiment from a Learning insight.',
    helpHref: '/help#learning',
  },
  '/learning': {
    title: 'Learning',
    crumb: 'What AI has learned',
    subtitle: 'Early signal, repeated observation, or supported conclusion — labelled honestly.',
    nextStep: 'See evidence, then accept, ignore, or test the idea.',
    helpHref: '/help#learning',
  },
  '/connections': {
    title: 'Connections',
    crumb: 'Connect an account',
    subtitle: 'Official connections only. Status is verified, never assumed.',
    nextStep: 'Connect LinkedIn first, then check research sources.',
    helpHref: '/help#connections',
  },
  '/sources': {
    title: 'Research Sources',
    crumb: 'Where ideas come from',
    subtitle: 'RSS, blogs, sites, Reddit and Google Trends — only what you enable runs.',
    nextStep: 'Add a source → Test source → watch Research fill up.',
    helpHref: '/help#sources',
  },
  '/settings': {
    title: 'Settings',
    crumb: 'Business, audience & voice',
    subtitle: 'Business, audience, style, schedule, AI and safety — in plain sections.',
    nextStep: 'Finish Business → Audience → Voice before connecting sources.',
    helpHref: '/help#settings',
  },
  '/help': {
    title: 'Help',
    crumb: 'What goes where?',
    subtitle: 'The whole workflow in 2 minutes, with real links to each step.',
    nextStep: 'Follow Business → Research → Create → Content → Review → Learning.',
    helpHref: '/help',
  },
  '/brain': { title: 'Deep dive', crumb: 'Research · Workbench', subtitle: 'Full evidence trail for advanced review.', nextStep: 'Use Research for daily work; open this for audits.', helpHref: '/help#research' },
  '/dashboard': { title: 'Today', crumb: 'Home · Older view', subtitle: 'This view moved into Home.', nextStep: 'Go to Home for today’s priorities.', helpHref: '/help' },
  '/onboarding': {
    title: 'Get set up',
    crumb: 'Welcome — 6 quick steps',
    subtitle: 'Tell us about your business once. Progress saves automatically.',
    nextStep: 'Continue where you left off — nothing is lost.',
    helpHref: '/help#get-started',
  },
};
