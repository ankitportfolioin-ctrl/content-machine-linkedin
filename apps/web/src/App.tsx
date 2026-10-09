import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import { OverviewPage } from './pages/OverviewPage';
import { RadarPage } from './pages/RadarPage';
import { ObservatoryPage } from './pages/ObservatoryPage';
import { AudiencePage } from './pages/AudiencePage';
import { TrendsPage } from './pages/TrendsPage';
import { OpportunitiesPage } from './pages/OpportunitiesPage';
import { CalendarPage } from './pages/CalendarPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { ExperimentsPage } from './pages/ExperimentsPage';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { ContentPage } from './pages/ContentPage';
import { BrainPage } from './pages/BrainPage';
import { DashboardPage } from './pages/DashboardPage';
import { LearningPage } from './pages/LearningPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { LeadsPage } from './pages/LeadsPage';
import { InboxPage } from './pages/InboxPage';
import { PipelinePage } from './pages/PipelinePage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SettingsPage } from './pages/SettingsPage';
import { CreatePage } from './pages/CreatePage';
import { SourcesPage } from './pages/SourcesPage';
import { HelpPage } from './pages/HelpPage';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<OverviewPage />} />
            {/* Primary redesign routes (plain language) */}
            <Route path="research" element={<ObservatoryPage />} />
            <Route path="create" element={<CreatePage />} />
            <Route path="engage" element={<InboxPage />} />
            <Route path="people" element={<LeadsPage />} />
            <Route path="sources" element={<SourcesPage />} />
            <Route path="help" element={<HelpPage />} />
            {/* Stable legacy routes — all keep working */}
            <Route path="radar" element={<RadarPage />} />
            <Route path="observatory" element={<ObservatoryPage />} />
            <Route path="audience" element={<AudiencePage />} />
            <Route path="trends" element={<TrendsPage />} />
            <Route path="opportunities" element={<OpportunitiesPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="experiments" element={<ExperimentsPage />} />
            <Route path="connections" element={<ConnectionsPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="learning" element={<LearningPage />} />
            <Route path="onboarding" element={<OnboardingPage />} />
            <Route path="content" element={<ContentPage />} />
            <Route path="brain" element={<BrainPage />} />
            <Route path="leads" element={<LeadsPage />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="pipeline" element={<PipelinePage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
