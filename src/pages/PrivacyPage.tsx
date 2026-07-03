import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatLegalLastUpdatedLine } from '@/lib/legalLastUpdated';
import { ArrowLeft, ChevronRight, Contact, Cookie, Cross, Database, Eye, Globe, HelpCircle, History, Home, Kanban, Lock, Navigation, Shield, ShieldAlert, Sidebar, Type, Verified,  } from 'lucide-react';

interface Section {
  id: string;
  title: string;
  icon: any;
  content: React.ReactNode;
}

const privacySections: Section[] = [
  {
    id: 'commitment',
    title: '1. Privacy Commitment',
    icon: Shield,
    content: (
        <>
          <p className="text-slate-600 leading-relaxed mb-4">
            At Growlancer ("Platform", "we", "us", or "our"), your privacy is a foundational pillar of our service architecture. Unlike legacy freelancing platforms that rely on static database scraping and third-party advertising tracking, Growlancer is built to coordinate real-time workspaces with the highest standard of client and freelancer confidentiality.
          </p>
          <p className="text-slate-600 leading-relaxed mb-4">
            This Privacy Policy details what information we collect, how it is utilized for real-time synchronization and AI matchmaking, the enterprise-grade cryptographic standards we employ to safeguard it, and your explicit rights under applicable data protection laws (including GDPR and CCPA where they apply to you).
          </p>
          <div className="bg-emerald-50 border border-emerald-200/60 rounded-2xl p-4 flex gap-3 text-emerald-800 text-sm font-medium">
            <Lock className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
            <div>
              <p className="font-bold">Zero Sale of Data</p>
              <p className="text-emerald-700 text-xs mt-1">We explicitly commit to NEVER selling, trading, or licensing your personal profile information, project parameters, messaging logs, or canvas files to third-party ad networks or data brokers.</p>
            </div>
          </div>
        </>
      ),
    },
    {
      id: 'collection',
      title: '2. Information We Collect',
      icon: Database,
      content: (
        <>
          <p className="text-slate-600 leading-relaxed mb-4">
            To power our real-time coordination ecosystem, we collect data across three primary layers:
          </p>
          <div className="space-y-4">
            <div>
              <h5 className="font-bold text-slate-900 text-sm">A. Account & Profile Information</h5>
              <p className="text-slate-600 text-xs mt-1">Includes registered names, email addresses, verified credentials, portfolios, hourly rates, declared skills, and avatar images.</p>
            </div>
            <div>
              <h5 className="font-bold text-slate-900 text-sm">B. Real-Time Workspace Canvas Transactions</h5>
              <p className="text-slate-600 text-xs mt-1">When active in a project workspace, our synchronization engines parse and log task cards on your Kanban board, collaborative scratchpad text entries, real-time message threads, and files uploaded to the shared asset locker. This ensures coordinate states match on both freelancer and client screens instantly.</p>
            </div>
            <div>
              <h5 className="font-bold text-slate-900 text-sm">C. Payment & Verification Parameters</h5>
              <p className="text-slate-600 text-xs mt-1">Escrow payment coordinates, withdrawal methods (PayPal emails, bank wire details), and transaction history are stored securely to comply with international KYC (Know Your Customer) and anti-money laundering (AML) protocols. We never store credit card pin details directly on our servers.</p>
            </div>
          </div>
        </>
      ),
    },
    {
      id: 'usage',
      title: '3. Data Usage & AI Matching',
      icon: Eye,
      content: (
        <>
          <p className="text-slate-600 leading-relaxed mb-4">
            Your data is processed strictly to coordinate, improve, and protect the platform features:
          </p>
          <ul className="list-disc pl-5 text-slate-600 space-y-2 mb-4 text-sm">
            <li><strong>AI-Driven Matchmaking:</strong> Our Postgres semantic algorithms parse freelancer skill tags and client project descriptions. The matches are updated dynamically without exposing private contact credentials, preventing preemptive system circumvention.</li>
            <li><strong>Escrow Transactions:</strong> Verified billing identifiers coordinate directly with the secure PayPal sandbox and live escrow virtual pools.</li>
            <li><strong>Service Notifications:</strong> Critical updates (funding of milestone, new task card creation, chat ping, or dispute raise) trigger instant client/freelancer notification loops.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'security',
      title: '4. AES-256 & SOC-2 Security',
      icon: Lock,
      content: (
        <>
          <p className="text-slate-600 leading-relaxed mb-4">
            Security is not an afterthought at Growlancer. We employ enterprise-grade cryptographic standards to protect your data integrity:
          </p>
          <ul className="list-disc pl-5 text-slate-600 space-y-2 mb-6 text-sm">
            <li><strong>Data Encryption at Rest:</strong> All user databases, canvas assets, and profiles are encrypted using <strong>AES-256 (Advanced Encryption Standard)</strong> security keys.</li>
            <li><strong>Data Encryption in Transit:</strong> Session streams and Supabase broadcast updates are routed exclusively over encrypted TLS 1.3 channels.</li>
            <li><strong>Security Best Practices:</strong> We follow industry-standard security practices including encryption in transit (TLS) and at rest, and we are working toward formal third-party security certifications as we scale. Our infrastructure is hosted on trusted cloud providers with robust physical and network security controls.</li>
            <li><strong>Dispute Isolation:</strong> In the event of a raised dispute, the workspace asset locker undergoes immediate read-only lock isolation, preventing modification or tampering of evidence while our mediation team audits the logs.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'retention',
      title: '5. Asset Retention Policies',
      icon: History,
      content: (
        <>
          <p className="text-slate-600 leading-relaxed mb-4">
            We retain active data only for as long as necessary to maintain operational continuity, provide coordinate workspace safety, and adhere to legal tax filings:
          </p>
          <ul className="list-disc pl-5 text-slate-600 space-y-2 mb-4 text-sm">
            <li><strong>Active Workspaces:</strong> Completed workspace canvases (Kanban status history, finalized notes) remain archived on your client and freelancer dashboard for reference unless both sides explicitly consent to delete the archive.</li>
            <li><strong>Financial Records:</strong> Transactional logs, escrow allocations, and platform fee billing details are retained for a minimum of seven (7) years to comply with standard audit and taxation requirements.</li>
            <li><strong>Account Deletion:</strong> Upon filing a profile deletion request under account settings, your public profile and matches are deleted from the database within 48 hours. Cached analytical weights are fully purged within 30 days.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'cookies',
      title: '6. Cookie Policy',
      icon: Cookie,
      content: (
        <>
          <p className="text-slate-600 leading-relaxed mb-4">
            To preserve a clean and premium user experience, we keep cookies strictly functional.
          </p>
          <p className="text-slate-600 leading-relaxed mb-4">
            Growlancer uses cookies to:
          </p>
          <ul className="list-disc pl-5 text-slate-600 space-y-2 mb-4 text-sm">
            <li>Keep you securely authenticated in your active session.</li>
            <li>Preserve workspace layout preferences (such as collapsed sidebars or preferred canvas grid viewports).</li>
            <li>Protect our API endpoints against CSRF (Cross-Site Request Forgery) injections.</li>
          </ul>
          <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4 flex gap-3 text-slate-700 text-xs">
            <ShieldAlert className="w-5 h-5 shrink-0 text-slate-500 mt-0.5" />
            <div>
              <p className="font-bold">No Retargeting Trackers</p>
              <p className="text-slate-500 mt-1">We do not deploy external ad-tracking, social media remarketing pixels, or third-party behavioral cookies inside your collaborative workspaces.</p>
            </div>
          </div>
        </>
      ),
    },
    {
      id: 'rights',
      title: '7. Global Compliance & Rights',
      icon: Globe,
      content: (
        <>
          <p className="text-slate-600 leading-relaxed mb-4">
            Regardless of your geographic location, we extend comprehensive data sovereignty controls over your personal information:
          </p>
          <ul className="list-disc pl-5 text-slate-600 space-y-2 mb-4 text-sm">
            <li><strong>GDPR (European Union):</strong> You have the right to request a copy of your personal data in a structured, portable layout (Right to Portability), demand correction of incomplete parameters (Right to Rectification), or require data erasure (Right to be Forgotten).</li>
            <li><strong>CCPA (California):</strong> You possess the right to know what personal categories we collect, opt out of any analytical modeling, and receive equal pricing and services even after exercising your privacy rights.</li>
          </ul>
          <p className="text-slate-600 text-sm">
            To execute any data request or download your workspace history, submit a support ticket through our AI assistant and we'll process your request.
          </p>
        </>
      ),
    },
    {
      id: 'support',
      title: '8. Privacy Administration',
      icon: HelpCircle,
      content: (
        <>
          <p className="text-slate-600 leading-relaxed mb-4">
            If you have questions, comments, or seek to file an appeal regarding the processing of data in a disputed contract workspace, please contact our designated Data Protection Officer (DPO).
          </p>
          <div className="bg-slate-900 rounded-3xl p-6 text-white flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
            <div>
              <h5 className="font-bold text-sm">Have a privacy question?</h5>
              <p className="text-xs text-slate-400 mt-1">Create a support ticket and we'll get back to you — all requests are handled securely.</p>
            </div>
            <Link
              to="/contact"
              className="inline-flex h-10 px-4 items-center justify-center font-bold bg-white text-slate-900 rounded-xl hover:bg-slate-100 transition-colors shrink-0 text-xs"
            >
              Contact AI Support
            </Link>
          </div>
        </>
      ),
    },
  ];

export function PrivacyPage() {
  const [activeSection, setActiveSection] = useState<string>('commitment');
  const sections = privacySections;

  const handleScrollToSection = (id: string) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Sync active section based on scrolling position
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 160;
      for (const section of sections) {
        const el = document.getElementById(section.id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            setActiveSection(section.id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sections]);

  return (
    <div className="min-h-screen bg-cream font-sans pb-24 text-slate-800">
      {/* Symmetrical Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="/Growlancer Logo (2).png" alt="Growlancer" className="h-8 w-8 rounded-lg" />
            <span className="font-display font-black text-xl tracking-tight text-slate-900">Growlancer</span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-emerald-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </header>

      {/* Hero section */}
      <section className="relative py-16 overflow-hidden bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-900 text-white border-b border-emerald-900/30">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-teal-500/5 rounded-full blur-3xl -ml-20 -mb-20"></div>

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <span className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 font-bold rounded-full border border-emerald-500/30 text-xs uppercase tracking-wider">
            <Shield className="w-3.5 h-3.5" />
            Privacy Policy
          </span>
          <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tight leading-none">
            Privacy & <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">Data Protections</span>
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto font-medium">
            Your workspace privacy and secure contract data is our utmost priority. Read our AES-256 and SOC-2 standard controls.
          </p>
          <p className="text-slate-400 text-xs font-bold pt-2">{formatLegalLastUpdatedLine()}</p>
        </div>
      </section>

      {/* Legal Structure Grid */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sticky Sidebar Outline */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 space-y-2 bg-white rounded-3xl p-4 border border-slate-200/50 shadow-sm max-h-[calc(100vh-10rem)] overflow-y-auto">
            <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider px-3 mb-3">Outline Navigation</h3>
            <div className="space-y-1">
              {sections.map((section) => {
                const Icon = section.icon;
                const isActive = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => handleScrollToSection(section.id)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left font-bold text-xs transition-all ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-800 border-l-4 border-emerald-600 shadow-sm'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`} />
                      <span className="truncate">{section.title.split('. ')[1] || section.title}</span>
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${isActive ? 'rotate-90 text-emerald-600' : 'text-slate-300'}`} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Detailed Legal Clauses */}
        <div className="lg:col-span-3 space-y-8">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <section
                key={section.id}
                id={section.id}
                className="bg-white rounded-[2rem] border border-slate-200/60 p-6 sm:p-8 shadow-sm scroll-mt-24 hover:shadow-md transition-shadow duration-300"
              >
                <div className="flex items-center gap-3 mb-6 pb-3 border-b border-slate-100">
                  <div className="h-10 w-10 bg-emerald-100/80 rounded-2xl flex items-center justify-center text-emerald-700 shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h2 className="font-display font-black text-xl text-slate-900 leading-tight">
                    {section.title}
                  </h2>
                </div>
                <div className="prose prose-slate prose-emerald max-w-none text-slate-600 text-sm leading-relaxed">
                  {section.content}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
