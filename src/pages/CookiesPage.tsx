import { Link } from 'react-router-dom';
import { Cookie, Home, Settings, Shield } from 'lucide-react';
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
      title: 'Analytics Cookies',
      description: 'Help us understand how visitors interact with our website.',
      examples: 'Page views, click tracking, error reporting',
    },
  ];

  return (
    <div className="min-h-screen bg-cream font-sans pb-24 text-slate-800">
      {/* Premium Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <img src="/Growlancer Logo (2).png" alt="Growlancer" className="h-8 w-8 rounded-lg transition-transform group-hover:scale-105" />
            <span className="font-display font-black text-xl tracking-tight text-slate-900">Growlancer</span>
          </Link>
          <Link to="/" className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">Back to Home</Link>
        </div>
      </header>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <h1 className="font-display text-4xl font-bold text-slate-900 mb-8">Cookie Policy</h1>
          <p className="text-slate-600 mb-8">{formatLegalLastUpdatedLine()}</p>
          
          <div className="prose prose-slate max-w-none">
            <p className="text-slate-600 mb-8">
              This Cookie Policy explains how Growlancer uses cookies and similar technologies 
              to recognize you when you visit our platform.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mb-4">What Are Cookies?</h2>
            <p className="text-slate-600 mb-8">
              Cookies are small data files stored on your device when you visit a website. 
              They help websites remember your preferences and improve your browsing experience.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mb-6">Types of Cookies We Use</h2>
            <div className="space-y-6 mb-8">
              {cookieTypes.map((type, i) => (
                <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/60">
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

            <h2 className="text-2xl font-bold text-slate-900 mb-4">Managing Cookies</h2>
            <p className="text-slate-600 mb-8">
              You can control cookies through your browser settings. Note that disabling certain cookies 
              may affect the functionality of our platform. For more information, visit 
              <a href="https://www.aboutcookies.org" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline"> aboutcookies.org</a>.
            </p>

            <h2 className="text-2xl font-bold text-slate-900 mb-4">Changes to This Policy</h2>
            <p className="text-slate-600">
              We may update this policy from time to time. Changes will be posted on this page with an updated date.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
