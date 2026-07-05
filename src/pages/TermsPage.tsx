import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatLegalLastUpdatedLine } from '@/lib/legalLastUpdated';
import { AlertOctagon, ArrowLeft, BookOpen, ChevronRight, DollarSign, FileCode, Gavel, HelpCircle, Lock, Scale, Shield, ShieldCheck,  } from 'lucide-react';

interface Section {
  id: string;
  title: string;
  icon: any;
  content: React.ReactNode;
}

const termsSections: Section[] = [
  {
    id: 'intro',
    title: '1. Introduction & Account Terms',
    icon: BookOpen,
    content: (
        <>
          <p className="text-slate-600 leading-relaxed mb-4">
            Welcome to Growlancer ("Platform", "we", "us", or "our"). These Terms of Service constitute a legally binding agreement made between you, whether personally or on behalf of an entity ("you", "User", "Client", or "Freelancer") and Growlancer, concerning your access to and use of our website, applications, and services.
          </p>
          <p className="text-slate-600 leading-relaxed mb-4">
            By accessing the Platform, creating an account, or clicking "Accept", you acknowledge that you have read, understood, and agree to be bound by all of these Terms. If you do not agree with all of these terms, you are expressly prohibited from using the Platform and must discontinue use immediately.
          </p>
          <div className="bg-emerald-50 border border-emerald-200/60 rounded-2xl p-4 flex gap-3 text-emerald-800 text-sm font-medium">
            <ShieldCheck className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
            <div>
              <p className="font-bold">Eligibility Requirement</p>
              <p className="text-emerald-700 text-xs mt-1">You must be at least 18 years old and capable of entering into legally binding contracts under applicable jurisdiction to register and use Growlancer.</p>
            </div>
          </div>
        </>
      ),
    },
    {
      id: 'relationship',
      title: '2. Freelancer & Client Relations',
      icon: Scale,
      content: (
        <>
          <p className="text-slate-600 leading-relaxed mb-4">
            Growlancer operates as a high-fidelity workspace matching platform. We provide the infrastructure (including our real-time collaborative workspace canvases, interactive Kanban boards, focus-locked shared scratchpads, and secure escrow tools) to facilitate professional engagements.
          </p>
          <p className="text-slate-600 leading-relaxed mb-4">
            You explicitly acknowledge and agree that:
          </p>
          <ul className="list-disc pl-5 text-slate-600 space-y-2 mb-4 text-sm">
            <li><strong>Independent Status:</strong> Freelancers are independent contractors, not employees, agents, or partners of Growlancer or the Client.</li>
            <li><strong>Service Contracts:</strong> Upon a Client purchasing a Freelancer's Service or awarding a bid, a direct, legally binding contract is established between the Client and the Freelancer. Growlancer is not a party to this contract, but acts as a secure platform and escrow facilitator.</li>
            <li><strong>Performance Quality:</strong> Freelancers are solely responsible for the quality, accuracy, and timely delivery of their work as agreed upon in the workspace.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'fees',
      title: '3. Growlancer 5% Platform Fees',
      icon: DollarSign,
      content: (
        <>
          <p className="text-slate-600 leading-relaxed mb-4">
            To sustain our real-time synchronization servers, AI semantic matching models, and secure escrow operations, Growlancer implements a highly competitive and flat fee structure across all transactions.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-xs font-black uppercase text-emerald-600 tracking-wider">Client Fee</span>
                <h4 className="text-3xl font-black text-slate-900 mt-1">5%</h4>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Calculated and applied to the total project contract at checkout. Covers secure PayPal escrow processing, workspace creation, and dispute mediation rights.
                </p>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-xs font-black uppercase text-emerald-600 tracking-wider">Freelancer Fee</span>
                <h4 className="text-3xl font-black text-slate-900 mt-1">0%</h4>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  We believe in empowering creators. Growlancer charges freelancers zero percentage fees on standard contracts. The amount earned is the amount received in your wallet!
                </p>
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-[10px] text-amber-800 font-medium">
                    <strong>Note:</strong> A separate payment-processing fee applies when you withdraw funds from your wallet, charged by our payment processor, not by Growlancer. PayPal withdrawals incur a 2.9% processing fee. Razorpay (India) withdrawals incur a 2% processing fee. These fees are deducted from the withdrawal amount and are clearly displayed before you confirm any withdrawal.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <p className="text-slate-600 leading-relaxed text-sm">
            All prices and payouts are calculated in USD. Platforms fees are non-refundable once work on a milestone has commenced or the escrow payment has been released to the Freelancer.
          </p>
        </>
      ),
    },
    {
      id: 'escrow',
      title: '4. Escrow Safety Protection',
      icon: Lock,
      content: (
        <>
          <p className="text-slate-600 leading-relaxed mb-4">
            Growlancer's proprietary <strong>Escrow Safety Protection</strong> ensures mutual security and eliminates the coordination gaps that plague other freelancing platforms.
          </p>
          <div className="relative border-l-2 border-emerald-500 pl-4 space-y-4 mb-6">
            <div>
              <h5 className="font-bold text-slate-900 text-sm">A. Contract Funding</h5>
              <p className="text-slate-600 text-xs mt-1">Clients must fully fund the contract amount (milestone or project total + the 5% platform fee) into a secure Growlancer Escrow balance before the Freelancer starts working. This signals guaranteed solvency and commitment.</p>
            </div>
            <div>
              <h5 className="font-bold text-slate-900 text-sm">B. Real-Time Workspace Canvas</h5>
              <p className="text-slate-600 text-xs mt-1">Work progress is tracked transparently. Once the project begins, task milestones are automatically populated in the collaborative space and are updated dynamically as changes occur.</p>
            </div>
            <div>
              <h5 className="font-bold text-slate-900 text-sm">C. Milestone Releases</h5>
              <p className="text-slate-600 text-xs mt-1">Upon delivery of the milestone files or services, the Client will review. Once satisfied, the Client clicks "Release Escrow", transferring funds instantly to the Freelancer's wallet balance. Releasing funds constitutes final acceptance of that milestone.</p>
            </div>
          </div>
        </>
      ),
    },
    {
      id: 'ip',
      title: '5. Deliverables & IP Rights',
      icon: FileCode,
      content: (
        <>
          <p className="text-slate-600 leading-relaxed mb-4">
            Intellectual Property ("IP") rights are critical for both clients and freelancers. Unless explicitly agreed otherwise in a custom written contract between the Freelancer and the Client:
          </p>
          <ul className="list-disc pl-5 text-slate-600 space-y-2 mb-4 text-sm">
            <li><strong>Automatic Transfer:</strong> Upon the Client's final payment release of the respective project's escrow funds, all intellectual property rights, ownership, and titles in the deliverables created specifically for that project are transferred automatically and permanently to the Client.</li>
            <li><strong>Pre-Existing Intellectual Property:</strong> The Freelancer retains all rights to any pre-existing code, libraries, design templates, and tools used during the project. Freelancer grants the Client a perpetual, royalty-free, worldwide license to use such pre-existing intellectual property within the deliverables.</li>
            <li><strong>Platform Portfolio Rights:</strong> Freelancers are granted a limited license to showcase completed deliverables in their Growlancer portfolios, unless the Client has purchased a "Private Work" contract that specifies complete confidentiality.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'disputes',
      title: '6. Dispute Resolution & Mediation',
      icon: Gavel,
      content: (
        <>
          <p className="text-slate-600 leading-relaxed mb-4">
            In the event of a coordination breakdown or standard mismatch in deliverables, users can trigger the official dispute process directly in their active Milestones tab.
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3 mb-6">
            <h5 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              The 3-Step Dispute Protocol:
            </h5>
            <ol className="list-decimal pl-5 text-xs text-slate-600 space-y-2">
              <li><strong>1. Coordination Check (48 Hours):</strong> Upon raising a dispute, the contract status is changed to "disputed". The workspace asset locker is frozen, preventing any further uploads or modifications. The client and freelancer are given 48 hours to communicate and resolve the issue mutually (e.g. adjust task requirements or agree to a partial refund).</li>
              <li><strong>2. AI-Assisted Audit:</strong> If no agreement is reached, either party may escalate the dispute to the Growlancer Dispute Center. Our AI Mediator evaluates the workspace logs, chat archives, and task cards, then proposes a fair split ratio (e.g. 70% payout / 30% refund) as a non-binding starting point for resolution.</li>
              <li><strong>3. Human Review & Binding Decision:</strong> A human dispute resolution specialist reviews the AI's recommendation, along with all evidence, and confirms or adjusts the proposed split. Growlancer then issues a final, binding escrow allocation decision. Both parties agree to abide by this decision. Funds are moved only after human confirmation.</li>
            </ol>
          </div>
        </>
      ),
    },
    {
      id: 'circumvention',
      title: '7. Anti-Circumvention Policy',
      icon: AlertOctagon,
      content: (
        <>
          <p className="text-slate-600 leading-relaxed mb-4">
            To support a safe, fair, and reliable environment for both parties, Growlancer strictly prohibits circumvention of our system's secure escrow and project matching structures.
          </p>
          <p className="text-slate-600 leading-relaxed mb-4">
            Prohibited actions include:
          </p>
          <ul className="list-disc pl-5 text-slate-600 space-y-2 mb-4 text-sm">
            <li>Exchanging direct emails, phone numbers, MessageSquare invites, or social accounts prior to a contract being funded.</li>
            <li>Soliciting, suggesting, or accepting direct payments outside of the Growlancer system (e.g. direct PayPal, wire transfers, crypto payments) for projects initially sourced on Growlancer.</li>
            <li>Registering multiple user accounts under fake identities to game our AI matching systems or bypass platform suspension restrictions.</li>
          </ul>
          <p className="text-slate-600 text-sm">
            <strong>Penalties:</strong> Violations of this policy will result in immediate and permanent account suspension, forfeiture of active referral payouts, and a permanent ban from using our matching and workspace services.
          </p>
        </>
      ),
    },
    {
      id: 'liability',
      title: '8. Limitation of Liability',
      icon: AlertOctagon,
      content: (
        <>
          <p className="text-slate-600 leading-relaxed mb-4">
            <strong>IMPORTANT: PLEASE READ THIS SECTION CAREFULLY. IT LIMITS THE LIABILITY OF GROWLANCER AND ITS AFFILIATES.</strong>
          </p>
          <p className="text-slate-600 leading-relaxed mb-4">
            To the fullest extent permitted by applicable law, in no event shall Growlancer, its officers, directors, employees, or agents be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, data, use, goodwill, or other intangible losses, arising out of or in connection with your use of the Platform, whether based on warranty, contract, tort (including negligence), or any other legal theory, even if Growlancer has been advised of the possibility of such damages.
          </p>
          <p className="text-slate-600 leading-relaxed mb-4">
            Growlancer's total liability to you for any claims arising from or relating to these Terms or your use of the Platform shall be limited to the aggregate amount of fees paid by you to Growlancer in the twelve (12) months preceding the event giving rise to the claim.
          </p>
          <p className="text-slate-600 leading-relaxed mb-4">
            The limitations in this section do not apply to liability that cannot be excluded or limited by applicable law, such as liability for gross negligence, fraud, or death or personal injury caused by negligence.
          </p>
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
            <p className="text-[10px] text-red-700 font-medium">
              ⚠️ A lawyer should review this Limitation of Liability clause before launch to ensure it complies with applicable local laws and is appropriately tailored to the platform's operations.
            </p>
          </div>
        </>
      ),
    },
    {
      id: 'disclaimer',
      title: '9. Disclaimer of Warranties',
      icon: Shield,
      content: (
        <>
          <p className="text-slate-600 leading-relaxed mb-4">
            <strong>IMPORTANT: PLEASE READ THIS SECTION CAREFULLY. IT DISCLAIMS CERTAIN WARRANTIES.</strong>
          </p>
          <p className="text-slate-600 leading-relaxed mb-4">
            THE PLATFORM IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT ANY WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, GROWLANCER DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, AND COURSE OF DEALING OR USAGE OF TRADE.
          </p>
          <p className="text-slate-600 leading-relaxed mb-4">
            Growlancer does not warrant that: (a) the Platform will function uninterrupted, secure, or available at any particular time or location; (b) any errors or defects will be corrected; (c) the results of using the Platform will meet your requirements or expectations; or (d) the Platform is free of viruses or other harmful components.
          </p>
          <p className="text-slate-600 leading-relaxed mb-4">
            No advice or information, whether oral or written, obtained by you from Growlancer or through the Platform shall create any warranty not expressly stated in these Terms.
          </p>
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
            <p className="text-[10px] text-red-700 font-medium">
              ⚠️ A lawyer should review this Disclaimer of Warranties clause before launch to ensure it complies with applicable local laws, particularly regarding consumer protection rights that may not allow certain disclaimers.
            </p>
          </div>
        </>
      ),
    },
    {
      id: 'support',
      title: '10. Legal Administration & Contact',
      icon: HelpCircle,
      content: (
        <>
          {/* TODO: Replace with actual incorporation jurisdiction once the company is registered, e.g. "the laws of India" */}
          <p className="text-slate-600 leading-relaxed mb-4">
            These Terms of Service shall be governed by and construed in accordance with the laws of the jurisdiction of the Platform's incorporation, without regard to conflict of law principles.
          </p>
          <p className="text-slate-600 leading-relaxed mb-4">
            If any provision of these Terms is deemed invalid or unenforceable, that specific clause shall be severed, and the remaining provisions shall continue in full force and effect.
          </p>
          <div className="bg-slate-900 rounded-3xl p-6 text-white flex flex-col sm:flex-row items-center justify-between gap-4 mt-6">
            <div>
              <h5 className="font-bold text-sm">Have legal or compliance questions?</h5>
              <p className="text-xs text-slate-400 mt-1">Submit a support ticket and our team will review your inquiry.</p>
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

export function TermsPage() {
  const [activeSection, setActiveSection] = useState<string>('intro');
  const sections = termsSections;

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
            Legal Terms
          </span>
          <h1 className="font-display text-4xl sm:text-5xl font-black tracking-tight leading-none">
            Terms of <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">Service Agreement</span>
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto font-medium">
            Please read these terms carefully. They define platform fees, escrow safety, work ownership, and dispute rules.
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
