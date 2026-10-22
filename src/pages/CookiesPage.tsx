import { Link } from 'react-router-dom';
import { Cookie, Settings, Shield } from 'lucide-react';
import { formatLegalLastUpdatedLine } from '@/lib/legalLastUpdated';

export function CookiesPage() {
  const cookieTypes = [
    {
      icon: Cookie,
      title: 'Essential Cookies',
      description: 'Required for the website to function properly. Cannot be disabled.',
      examples: 'Session cookies, authentication tokens',
    },
    {
      icon: Settings,
      title: 'Functional Cookies',
      description: 'Enable enhanced features and personalization.',
      examples: 'Language preferences, theme settings',
    },
    {
      icon: Shield,
      title: 'Analytics (no cookies)',
      description: 'We measure aggregate page views and catch client-side errors without setting a cookie or following you across sites.',
      examples: 'Cookieless page-view counts (Vercel Analytics) and error reports (Sentry)',
    },
  ];

  return (
    <div className="min-h-screen bg-cream font-sans pb-24 text-slate-800">
      {/* Premium Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/50">
        <div className="mx-auto max-w-[100rem] px-4 sm:px-6 lg:px-8 2xl:px-12 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <img src="/UpdatedLogo.webp" alt="Growlancer" className="h-8 w-8 rounded-lg transition-transform group-hover:scale-105" />
            <span className="font-display font-black text-xl tracking-tight text-slate-900">Growlancer</span>
          </Link>
          <Link to="/" className="inline-block py-1 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">Back to Home</Link>
        </div>
      </header>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 2xl:px-12">
          <h1 className="font-display text-4xl font-bold text-slate-900 mb-8">Cookie Policy</h1>
          <p className="text-slate-600 mb-8">{formatLegalLastUpdatedLine()}</p>
          
          <div className="prose prose-slate max-w-none">
            <p className="text-slate-600 mb-8">
              This Cookie Policy explains how Growlancer uses cookies and similar technologies 
              to recognize you when you visit our platform.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mb-2">What Are Cookies?</h2>
            <p className="text-slate-600 mb-8">
              Cookies are small data files stored on your device when you visit a website. 
              They help websites remember your preferences and improve your browsing experience.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mb-3">Types of Cookies We Use</h2>
            <div className="space-y-3 mb-8">
              {cookieTypes.map((type, i) => (
                <div key={i} className="bg-white rounded-xl p-3 shadow-sm border border-slate-200/60">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                      <type.icon className="w-5 h-5 text-emerald-600" />
                    </div>
                    <h3 className="font-bold text-slate-900">{type.title}</h3>
                  </div>
                  <p className="text-slate-600 mb-2">{type.description}</p>
                  <p className="text-sm text-slate-500">Examples: {type.examples}</p>
                </div>
              ))}
            </div>

            <p className="text-slate-600 mb-8">
              We do not currently use marketing or advertising cookies, and we do not deploy third-party behavioral tracking pixels. Essential cookies are required for the platform to function; functional cookies are non-essential and can be managed through your browser settings where applicable. Our analytics is cookieless — it counts page views in aggregate and reports errors, and it cannot identify you. If we ever introduce marketing cookies in the future, this policy will be updated accordingly.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mb-2">Managing Cookies</h2>
            <p className="text-slate-600 mb-8">
              You can manage cookies through your browser settings where applicable. Note that disabling certain cookies 
              may affect the functionality of our platform. For more information, visit 
              <a href="https://www.aboutcookies.org" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline"> aboutcookies.org</a>.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mb-2">Your Consent Choices</h2>
            <p className="text-slate-600 mb-4">
              On your first visit we ask which categories you allow. Essential storage is always
              on; analytics and functional preferences are optional. Your choice is stored on
              your device under <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">growlancer_consent</code>{' '}
              so we do not ask again. You can change your mind at any time by clearing that entry
              in your browser&apos;s site-data settings and reloading the page — the banner will
              reappear and you can choose again. Withdrawing analytics consent stops new
              measurements; it does not delete aggregate counts already recorded.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mb-2">Changes to This Policy</h2>
            <p className="text-slate-600 mb-8">
              We may update this policy from time to time. Changes will be posted on this page with an updated date.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mb-2">Contact</h2>
            <p className="text-slate-600">
              Questions about cookies or this policy? Email{' '}
              <a href="mailto:support@growlancer.com" className="text-emerald-600 hover:underline">support@growlancer.com</a>{' '}
              — we acknowledge requests within 24 hours and aim to resolve them within 15 days.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
