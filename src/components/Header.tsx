import React, { useState, useEffect } from 'react';
import { 
  Home, 
  PenTool, 
  Users, 
  MessageSquare, 
  Kanban, 
  BarChart3, 
  Settings, 
  Sparkles,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { api } from '../services/api';

export type ActiveTab = 'home' | 'content' | 'leads' | 'inbox' | 'pipeline' | 'analytics' | 'settings';

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenCreatePost?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  activeTab, 
  setActiveTab 
}) => {
  const [inboxCount, setInboxCount] = useState<number>(0);
  const [approvalCount, setApprovalCount] = useState<number>(0);

  useEffect(() => {
    // Quick polling/fetch of counts
    Promise.all([
      api.listInboxActions().catch(() => []),
      api.listPendingApprovals().catch(() => [])
    ]).then(([inb, apprs]) => {
      setInboxCount(inb.length);
      setApprovalCount(apprs.length);
    });
  }, [activeTab]);

  const navItems: { id: ActiveTab; label: string; icon: React.FC<any>; badge?: number }[] = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'content', label: 'Content', icon: PenTool },
    { id: 'leads', label: 'Leads', icon: Users },
    { id: 'inbox', label: 'Inbox', icon: MessageSquare, badge: inboxCount },
    { id: 'pipeline', label: 'Pipeline', icon: Kanban, badge: approvalCount },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Product Brand */}
          <div 
            onClick={() => setActiveTab('home')}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white text-lg shadow-md shadow-blue-500/20 group-hover:scale-105 transition">
              in
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-base tracking-tight">Growth Operator</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  Human-guided AI
                </span>
              </div>
            </div>
          </div>

          {/* Customer-Facing Primary Navigation */}
          <nav className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`nav-tab-${item.id}`}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer relative ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold leading-none ${
                      isActive 
                        ? 'bg-white text-blue-600' 
                        : 'bg-blue-600 text-white'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
};
