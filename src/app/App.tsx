import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ScrollToTop } from '../components/ScrollToTop';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { I18nProvider } from '../lib/i18n';
import { ToastProvider } from '../components/Toast';
import { RouteFallback } from '../components/LoadingSkeleton';
import { CookieConsent } from '../components/CookieConsent';

// ═══════════════════════════════════════════════════════════════
// EAGER IMPORTS — SSR-critical components
// ═══════════════════════════════════════════════════════════════
// These MUST be eagerly imported so Vike SSR renders actual
// HTML content instead of a loading skeleton. Lazy imports
// (React.lazy) don't resolve during SSR — they just render the
// Suspense fallback.
//
// Layouts (public/static)
import { MainLayout } from '@layouts/MainLayout';

// Public pages — every route under MainLayout needs SSR content
import { HomePage } from '@pages/HomePage';
import { FreelancersSearchPage } from '@pages/FreelancersSearchPage';
import { ServicesCatalogPage } from '@pages/ServicesCatalogPage';
import { HowItWorksPage } from '@pages/HowItWorksPage';
import { FeaturesPage } from '@pages/FeaturesPage';
import { CategoriesPage } from '@pages/CategoriesPage';
import { PricingPage } from '@pages/PricingPage';
import { AboutPage } from '@pages/AboutPage';
import { PhilosophyPage } from '@pages/PhilosophyPage';
import { ContactPage } from '@pages/ContactPage';
import { InternshipsPage } from '@pages/InternshipsPage';
import { HelpCenterPage } from '@pages/HelpCenterPage';
import { SafetyPage } from '@pages/SafetyPage';
import { GuidelinesPage } from '@pages/GuidelinesPage';
import { StatusPage } from '@pages/StatusPage';
import { TermsPage } from '@pages/TermsPage';
import { PrivacyPage } from '@pages/PrivacyPage';
import { EscrowPolicyPage } from '@pages/EscrowPolicyPage';
import { CookiesPage } from '@pages/CookiesPage';

// Auth-adjacent (stay lazy — only visited via email/auth links, not crawlable)
const AuthCallbackPage = lazy(() => import('@pages/AuthCallbackPage').then(m => ({ default: m.AuthCallbackPage })));
const ForgotPasswordPage = lazy(() => import('@pages/auth/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('@pages/auth/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));
const MagicLinkPage = lazy(() => import('@pages/auth/MagicLinkPage').then(m => ({ default: m.MagicLinkPage })));
const EmailConfirmPage = lazy(() => import('@pages/auth/EmailConfirmPage').then(m => ({ default: m.EmailConfirmPage })));
const VerifyEmailPage = lazy(() => import('@pages/auth/VerifyEmailPage').then(m => ({ default: m.VerifyEmailPage })));

// Dynamic routes (can't be prerendered — no fixed URL list at build time)
const SubcategoryDetailPage = lazy(() => import('@pages/SubcategoryDetailPage').then(m => ({ default: m.SubcategoryDetailPage })));
const PublicFreelancerProfilePage = lazy(() => import('@pages/PublicFreelancerProfilePage').then(m => ({ default: m.PublicFreelancerProfilePage })));
const ServiceDetailPage = lazy(() => import('@pages/ServiceDetailPage').then(m => ({ default: m.ServiceDetailPage })));
const ProjectDetailsPage = lazy(() => import('@pages/ProjectDetailsPage').then(m => ({ default: m.ProjectDetailsPage })));
const PaymentCallbackPage = lazy(() => import('@pages/PaymentCallbackPage').then(m => ({ default: m.PaymentCallbackPage })));
const ContestsPage = lazy(() => import('@pages/ContestsPage').then(m => ({ default: m.ContestsPage })));
const ContestDetailPage = lazy(() => import('@pages/ContestDetailPage').then(m => ({ default: m.ContestDetailPage })));
const CertificateVerifyPage = lazy(() => import('@pages/CertificateVerifyPage').then(m => ({ default: m.CertificateVerifyPage })));

// Public pages with SSR need
import { NotFoundPage } from '@pages/NotFoundPage';
const WaitlistPage = lazy(() => import('@pages/WaitlistPage').then(m => ({ default: m.WaitlistPage })));

