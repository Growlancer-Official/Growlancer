import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Award, BookOpen, Briefcase, Calendar, CheckCircle, CheckCircle2, ChevronDown, ChevronUp, Clock, Code, Database, FileText, Globe, GraduationCap, HelpCircle, Lightbulb, Link2, Loader2, Lock, MessageSquare, Palette, Send, Sparkles, Target, Upload, User, Users, X,  } from 'lucide-react';
import { internshipService, INTERNSHIP_ROLES, type InternshipRole } from '../lib/internshipService';

// ─── Icon resolver ───────────────────────────────────────────────────────────
function RoleIcon({ icon, className }: { icon: string; className?: string }) {
  const cls = className || 'w-6 h-6';
  switch (icon) {
    case 'Code': return <Code className={cls} />;
    case 'Database': return <Database className={cls} />;
    case 'CheckCircle2': return <CheckCircle2 className={cls} />;
    case 'Palette': return <Palette className={cls} />;
    default: return <Briefcase className={cls} />;
  }
}

// ─── Color helpers ───────────────────────────────────────────────────────────
function roleColorClasses(color: string) {
  const palette: Record<string, { bg: string; text: string; light: string; border: string; ring: string; gradient: string; badgeBg: string; badgeText: string }> = {
    emerald: {
      bg: 'bg-emerald-600',
      text: 'text-emerald-600',
      light: 'bg-emerald-50',
      border: 'border-emerald-200',
      ring: 'ring-emerald-500/20',
      gradient: 'from-emerald-500 to-emerald-700',
      badgeBg: 'bg-emerald-100',
      badgeText: 'text-emerald-700',
    },
    blue: {
      bg: 'bg-blue-600',
      text: 'text-blue-600',
      light: 'bg-blue-50',
      border: 'border-blue-200',
      ring: 'ring-blue-500/20',
      gradient: 'from-blue-500 to-blue-700',
      badgeBg: 'bg-blue-100',
      badgeText: 'text-blue-700',
    },
    purple: {
      bg: 'bg-purple-600',
      text: 'text-purple-600',
      light: 'bg-purple-50',
      border: 'border-purple-200',
      ring: 'ring-purple-500/20',
      gradient: 'from-purple-500 to-purple-700',
      badgeBg: 'bg-purple-100',
      badgeText: 'text-purple-700',
    },
    orange: {
      bg: 'bg-orange-600',
      text: 'text-orange-600',
      light: 'bg-orange-50',
      border: 'border-orange-200',
      ring: 'ring-orange-500/20',
      gradient: 'from-orange-500 to-orange-700',
      badgeBg: 'bg-orange-100',
      badgeText: 'text-orange-700',
    },
  };
  return palette[color] || palette.emerald;
}

