import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
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

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
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
