import { Toaster } from "@/components/ui/toaster";
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import NavigationTracker from '@/lib/NavigationTracker';
import { pagesConfig } from './pages.config';
import { BrowserRouter as Router, Route, Routes, Navigate, useSearchParams, useNavigate } from 'react-router-dom';
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
import OnboardingTour from '@/pages/OnboardingTour';
import PromoPage from '@/pages/PromoPage';
import PaymentFailed from '@/pages/PaymentFailed';
import { MonthProvider } from '@/lib/MonthContext';
import { PrivacyProvider } from '@/lib/PrivacyContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useEffect, Suspense } from 'react';
import { initPushNotifications } from '@/lib/pushNotifications';
import ErrorBoundary from '@/lib/ErrorBoundary';
import { temAcessoPro, pagamentoFalhou } from '@/domain/assinatura';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const PageLoader = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-gray-900">
    <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
  </div>
);

function ReferralCapture() {
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) localStorage.setItem('referral_code', ref.toUpperCase());
  }, []);
  return null;
}

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
    staleTime: 5 * 60 * 1000,
  });
}

function useProfile(userId) {
  return useQuery({
    queryKey: ['profile', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', userId)
        .single();
      return data;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

// A regra mora em src/domain/assinatura.js — uma pergunta, uma
// resposta. Estas duas funções viviam aqui e tinham cópias divergentes
// em Profile.jsx e PlanPage.jsx, que ignoravam `current_period_end`.
const hasActiveAccess = temAcessoPro;
const isPaymentFailed = pagamentoFalhou;

const AuthenticatedApp = () => {
  const { loading, user } = useAuth();
  const { data: subscription, isLoading: subLoading } = useSubscription(user?.id);
  const { data: profile, isLoading: profileLoading } = useProfile(user?.id);
  const navigate = useNavigate();

  const isSubscribed    = hasActiveAccess(subscription);
  const paymentFailed   = isPaymentFailed(subscription);

  useEffect(() => {
    if (user) initPushNotifications();
  }, [user?.id]);

  useEffect(() => {
    if (!user || isSubscribed || subLoading) return;
    const pendingCode = localStorage.getItem("pending_promo_code")
                     || sessionStorage.getItem("pending_promo_code");
    if (pendingCode) {
      navigate(`/Promo?code=${pendingCode}`, { replace: true });
    }
  }, [user?.id, isSubscribed, subLoading]);

  useEffect(() => {
    if (!user || profileLoading) return;
    // O tour não depende mais de assinatura: quem entra no Free também
    // está chegando agora e precisa dele.
    const localCompleted = localStorage.getItem('onboarding_completed') === 'true';
    const dbCompleted = profile?.onboarding_completed === true;
    if (!localCompleted && !dbCompleted) {
      const timer = setTimeout(() => navigate('/onboarding-tour'), 500);
      return () => clearTimeout(timer);
    }
  }, [user?.id, subscription, profile, profileLoading]);

  if (loading || (user && (subLoading || profileLoading))) {
    return <PageLoader />;
  }

  // ── Sem login ────────────────────────────────────────────
  if (!user) {
    return (
      <Routes>
        <Route path="/Promo" element={<PromoPage />} />
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

  // ── Pagamento falhou ─────────────────────────────────────
  if (paymentFailed) {
    return (
      <Routes>
        <Route path="*" element={<PaymentFailed />} />
      </Routes>
    );
  }

  // ── Todo mundo que fez login entra ───────────────────────
  //
  // Antes havia um muro aqui: sem assinatura ativa, qualquer rota caía
  // em `/subscribe`. Isso tornava o plano Free impossível de existir —
  // os limites e o paywall que o app tem hoje nunca seriam alcançados,
  // porque ninguém chegava a ser Free: quem terminava o trial virava
  // bloqueado.
  //
  // Agora o atrito acontece onde a pessoa percebe valor (a terceira
  // conta, a segunda meta, a 101ª transação), não na porta de entrada.
  // Quem decide o que cada um pode fazer são os limites de plano, e a
  // trava real está no banco.
  //
  // `/subscribe` continua existindo — virou upgrade voluntário.
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/onboarding-tour" element={<OnboardingTour />} />
        <Route path="/Promo" element={<PromoPage />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/forgot-password" element={<Navigate to="/" replace />} />
        <Route path="/onboarding/*" element={<Navigate to="/" replace />} />
        {/* Upgrade voluntário: vende para quem é Free, e não faz
            sentido para quem já paga. */}
        <Route path="/subscribe" element={isSubscribed ? <Navigate to="/" replace /> : <Subscribe />} />
        <Route path="/subscription-success" element={<SubscriptionSuccess />} />
        <Route path="/" element={<LayoutWrapper currentPageName={mainPageKey}><MainPage /></LayoutWrapper>} />
        {Object.entries(Pages).map(([path, Page]) => (
          <Route key={path} path={`/${path}`}
            element={<LayoutWrapper currentPageName={path}><Page /></LayoutWrapper>} />
        ))}
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <ErrorBoundary>
    <Router>
      <ReferralCapture />
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
    </ErrorBoundary>
  );
}

export default App;