// ─── Expandable Role Card ───────────────────────────────────────────────────
function RoleCard({
  role,
  onApply,
  isExpanded,
  onToggle,
}: {
  role: InternshipRole;
  onApply: (role: InternshipRole) => void;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const c = roleColorClasses(role.color);

  return (
    <div
      className={`bg-white rounded-3xl border-2 transition-all duration-300 ${
        isExpanded ? 'border-emerald-300 shadow-lg' : 'border-slate-200 hover:border-slate-300 shadow-sm'
      }`}
    >
      {/* Card Header */}
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`h-14 w-14 rounded-2xl ${c.bg} flex items-center justify-center shadow-md shrink-0`}>
              <RoleIcon icon={role.icon} className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-xl font-bold text-slate-900">{role.name}</h3>
                <span className={`text-xs px-2.5 py-0.5 ${c.badgeBg} ${c.badgeText} font-bold rounded-full`}>
                  {role.department}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-2xl">{role.summary}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500 font-medium">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {role.commitment}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {role.duration}
                </span>
                <span className="flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-slate-400" />
                  Remote (India)
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-5 flex flex-wrap gap-3">
          {role.isOpen ? (
            <button
              onClick={() => onApply(role)}
              className={`inline-flex items-center justify-center h-11 px-6 rounded-xl text-white font-bold shadow-lg shadow-emerald-600/20 transition-all active:scale-95 text-sm ${c.bg} hover:brightness-110`}
            >
              Apply Now
              <Send className="ml-2 w-4 h-4" />
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-slate-200 text-slate-500 font-bold text-sm cursor-not-allowed">
              <Lock className="w-4 h-4" />
              Applications Closed
            </div>
          )}
          <button
            onClick={onToggle}
            className="inline-flex items-center justify-center h-11 px-5 rounded-xl bg-white text-slate-700 font-bold border border-slate-200 hover:bg-slate-50 transition-all text-sm"
          >
            {isExpanded ? (
              <>View Less <ChevronUp className="ml-1.5 w-4 h-4" /></>
            ) : (
              <>Full Details <ChevronDown className="ml-1.5 w-4 h-4" /></>
            )}
          </button>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="border-t border-slate-100 px-6 sm:px-8 py-6 space-y-8 animate-fade-in">
          {/* Responsibilities */}
          <div>
            <h4 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-emerald-600" />
              Responsibilities
            </h4>
            <ul className="space-y-2">
              {role.responsibilities.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 mt-2 shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </div>

          {/* Skills Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-600" />
                Required Skills
              </h4>
              <ul className="space-y-2">
                {role.requiredSkills.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                Preferred Skills
              </h4>
              <ul className="space-y-2">
                {role.preferredSkills.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Tools */}
          <div>
            <h4 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
              <Code className="w-4 h-4 text-slate-600" />
              Tools &amp; Technologies
            </h4>
            <div className="flex flex-wrap gap-2">
              {role.tools.map((t, i) => (
                <span key={i} className="text-xs px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium">
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Expected Outcomes */}
          <div>
            <h4 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-600" />
              Expected Outcomes (8 weeks)
            </h4>
            <ul className="space-y-2">
              {role.outcomes.map((o, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  {o}
                </li>
              ))}
            </ul>
          </div>

          {/* Learning */}
          <div>
            <h4 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-600" />
              Learning Opportunities
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {role.learningOpportunities.map((l, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                  <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
                  {l}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

// ─── Application Form Section ───────────────────────────────────────────────
function ApplicationForm({
  role,
  onClose,
  onSubmitSuccess,
}: {
  role: InternshipRole;
  onClose: () => void;
  onSubmitSuccess: () => void;
}) {
  const [step, setStep] = useState<'form' | 'submitting' | 'success'>('form');
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [university, setUniversity] = useState('');
  const [degree, setDegree] = useState('');
  const [graduationYear, setGraduationYear] = useState('');
  const [googleMeetLink, setGoogleMeetLink] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [resumeUrl, setResumeUrl] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [whyGrowlancer, setWhyGrowlancer] = useState('');
  const [weeklyAvailability, setWeeklyAvailability] = useState(20);
  const [availableFrom, setAvailableFrom] = useState('');
  const [availableTo, setAvailableTo] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || !email.trim() || !portfolioUrl.trim() || !coverLetter.trim() || !linkedinUrl.trim()) {
      setError('Please fill in all required fields: Name, Email, LinkedIn Profile, Portfolio/GitHub link, and Cover Letter.');
      return;
    }

    setStep('submitting');

    // Upload resume PDF if selected
    let resumeFilePath: string | undefined;
    let resumeFileName: string | undefined;
    if (resumeFile) {
      const uploadResult = await internshipService.uploadResume(resumeFile);
      if (uploadResult.success && uploadResult.filePath) {
        resumeFilePath = uploadResult.filePath;
        resumeFileName = resumeFile.name;
      }
    }

    const result = await internshipService.submitApplication({
      full_name: fullName,
      email,
      phone: phone || undefined,
      role_id: role.id,
      role_name: role.name,
      country: country || undefined,
      university: university || undefined,
      degree: degree || undefined,
      graduation_year: graduationYear || undefined,
      linkedin_url: linkedinUrl || undefined,
      google_meet_link: googleMeetLink || undefined,
      github_url: githubUrl || undefined,
      portfolio_url: portfolioUrl || undefined,
      resume_url: resumeUrl || undefined,
      resume_file_path: resumeFilePath,
      resume_file_name: resumeFileName,
      cover_letter: coverLetter,
      why_growlancer: whyGrowlancer || undefined,
      weekly_availability: weeklyAvailability,
      available_from: availableFrom || undefined,
      available_to: availableTo || undefined,
    });

    if (result.success) {
      setStep('success');
      onSubmitSuccess();
    } else {
      setError(result.error || 'Something went wrong. Please try again or email us directly.');
      setStep('form');
    }
  };

  const c = roleColorClasses(role.color);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 sticky top-0 bg-white z-10 rounded-t-[2.5rem]">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl ${c.bg} flex items-center justify-center`}>
              <RoleIcon icon={role.icon} className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-slate-900">Apply for {role.shortTitle}</h3>
              <p className="text-xs text-slate-500">{role.department} • {role.duration}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-slate-200 hover:bg-slate-50 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {step === 'success' ? (
            <div className="text-center py-8 space-y-6">
              <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle className="w-10 h-10 text-emerald-600" />
              </div>
              <div>
                <h4 className="font-display font-bold text-2xl text-slate-900">Application Submitted!</h4>
                <p className="text-slate-500 text-sm max-w-md mx-auto mt-3 leading-relaxed">
                  Thank you for applying to the <span className="font-bold text-slate-700">{role.name}</span> position.
                  Our team will review your application and reach out to you at{' '}
                  <span className="font-bold text-slate-700">{email}</span> within 5–7 business days.
                </p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 max-w-sm mx-auto text-left">
                <h5 className="font-bold text-xs text-slate-500 uppercase tracking-wider mb-2">What happens next?</h5>
                <ol className="space-y-2 text-sm text-slate-600">
                  <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>Application review (3–5 days)</li>
                  <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>Interview invitation (single round)</li>
                  <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0"></span>Onboarding &amp; start</li>
                </ol>
              </div>
              <button
                onClick={onClose}
                className="h-11 px-8 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 transition-all text-sm"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-100 text-red-700 p-4 rounded-xl text-sm font-medium animate-fade-in">
                  {error}
                </div>
              )}

              {/* Section: Personal Info */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <User className="w-3.5 h-3.5" />
                  Personal Information
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Full Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Your full name"
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Email <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. you@example.com"
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                    />
                  </div>                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Phone (optional)</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. +1 555 123 4567"
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Country (optional)</label>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      placeholder="e.g. India, USA, UK"
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Section: Education */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <GraduationCap className="w-3.5 h-3.5" />
                  Education &amp; Background
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">College / University (optional)</label>
                    <input
                      type="text"
                      value={university}
                      onChange={(e) => setUniversity(e.target.value)}
                      placeholder="e.g. MIT, Stanford, Delhi University"
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Degree (optional)</label>
                    <input
                      type="text"
                      value={degree}
                      onChange={(e) => setDegree(e.target.value)}
                      placeholder="e.g. B.Tech, B.Sc, MCA"
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Graduation Year (optional)</label>
                    <select
                      value={graduationYear}
                      onChange={(e) => setGraduationYear(e.target.value)}
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                    >
                      <option value="">Select Year</option>
                      {Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() + i - 2).toString()).map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                      <option value="Alumni">Alumni (Graduated)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Google Meet Email (optional)</label>
                    <input
                      type="email"
                      value={googleMeetLink}
                      onChange={(e) => setGoogleMeetLink(e.target.value)}
                      placeholder="your.email@gmail.com (for interview scheduling)"
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Section: Links */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <Link2 className="w-3.5 h-3.5" />
                  Portfolio &amp; Links
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      LinkedIn Profile <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="url"
                      required
                      value={linkedinUrl}
                      onChange={(e) => setLinkedinUrl(e.target.value)}
                      placeholder="https://linkedin.com/in/username"
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">GitHub Profile (optional)</label>
                    <input
                      type="url"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      placeholder="https://github.com/username"
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Portfolio / GitHub Link <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="url"
                      required
                      value={portfolioUrl}
                      onChange={(e) => setPortfolioUrl(e.target.value)}
                      placeholder="https://github.com/username or https://myportfolio.com"
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Section: Resume */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5" />
                  Resume
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Upload Resume (PDF only, max 10MB)</label>
                    <div className="flex items-center gap-3">
                      <label className="flex-1 flex items-center gap-3 px-4 py-3 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all">
                        <Upload className="w-5 h-5 text-slate-400" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-600 font-medium">
                            {resumeFile ? resumeFile.name : 'Click to upload PDF'}
                          </p>
                          {resumeFile && (
                            <p className="text-[10px] text-slate-400">
                              {(resumeFile.size / 1024 / 1024).toFixed(1)} MB
                            </p>
                          )}
                        </div>
                        {resumeFile && (
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); setResumeFile(null); }}
                            className="p-1 hover:bg-slate-200 rounded-full transition-colors"
                          >
                            <X className="w-4 h-4 text-slate-400" />
                          </button>
                        )}
                        <input
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.type === 'application/pdf') {
                                setResumeFile(file);
                              } else {
                                alert('Only PDF files are accepted.');
                              }
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-200" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-white px-2 text-slate-400">OR</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Resume Link (Google Drive, Dropbox) — optional</label>
                    <input
                      type="url"
                      value={resumeUrl}
                      onChange={(e) => setResumeUrl(e.target.value)}
                      placeholder="https://drive.google.com/your-resume"
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Section: Cover Letter */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5" />
                  Cover Letter <span className="text-red-400">*</span>
                </h4>
                <textarea
                  required
                  rows={4}
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  placeholder="Tell us about your background, relevant experience, and why you're interested in this internship..."
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all resize-none"
                />
              </div>

              {/* Section: Motivation */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  Motivation
                </h4>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Why Growlancer? (optional)</label>
                  <textarea
                    rows={3}
                    value={whyGrowlancer}
                    onChange={(e) => setWhyGrowlancer(e.target.value)}
                    placeholder="What excites you about working at an early-stage startup? What do you hope to learn?"
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all resize-none"
                  />
                </div>
              </div>

              {/* Section: Availability */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  Availability
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Weekly Hours</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={5}
                        max={40}
                        step={5}
                        value={weeklyAvailability}
                        onChange={(e) => setWeeklyAvailability(Number(e.target.value))}
                        className="flex-1 accent-emerald-600"
                      />
                      <span className="text-sm font-bold text-slate-700 w-8 text-right">{weeklyAvailability}h</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Available From (optional)</label>
                    <input
                      type="date"
                      value={availableFrom}
                      onChange={(e) => setAvailableFrom(e.target.value)}
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Available To (optional)</label>
                    <input
                      type="date"
                      value={availableTo}
                      onChange={(e) => setAvailableTo(e.target.value)}
                      className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={step === 'submitting'}
                className={`w-full h-12 ${c.bg} hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 active:scale-[0.99] transition-all text-sm`}
              >
                {step === 'submitting' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Submitting Application...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Submit Application for {role.shortTitle}
                  </>
                )}
              </button>

              <p className="text-[10px] text-slate-400 text-center">
                By submitting, you agree that Growlancer may store and process your application data.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── FAQ Section ─────────────────────────────────────────────────────────────
const FAQS = [
  {
    q: 'Is this a paid internship?',
    a: 'Growlancer is a pre-launch startup, and this is an educational internship program. The internship is unpaid but offers significant learning value, portfolio-building opportunities, mentorship, and a certificate of completion. We cover all software/tool costs.',
  },
  {
    q: 'What is the time commitment?',
    a: 'We recommend 15–30 hours per week. The minimum is 15 hours — anything less makes it difficult to build momentum on meaningful tasks. The program runs for 8–12 weeks.',
  },
  {
    q: 'Is this remote?',
    a: 'Yes, this is a fully remote internship open to candidates in India. We communicate via Google Meet for video calls and GitHub for code collaboration, with bi-weekly 1:1 mentoring sessions. You need your own laptop and stable internet.',
  },
  {
    q: 'What happens after I submit my application?',
    a: 'We review applications within 5-7 business days. If shortlisted, you\'ll receive an interview invitation. The interview is a single round with the founder - no technical assessment or test required.',
  },
  {
    q: 'Do I need prior professional experience?',
    a: 'No. We\'re looking for demonstrated skill, not professional experience. If you have projects, open-source contributions, or a strong portfolio that showcases your abilities, that\'s what matters.',
  },
  {
    q: 'Will I own the code/designs I create?',
    a: 'All work created during the internship is owned by Growlancer. However, you are absolutely allowed to showcase the work in your portfolio (with our permission) and list the experience on your resume.',
  },
  {
    q: 'Can I get a certificate or letter of recommendation?',
    a: 'Yes. Interns who successfully complete the program receive a certificate (Bronze/Silver/Gold tier based on performance). Exceptional contributors also receive a detailed letter of recommendation from the founder.',
  },
  {
    q: 'Does this guarantee a job at Growlancer?',
    a: 'No. This is an educational internship and does not guarantee future employment. However, exceptional interns who demonstrate strong skills and culture fit may be considered for future paid roles as Growlancer grows.',
  },
];

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-200 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 text-left gap-4"
      >
        <span className="font-semibold text-sm text-slate-900">{question}</span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        )}
      </button>
      {open && (
        <p className="pb-4 text-sm text-slate-600 leading-relaxed animate-fade-in">{answer}</p>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export function InternshipsPage() {
  const [expandedRole, setExpandedRole] = useState<string | null>(null);
  const [applyingRole, setApplyingRole] = useState<InternshipRole | null>(null);
  const handleApply = (role: InternshipRole) => {
    setApplyingRole(role);
  };

  const handleSubmitSuccess = () => {
    // No-op; used for future analytics tracking
  };

  const handleCloseForm = () => {
    setApplyingRole(null);
  };

  const toggleExpand = (roleId: string) => {
    setExpandedRole(expandedRole === roleId ? null : roleId);
  };

  const programBenefits = [
    { icon: BookOpen, title: 'Real Project Experience', desc: 'Work on a live, pre-launch platform with real code, real users (soon), and real impact.' },
    { icon: Users, title: 'Direct Founder Mentorship', desc: 'Weekly 1:1 mentoring with the founder. Code reviews, career advice, and startup insights.' },
    { icon: Target, title: 'Portfolio-Building Work', desc: 'Ship features that go into production. Your contributions are part of a real product.' },
    { icon: Award, title: 'Certification & LOR', desc: 'Earn a certificate of completion. Outstanding interns receive a detailed letter of recommendation.' },
    { icon: Globe, title: 'Remote & Flexible', desc: 'Work from anywhere. Async communication. Flexible schedule around your other commitments.' },
    { icon: MessageSquare, title: 'Startup Exposure', desc: 'Learn what it takes to build a startup from scratch — product, engineering, design, and operations.' },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <img src="/UpdatedLogo.webp" alt="Growlancer" className="h-8 w-8 rounded-lg transition-transform group-hover:scale-105" />
            <span className="font-display font-bold text-xl tracking-tight text-slate-900">Growlancer</span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-emerald-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 sm:py-28 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 text-white">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl -ml-20 -mb-20" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent" />

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center space-y-6">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-500/20 text-emerald-300 font-bold rounded-full border border-emerald-500/30 text-xs uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            Growlancer Internship Program
          </span>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-none">
            Build the Future of{' '}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">AI-Powered Freelancing</span>
          </h1>
          <p className="text-slate-300 text-base sm:text-lg max-w-2xl mx-auto font-medium leading-relaxed">
            Join a pre-launch startup's core development team. Ship real features, learn from a founder,
            and build a portfolio that stands out. No fluff, no coffee fetching — just meaningful engineering work.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-400">
            <span className="flex items-center gap-1.5"><Clock className="w-4 h-4 text-emerald-400" /> 8–12 weeks</span>
            <span className="flex items-center gap-1.5"><Globe className="w-4 h-4 text-emerald-400" /> Remote (India)</span>
            <span className="flex items-center gap-1.5"><Users className="w-4 h-4 text-emerald-400" /> 3–4 interns per cohort</span>
            <span className="flex items-center gap-1.5"><Award className="w-4 h-4 text-emerald-400" /> Certificate + LOR</span>
          </div>
        </div>
      </section>

      {/* Program Overview */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-10">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-lg p-6 sm:p-8">
          <h2 className="font-display text-2xl font-bold text-slate-900 mb-6">About the Program</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                Growlancer is an AI-powered freelancing marketplace currently in pre-launch. We're building a platform
                that uses intelligent matching, escrow payments, and collaborative workspaces to make freelancing
                faster and less noisy.
              </p>
              <p className="text-sm text-slate-600 leading-relaxed">
                As an intern, you won't be sidelined with busywork. You'll be assigned real features, work directly
                with the founder, and see your contributions ship to production. Our stack is modern
                (React 18 + TypeScript + Vite + Supabase) and our codebase spans 50+ pages, 13+ edge functions,
                and realtime infrastructure.
              </p>
            </div>
            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-3">
              <h3 className="font-bold text-sm text-slate-900">Tech Stack You'll Work With</h3>
              <div className="flex flex-wrap gap-2">
                {['React 18', 'TypeScript', 'TailwindCSS', 'Vite', 'Supabase', 'PostgreSQL', 'Deno', 'GitHub Actions', 'PenTool'].map((t) => (
                  <span key={t} className="text-xs px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium shadow-sm">
                    {t}
                  </span>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                We use modern, industry-standard tools. You'll gain experience that transfers directly to any tech role.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Open Internships */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-16">
        <div className="flex items-center gap-3 mb-8">
          <Briefcase className="w-6 h-6 text-emerald-600" />
          <h2 className="font-display text-2xl font-bold text-slate-900">Open Internship Positions</h2>
          <span className="text-xs px-2.5 py-0.5 bg-emerald-100 text-emerald-700 font-bold rounded-full">
            {INTERNSHIP_ROLES.length} roles
          </span>
        </div>

        <div className="space-y-6">
          {INTERNSHIP_ROLES.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              onApply={handleApply}
              isExpanded={expandedRole === role.id}
              onToggle={() => toggleExpand(role.id)}
            />
          ))}
        </div>
      </section>

      {/* Program Benefits */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-20">
        <div className="text-center mb-10">
          <h2 className="font-display text-2xl font-bold text-slate-900">Why Join Growlancer's Internship?</h2>
          <p className="text-slate-500 text-sm mt-2">More than just an internship — it's a launchpad for your career.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {programBenefits.map((benefit, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
              <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center mb-4">
                <benefit.icon className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="font-bold text-sm text-slate-900 mb-1">{benefit.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{benefit.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-20">
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 sm:p-10 text-white">
          <h2 className="font-display text-2xl font-bold mb-8 text-center">Application Process</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { step: '1', title: 'Submit Application', desc: 'Fill out the form with your background, portfolio, and motivation.' },
              { step: '2', title: 'Virtual Interview', desc: 'Chat with the founder about your work, approach, and fit. Single round, no technical assessment.' },
              { step: '3', title: 'Onboarding & Start', desc: 'Get set up, pick your first task, and start contributing.' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="h-12 w-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3 text-emerald-400 font-bold text-lg">
                  {item.step}
                </div>
                <h3 className="font-bold text-sm mb-1">{item.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 mt-20 mb-20">
        <div className="text-center mb-10">
          <HelpCircle className="w-8 h-8 text-emerald-600 mx-auto mb-3" />
          <h2 className="font-display text-2xl font-bold text-slate-900">Frequently Asked Questions</h2>
          <p className="text-slate-500 text-sm mt-2">Everything you need to know about the internship program.</p>
        </div>
        <div className="bg-white rounded-3xl border border-slate-200 divide-y divide-slate-200 px-6">
          {FAQS.map((faq, i) => (
            <FAQItem key={i} question={faq.q} answer={faq.a} />
          ))}
        </div>
      </section>

      {/* Application Form Modal */}
      {applyingRole && (
        <ApplicationForm
          role={applyingRole}
          onClose={handleCloseForm}
          onSubmitSuccess={handleSubmitSuccess}
        />
      )}
    </div>
  );
}

export default InternshipsPage;
