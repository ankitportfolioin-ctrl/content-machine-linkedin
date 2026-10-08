/* Single source of truth for command-center navigation.
   Labels use plain everyday words so a first-time user can guess what
   each page does. `to` values are the existing stable routes — only
   labels, sections and crumbs changed. */

export interface NavEntry {
  to: string;
  label: string;
  section: string;
  icon: string;
}

export const NAV_SECTIONS: Array<{ title: string; entries: NavEntry[] }> = [
  {
    title: 'Start here',
    entries: [
      { to: '/', label: 'Home', section: 'Start here', icon: 'command' },
      { to: '/radar', label: 'Discover', section: 'Start here', icon: 'radar' },
      { to: '/observatory', label: 'Explore', section: 'Start here', icon: 'observe' },
      { to: '/opportunities', label: 'Post ideas', section: 'Start here', icon: 'target' },
    ],
  },
  {
    title: 'Make posts',
    entries: [
      { to: '/content', label: 'Write a post', section: 'Make posts', icon: 'studio' },
      { to: '/calendar', label: 'Schedule', section: 'Make posts', icon: 'calendar' },
      { to: '/approvals', label: 'Review posts', section: 'Make posts', icon: 'approve' },
    ],
  },
  {
    title: 'Your progress',
    entries: [
      { to: '/trends', label: "What's trending", section: 'Your progress', icon: 'trends' },
      { to: '/audience', label: 'Your audience', section: 'Your progress', icon: 'audience' },
      { to: '/analytics', label: 'Your results', section: 'Your progress', icon: 'performance' },
      { to: '/experiments', label: 'Try new things', section: 'Your progress', icon: 'flask' },
      { to: '/learning', label: 'Tips', section: 'Your progress', icon: 'insights' },
    ],
  },
  {
    title: 'Settings',
    entries: [
      { to: '/connections', label: 'Connected accounts', section: 'Settings', icon: 'plugs' },
      { to: '/settings', label: 'Settings', section: 'Settings', icon: 'settings' },
    ],
  },
  {
    title: 'Follow up',
    entries: [
      { to: '/leads', label: 'Leads', section: 'Follow up', icon: 'audience' },
      { to: '/inbox', label: 'Inbox', section: 'Follow up', icon: 'observe' },
      { to: '/pipeline', label: 'Pipeline', section: 'Follow up', icon: 'trends' },
    ],
  },
];

export const NAV_COMMANDS: NavEntry[] = NAV_SECTIONS.flatMap((s) => s.entries);

/* Breadcrumb + title metadata for the top bar. Unlisted legacy routes
   keep working; they resolve to a generic title. */
export const ROUTE_META: Record<string, { title: string; crumb: string }> = {
  '/': { title: 'Home', crumb: 'Start here' },
  '/radar': { title: 'Discover', crumb: 'Start here' },
  '/observatory': { title: 'Explore', crumb: 'Start here' },
  '/audience': { title: 'Your audience', crumb: 'Your progress' },
  '/trends': { title: "What's trending", crumb: 'Your progress' },
  '/opportunities': { title: 'Post ideas', crumb: 'Start here' },
  '/content': { title: 'Write a post', crumb: 'Make posts' },
  '/calendar': { title: 'Schedule', crumb: 'Make posts' },
  '/approvals': { title: 'Review posts', crumb: 'Make posts' },
  '/analytics': { title: 'Your results', crumb: 'Your progress' },
  '/experiments': { title: 'Try new things', crumb: 'Your progress' },
  '/learning': { title: 'Tips', crumb: 'Your progress' },
  '/connections': { title: 'Connected accounts', crumb: 'Settings' },
  '/settings': { title: 'Settings', crumb: 'Settings' },
  '/leads': { title: 'Leads', crumb: 'Follow up' },
  '/inbox': { title: 'Inbox', crumb: 'Follow up' },
  '/pipeline': { title: 'Pipeline', crumb: 'Follow up' },
  '/brain': { title: 'Deep dive', crumb: 'Start here' },
  '/dashboard': { title: 'Today', crumb: 'Start here' },
  '/onboarding': { title: 'Get set up', crumb: 'Start here' },
};
