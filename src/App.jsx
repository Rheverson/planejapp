import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import NavigationTracker from '@/lib/NavigationTracker';
import { pagesConfig } from './pages.config';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { SharedProfileProvider } from '@/lib/SharedProfileContext';
import Login from '@/pages/Login';
import Verify from '@/pages/auth/Verify';
import OnboardingName from '@/pages/auth/OnboardingName';
import OnboardingGoals from '@/pages/auth/OnboardingGoals';
import OnboardingPassword from '@/pages/auth/OnboardingPassword';
import ForgotPassword from "@/pages/auth/ForgotPassword";
import ResetPassword from "@/pages/auth/ResetPassword";
import Subscribe from "@/pages/Subscribe";
import SubscriptionSuccess from "@/pages/SubscriptionSuccess";
import { MonthProvider } from '@/lib/MonthContext';
import { PrivacyProvider } from '@/lib/PrivacyContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

// Hook para verificar assinatura
function useSubscription(userId) {
  return useQuery({
    queryKey: ['subscription', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .single();
      return data;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // 5 minutos
  });
}

const AuthenticatedApp = () => {
  const { loading, user } = useAuth();
  const { data: subscription, isLoading: subLoading } = useSubscription(user?.id);

  if (loading || (user && subLoading)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/auth/verify" element={<Verify />} />
        <Route path="/onboarding/name" element={<OnboardingName />} />
        <Route path="/onboarding/goals" element={<OnboardingGoals />} />
        <Route path="/onboarding/password" element={<OnboardingPassword />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Verifica se assinatura está ativa ou em trial
  const isSubscribed = subscription && [
    'active', 'trialing'
  ].includes(subscription.status);

  // Trial expirado ou sem assinatura
  const needsSubscription = !isSubscribed;

  // Se não tem assinatura ativa, manda para Subscribe
  // exceto se já está na página de subscribe ou success
  if (needsSubscription) {
    return (
      <Routes>
        <Route path="/subscribe" element={<Subscribe />} />
        <Route path="/subscription-success" element={<SubscriptionSuccess />} />
        <Route path="*" element={<Navigate to="/subscribe" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/forgot-password" element={<Navigate to="/" replace />} />
      <Route path="/onboarding/*" element={<Navigate to="/" replace />} />
      <Route path="/subscribe" element={<Navigate to="/" replace />} />
      <Route path="/subscription-success" element={<SubscriptionSuccess />} />
      <Route path="/" element={<LayoutWrapper currentPageName={mainPageKey}><MainPage /></LayoutWrapper>} />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={<LayoutWrapper currentPageName={path}><Page /></LayoutWrapper>}
        />
      ))}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/*"
          element={
            <AuthProvider>
              <QueryClientProvider client={queryClientInstance}>
                <SharedProfileProvider>
                  <MonthProvider>
                    <PrivacyProvider>
                      <NavigationTracker />
                      <AuthenticatedApp />
                    </PrivacyProvider>
                  </MonthProvider>
                </SharedProfileProvider>
              </QueryClientProvider>
            </AuthProvider>
          }
        />
      </Routes>
      <Toaster />
    </Router>
  );
}

export default App;