// ═══════════════════════════════════════════════════════════════
// LAZY IMPORTS — auth-protected routes (no SSR needed)
// ═══════════════════════════════════════════════════════════════
const DashboardLayout = lazy(() =>
  import('@layouts/DashboardLayout').then(m => ({ default: m.DashboardLayout }))
);
const ClientDashboardLayout = lazy(() =>
  import('@layouts/ClientDashboardLayout').then(m => ({ default: m.ClientDashboardLayout }))
);
const AdminDashboardLayout = lazy(() =>
  import('@layouts/AdminDashboardLayout').then(m => ({ default: m.AdminDashboardLayout }))
);
const AdminAuthGuard = lazy(() =>
  import('@components/AdminAuthGuard').then(m => ({ default: m.AdminAuthGuard }))
);

// Dashboard Pages - Freelancer
const OverviewPage = lazy(() => import('@pages/dashboard/OverviewPage').then(m => ({ default: m.OverviewPage })));
const ProjectFeedPage = lazy(() => import('@pages/dashboard/ProjectFeedPage').then(m => ({ default: m.ProjectFeedPage })));
const InvitesPage = lazy(() => import('@pages/dashboard/InvitesPage').then(m => ({ default: m.InvitesPage })));
const ProposalsPage = lazy(() => import('@pages/dashboard/ProposalsPage').then(m => ({ default: m.ProposalsPage })));
const ContractsPage = lazy(() => import('@pages/dashboard/ContractsPage').then(m => ({ default: m.ContractsPage })));
const WorkspacePage = lazy(() => import('@pages/dashboard/WorkspacePage').then(m => ({ default: m.WorkspacePage })));
const WalletPage = lazy(() => import('@pages/dashboard/WalletPage').then(m => ({ default: m.WalletPage })));
const ProfessionalProfilePage = lazy(() => import('@pages/dashboard/ProfessionalProfilePage').then(m => ({ default: m.ProfessionalProfilePage })));
const ReferralsPage = lazy(() => import('@pages/ReferralsPage').then(m => ({ default: m.ReferralsPage })));
const ProSubscriptionPage = lazy(() => import('@pages/ProSubscriptionPage').then(m => ({ default: m.ProSubscriptionPage })));
const ServicesPage = lazy(() => import('@pages/dashboard/ServicesPage').then(m => ({ default: m.ServicesPage })));
const CreateServicePage = lazy(() => import('@pages/dashboard/CreateServicePage').then(m => ({ default: m.CreateServicePage })));
const AISubscriptionPage = lazy(() => import('@pages/dashboard/AISubscriptionPage').then(m => ({ default: m.AISubscriptionPage })));
const AIAssistantPage = lazy(() => import('@pages/dashboard/AIAssistantPage').then(m => ({ default: m.AIAssistantPage })));
const PortfolioPage = lazy(() => import('@pages/dashboard/PortfolioPage').then(m => ({ default: m.PortfolioPage })));
const AnalyticsPage = lazy(() => import('@pages/dashboard/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const InboxPage = lazy(() => import('@pages/dashboard/InboxPage').then(m => ({ default: m.InboxPage })));
const DisputeResolutionPage = lazy(() => import('@pages/dashboard/DisputeResolutionPage').then(m => ({ default: m.DisputeResolutionPage })));
const IdentityVerificationPage = lazy(() => import('@pages/dashboard/IdentityVerificationPage').then(m => ({ default: m.IdentityVerificationPage })));
const SkillCertificationsPage = lazy(() => import('@pages/dashboard/SkillCertificationsPage').then(m => ({ default: m.SkillCertificationsPage })));
const SkillTestPage = lazy(() => import('@pages/dashboard/SkillTestPage').then(m => ({ default: m.SkillTestPage })));
const TimeTrackingPage = lazy(() => import('@pages/dashboard/TimeTrackingPage').then(m => ({ default: m.TimeTrackingPage })));
const SupportTicketsPage = lazy(() => import('@pages/dashboard/SupportTicketsPage').then(m => ({ default: m.SupportTicketsPage })));

// Dashboard Pages - Client
const ClientDashboardPage = lazy(() => import('../pages/ClientDashboard').then(module => ({ default: module.default })));
const ClientProjectsPage = lazy(() => import('@pages/ClientProjectsPage').then(m => ({ default: m.ClientProjectsPage })));
const ClientMatchesPage = lazy(() => import('@pages/ClientMatchesPage').then(m => ({ default: m.ClientMatchesPage })));
const ClientInvitesPage = lazy(() => import('@pages/ClientInvitesPage').then(m => ({ default: m.ClientInvitesPage })));
const ClientProposalsPage = lazy(() => import('@pages/ClientProposalsPage').then(m => ({ default: m.ClientProposalsPage })));
const ClientContractsPage = lazy(() => import('@pages/ClientContractsPage').then(m => ({ default: m.ClientContractsPage })));
const ClientWorkspacePage = lazy(() => import('@pages/ClientWorkspacePage').then(m => ({ default: m.ClientWorkspacePage })));
const ClientPostProjectPage = lazy(() => import('@pages/ClientPostProjectPage').then(m => ({ default: m.ClientPostProjectPage })));
const ClientAISubscriptionPage = lazy(() => import('@pages/ClientAISubscriptionPage').then(m => ({ default: m.ClientAISubscriptionPage })));
const ClientAIAssistantPage = lazy(() => import('@pages/ClientAIAssistantPage').then(m => ({ default: m.ClientAIAssistantPage })));
const ClientPaymentsPage = lazy(() => import('@pages/ClientPaymentsPage').then(m => ({ default: m.ClientPaymentsPage })));
const ClientSettingsPage = lazy(() => import('@pages/ClientSettingsPage_NEW').then(m => ({ default: m.ClientSettingsPage })));
const ClientFreelancerSearchPage = lazy(() => import('@pages/ClientFreelancerSearchPage').then(m => ({ default: m.ClientFreelancerSearchPage })));
const ClientReviewsPage = lazy(() => import('@pages/ClientReviewsPage').then(m => ({ default: m.ClientReviewsPage })));
const ClientContestsPage = lazy(() => import('@pages/ClientContestsPage').then(m => ({ default: m.ClientContestsPage })));
const ClientContestCreatePage = lazy(() => import('@pages/ClientContestCreatePage').then(m => ({ default: m.ClientContestCreatePage })));
const ClientReferralsPage = lazy(() => import('@pages/ClientReferralsPage').then(m => ({ default: m.ClientReferralsPage })));
const ClientSupportTicketsPage = lazy(() => import('@pages/ClientSupportTicketsPage').then(m => ({ default: m.ClientSupportTicketsPage })));

// Dashboard Pages - Admin
const AdminDashboard = lazy(() => import('@pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const AdminUsersPage = lazy(() => import('@pages/admin/AdminUsersPage').then(m => ({ default: m.AdminUsersPage })));
const AdminProjectsPage = lazy(() => import('@pages/admin/AdminProjectsPage').then(m => ({ default: m.AdminProjectsPage })));
const AdminContractsPage = lazy(() => import('@pages/admin/AdminContractsPage').then(m => ({ default: m.AdminContractsPage })));
const AdminPaymentsPage = lazy(() => import('@pages/admin/AdminPaymentsPage').then(m => ({ default: m.AdminPaymentsPage })));
const AdminDisputesPage = lazy(() => import('@pages/admin/AdminDisputesPage').then(m => ({ default: m.AdminDisputesPage })));
const AdminSubscriptionsPage = lazy(() => import('@pages/admin/AdminSubscriptionsPage').then(m => ({ default: m.AdminSubscriptionsPage })));
const AdminReportsPage = lazy(() => import('@pages/admin/AdminReportsPage').then(m => ({ default: m.AdminReportsPage })));
const AdminInternshipsPage = lazy(() => import('@pages/admin/AdminInternshipsPage').then(m => ({ default: m.AdminInternshipsPage })));
const AdminCertificatesPage = lazy(() => import('@pages/admin/AdminCertificatesPage').then(m => ({ default: m.AdminCertificatesPage })));
const AdminIdentityVerificationPage = lazy(() => import('@pages/admin/AdminIdentityVerificationPage').then(m => ({ default: m.AdminIdentityVerificationPage })));
const AdminSupportTicketsPage = lazy(() => import('@pages/admin/AdminSupportTicketsPage').then(m => ({ default: m.AdminSupportTicketsPage })));

// Onboarding
const OnboardingPage = lazy(() => import('@pages/OnboardingPage').then(m => ({ default: m.OnboardingPage })));
const DevDebugPage = import.meta.env.DEV
  ? lazy(() => import('@pages/DebugPage').then(m => ({ default: m.DebugPage })))
  : null;

// RouteFallback now imported from LoadingSkeleton component

function App() {
  const isDev = import.meta.env.DEV;

  return (
    <>
      <ErrorBoundary>
        <AuthProvider>
          <I18nProvider>
          <ToastProvider>
          <ScrollToTop />
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<MainLayout />}>
                <Route index element={<HomePage />} />
                <Route path="login" element={<Navigate to="/?modal=login" replace />} />
                <Route path="signup" element={<Navigate to="/?modal=signup" replace />} />
                <Route path="how-it-works" element={<HowItWorksPage />} />
                <Route path="features" element={<FeaturesPage />} />
                <Route path="categories" element={<CategoriesPage />} />
                <Route path="categories/:slug/:subslug" element={<SubcategoryDetailPage />} />
                <Route path="pricing" element={<PricingPage />} />
                <Route path="about" element={<AboutPage />} />
                <Route path="philosophy" element={<PhilosophyPage />} />
                <Route path="internships" element={<InternshipsPage />} />
                <Route path="careers" element={<InternshipsPage />} />
                <Route path="contact" element={<ContactPage />} />
                <Route path="help-center" element={<HelpCenterPage />} />
                <Route path="safety" element={<SafetyPage />} />
                <Route path="guidelines" element={<GuidelinesPage />} />
                <Route path="status" element={<StatusPage />} />
                <Route path="terms" element={<TermsPage />} />
                <Route path="privacy" element={<PrivacyPage />} />
                <Route path="escrow-policy" element={<EscrowPolicyPage />} />
                <Route path="cookies" element={<CookiesPage />} />
                <Route path="projects/:projectId" element={<ProjectDetailsPage />} />
                <Route path="payment/:outcome" element={<PaymentCallbackPage />} />
                <Route path="freelancers" element={<FreelancersSearchPage />} />
                <Route path="services" element={<ServicesCatalogPage />} />
                <Route path="freelancer/:freelancerId" element={<PublicFreelancerProfilePage />} />
                <Route path="services/:serviceId" element={<ServiceDetailPage />} />
                <Route path="contests" element={<ContestsPage />} />
                <Route path="contests/:contestId" element={<ContestDetailPage />} />
              </Route>

              {/* Public Certificate Verification Routes — /certificate and /verify-certificate both work */}
              <Route path="certificate/:code" element={<CertificateVerifyPage />} />
              <Route path="certificate" element={<CertificateVerifyPage />} />
              <Route path="verify-certificate/:code" element={<CertificateVerifyPage />} />
              <Route path="verify-certificate" element={<CertificateVerifyPage />} />

              {/* Auth Email Action Routes */}
              <Route path="auth/callback" element={<AuthCallbackPage />} />
              <Route path="auth/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="auth/reset-password" element={<ResetPasswordPage />} />
              <Route path="auth/magic-link" element={<MagicLinkPage />} />
              <Route path="auth/email-confirm" element={<EmailConfirmPage />} />
              <Route path="auth/verify-email" element={<VerifyEmailPage />} />

              {/* Debug route is only available in development */}
              {isDev && DevDebugPage && <Route path="/debug" element={<DevDebugPage />} />}

              {/* Onboarding Routes - Protected */}
              <Route
                path="/onboarding"
                element={
                  <ProtectedRoute allowedRoles={['freelancer', 'client']}>
                    <OnboardingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/onboarding/freelancer"
                element={
                  <ProtectedRoute allowedRoles={['freelancer']}>
                    <OnboardingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/onboarding/client"
                element={
                  <ProtectedRoute allowedRoles={['client']}>
                    <OnboardingPage />
                  </ProtectedRoute>
                }
              />

              {/* Freelancer Dashboard Routes - Protected */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['freelancer']}>
                    <DashboardLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<OverviewPage />} />
                <Route path="feed" element={<ProjectFeedPage />} />
                <Route path="invites" element={<InvitesPage />} />
                <Route path="proposals" element={<ProposalsPage />} />
                <Route path="contracts" element={<ContractsPage />} />
                <Route path="workspace" element={<WorkspacePage />} />
                <Route path="wallet" element={<WalletPage />} />
                <Route path="profile" element={<ProfessionalProfilePage />} />
                <Route path="settings" element={<Navigate to="/dashboard/profile" replace />} />
                <Route path="referrals" element={<ReferralsPage />} />
                <Route path="pro" element={<ProSubscriptionPage />} />
                <Route path="ai-subscription" element={<AISubscriptionPage />} />
                <Route path="ai-assistant" element={<AIAssistantPage />} />
                <Route path="services" element={<ServicesPage />} />
                <Route path="services/create" element={<CreateServicePage />} />
                <Route path="portfolio" element={<PortfolioPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="inbox" element={<InboxPage />} />
                <Route path="disputes" element={<DisputeResolutionPage />} />
                <Route path="identity-verification" element={<IdentityVerificationPage />} />
                <Route path="certifications" element={<SkillCertificationsPage />} />
                <Route path="certifications/:testId" element={<SkillTestPage />} />
                <Route path="time-tracking" element={<TimeTrackingPage />} />
                <Route path="tickets" element={<SupportTicketsPage />} />
              </Route>

              {/* Client Dashboard Routes - Protected */}
              <Route
                path="/client"
                element={
                  <ProtectedRoute allowedRoles={['client']}>
                    <ClientDashboardLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<ClientDashboardPage />} />
                <Route path="post" element={<ClientPostProjectPage />} />
                <Route path="projects" element={<ClientProjectsPage />} />
                <Route path="matches" element={<ClientMatchesPage />} />
                <Route path="invites" element={<ClientInvitesPage />} />
                <Route path="proposals" element={<ClientProposalsPage />} />
                <Route path="contracts" element={<ClientContractsPage />} />
                <Route path="workspace" element={<ClientWorkspacePage />} />
                <Route path="inbox" element={<InboxPage />} />
                <Route path="payments" element={<ClientPaymentsPage />} />
                <Route path="settings" element={<ClientSettingsPage />} />
                <Route path="verification" element={<IdentityVerificationPage />} />
                <Route path="referrals" element={<ClientReferralsPage />} />
                <Route path="ai-subscription" element={<ClientAISubscriptionPage />} />
                <Route path="ai-assistant" element={<ClientAIAssistantPage />} />
                <Route path="find-talent" element={<ClientFreelancerSearchPage />} />
                <Route path="reviews" element={<ClientReviewsPage />} />
                <Route path="contests" element={<ClientContestsPage />} />
                <Route path="contests/create" element={<ClientContestCreatePage />} />
                <Route path="tickets" element={<ClientSupportTicketsPage />} />
              </Route>

              {/* Admin Dashboard Routes - Protected by Supabase Auth */}
              <Route
                path="/admin"
                element={
                  <AdminAuthGuard>
                    <AdminDashboardLayout />
                  </AdminAuthGuard>
                }
              >
                <Route index element={<AdminDashboard />} />
                <Route path="users" element={<AdminUsersPage />} />
                <Route path="projects" element={<AdminProjectsPage />} />
                <Route path="contracts" element={<AdminContractsPage />} />
                <Route path="payments" element={<AdminPaymentsPage />} />
                <Route path="disputes" element={<AdminDisputesPage />} />
                <Route path="subscriptions" element={<AdminSubscriptionsPage />} />
                <Route path="reports" element={<AdminReportsPage />} />
                <Route path="internships" element={<AdminInternshipsPage />} />
                <Route path="certificates" element={<AdminCertificatesPage />} />
                <Route path="identity-verification" element={<AdminIdentityVerificationPage />} />
                <Route path="support-tickets" element={<AdminSupportTicketsPage />} />
              </Route>

              {/* Waitlist Route (public, no layout) */}
              <Route path="/waitlist" element={<WaitlistPage />} />

              {/* 404 Fallback */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
          <CookieConsent />
          </ToastProvider>
          </I18nProvider>
        </AuthProvider>
      </ErrorBoundary>
    </>
  );
}

export default App;
