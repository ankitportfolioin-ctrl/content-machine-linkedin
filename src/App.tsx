import React, { useState } from 'react';
import { Header, ActiveTab } from './components/Header';
import { HomeView } from './components/Home/HomeView';
import { ContentWorkspaceView } from './components/Content/ContentWorkspaceView';
import { LeadsWorkspaceView } from './components/Leads/LeadsWorkspaceView';
import { InboxWorkspaceView } from './components/Inbox/InboxWorkspaceView';
import { PipelineWorkspaceView } from './components/Pipeline/PipelineWorkspaceView';
import { AnalyticsWorkspaceView } from './components/Analytics/AnalyticsWorkspaceView';
import { SettingsWorkspaceView } from './components/Settings/SettingsWorkspaceView';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [currentPost, setCurrentPost] = useState<string>('');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Navigation Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'home' && (
          <HomeView
            onNavigate={(tab) => setActiveTab(tab)}
            currentPostText={currentPost}
          />
        )}

        {activeTab === 'content' && (
          <ContentWorkspaceView
            currentPost={currentPost}
            setCurrentPost={setCurrentPost}
          />
        )}

        {activeTab === 'leads' && (
          <LeadsWorkspaceView />
        )}

        {activeTab === 'inbox' && (
          <InboxWorkspaceView />
        )}

        {activeTab === 'pipeline' && (
          <PipelineWorkspaceView />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsWorkspaceView />
        )}

        {activeTab === 'settings' && (
          <SettingsWorkspaceView />
        )}
      </main>

      {/* Persistent Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/40 py-4 text-center text-xs text-slate-500">
        <p>LinkedIn Growth • Unified AI Content & Sales Copilot</p>
      </footer>
    </div>
  );
}
