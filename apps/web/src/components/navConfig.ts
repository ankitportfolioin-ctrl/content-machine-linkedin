/* Single source of truth for command-center navigation.
   Labels follow the product IA; `to` values are existing stable routes
   plus the new intelligence screens. */

export interface NavEntry {
  to: string;
  label: string;
  section: string;
  icon: string;
}

export const NAV_SECTIONS: Array<{ title: string; entries: NavEntry[] }> = [
  {
    title: 'Command',
    entries: [
      { to: '/', label: 'Overview', section: 'Command', icon: 'command' },
      { to: '/radar', label: 'Radar', section: 'Command', icon: 'radar' },
    ],
  },
  {
    title: 'Intelligence',
    entries: [
      { to: '/observatory', label: 'Observatory', section: 'Intelligence', icon: 'observe' },
      { to: '/audience', label: 'Audience', section: 'Intelligence', icon: 'audience' },
      { to: '/trends', label: 'Trends', section: 'Intelligence', icon: 'trends' },
      { to: '/opportunities', label: 'Opportunities', section: 'Intelligence', icon: 'target' },
    ],
  },
  {
    title: 'Content',
    entries: [
      { to: '/content', label: 'Studio', section: 'Content', icon: 'studio' },
      { to: '/calendar', label: 'Calendar', section: 'Content', icon: 'calendar' },
      { to: '/approvals', label: 'Approval Queue', section: 'Content', icon: 'approve' },
    ],
  },
  {
    title: 'Learning',
    entries: [
      { to: '/analytics', label: 'Performance', section: 'Learning', icon: 'performance' },
      { to: '/experiments', label: 'Experiments', section: 'Learning', icon: 'flask' },
      { to: '/learning', label: 'Insights', section: 'Learning', icon: 'insights' },
    ],
  },
  {
    title: 'System',
    entries: [
      { to: '/connections', label: 'Connections', section: 'System', icon: 'plugs' },
      { to: '/settings', label: 'Settings', section: 'System', icon: 'settings' },
    ],
  },
];

export const NAV_COMMANDS: NavEntry[] = NAV_SECTIONS.flatMap((s) => s.entries);

/* Breadcrumb + title metadata for the top bar. Unlisted legacy routes
   keep working; they resolve to a generic title. */
export const ROUTE_META: Record<string, { title: string; crumb: string }> = {
  '/': { title: 'Overview', crumb: 'Command' },
  '/radar': { title: 'Radar', crumb: 'Command' },
  '/observatory': { title: 'Observatory', crumb: 'Intelligence' },
  '/audience': { title: 'Audience', crumb: 'Intelligence' },
  '/trends': { title: 'Trends', crumb: 'Intelligence' },
  '/opportunities': { title: 'Opportunities', crumb: 'Intelligence' },
  '/content': { title: 'Studio', crumb: 'Content' },
  '/calendar': { title: 'Calendar', crumb: 'Content' },
  '/approvals': { title: 'Approval Queue', crumb: 'Content' },
  '/analytics': { title: 'Performance', crumb: 'Learning' },
  '/experiments': { title: 'Experiments', crumb: 'Learning' },
  '/learning': { title: 'Insights', crumb: 'Learning' },
  '/connections': { title: 'Connections', crumb: 'System' },
  '/settings': { title: 'Settings', crumb: 'System' },
  '/brain': { title: 'Workbench', crumb: 'Intelligence' },
  '/dashboard': { title: "Today's Brain", crumb: 'Command' },
  '/onboarding': { title: 'Onboarding', crumb: 'System' },
};
