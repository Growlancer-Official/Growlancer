import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  Camera,
  Check,
  CheckCircle,
  Globe,
  Loader2,
  MapPin,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useSkills } from '../hooks/useSkills';
import { SkillsSelector } from '../components/SkillsSelector';
import { avatarUploadService } from '../lib/avatarUpload';

interface FreelancerForm {
  title: string;
  bio: string;
  hourly_rate: number;
  experience: number;
  location: string;
  portfolio_url: string;
  availability: boolean;
  avatar_url: string | null;
}

interface ClientForm {
  company_name: string;
  industry: string;
  size: string;
  location: string;
  description: string;
  website: string;
}

type Step = 'welcome' | 'profile' | 'skills' | 'review';

function OAuthMiniForm({ onComplete }: { onComplete: () => void }) {
  const { user, updateUser } = useAuth();
  const { skills: allSkills } = useSkills();
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'info' | 'done'>('info');

  // Role selection (OAuth defaults to 'freelancer', user can switch)
  const [selectedRole, setSelectedRole] = useState<'freelancer' | 'client'>(
    (user?.role === 'client' ? 'client' : 'freelancer') as 'freelancer' | 'client'
  );
  const isFreelancer = selectedRole === 'freelancer';

  // Freelancer fields
  const [title, setTitle] = useState('');
  const [hourlyRate, setHourlyRate] = useState(0);
  const [location, setLocation] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Client fields
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');

  // Sync selectedSkills to skill names
  const skillNames = selectedSkills
    .map(id => allSkills.find(s => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map(s => s.name);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('File must be less than 5MB'); return; }
    setUploadingAvatar(true);
    try {
      const result = await avatarUploadService.uploadAvatar(file);
      if (result.success && result.avatar_url) {
        setAvatar(result.avatar_url);
      }
    } catch { alert('Failed to upload avatar'); }
    finally { setUploadingAvatar(false); }
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      // Update the user's role if they changed it
      if (user.role !== selectedRole) {
        await supabase.from('profiles').update({ role: selectedRole }).eq('id', user.id);
      }

      if (isFreelancer) {
        await supabase.from('freelancer_profiles').upsert({
          user_id: user.id,
          title: title || undefined,
          hourly_rate: hourlyRate > 0 ? hourlyRate : null,
          location: location || null,
          skills: skillNames.length > 0 ? skillNames : null,
          availability: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (avatar) {
          await supabase.from('profiles').update({ avatar }).eq('id', user.id);
          updateUser({ avatar });
        }
      } else {
        await supabase.from('client_profiles').upsert({
          user_id: user.id,
          company_name: companyName || null,
          industry: industry || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      }
      await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', user.id);
      updateUser({ onboardingCompleted: true });
      setStep('done');
      setTimeout(() => onComplete(), 1500);
    } catch (err) {
      console.error('OAuth onboarding save error:', err);
      alert('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (step === 'done') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50/30 flex items-center justify-center">
        <div className="bg-white rounded-3xl p-10 max-w-md w-full mx-4 shadow-sm border border-slate-100 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="font-display text-2xl font-bold text-slate-900 mb-2">All set!</h2>
          <p className="text-slate-500 text-sm">Taking you to your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50/30 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-sm border border-slate-100 animate-fade-in">
        {/* Role Toggle */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
            {isFreelancer ? <User className="w-6 h-6" /> : <Building2 className="w-6 h-6" />}
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">
              {isFreelancer ? 'Complete Your Freelancer Profile' : 'Complete Your Company Profile'}
            </h2>
            <p className="text-sm text-slate-500">Just a few quick details to get started</p>
          </div>
        </div>

        {/* Role Switcher */}
        <div className="mb-6 p-3 bg-slate-50 rounded-xl">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">I want to...</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setSelectedRole('freelancer')}
              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${
                selectedRole === 'freelancer'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-emerald-300'
              }`}
            >
              <User className="w-4 h-4" />
              Freelance
            </button>
            <button
              onClick={() => setSelectedRole('client')}
              className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-bold transition-all ${
                selectedRole === 'client'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-white text-slate-600 border border-slate-200 hover:border-emerald-300'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Hire Talent
            </button>
          </div>
        </div>

        {/* Freelancer Fields */}
        {isFreelancer ? (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 border-2 border-slate-200">
                  {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : <User className="w-8 h-8 text-slate-400 m-auto mt-5" />}
                </div>
                <button onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar}
                  className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center hover:bg-emerald-700 transition-colors disabled:opacity-50 shadow-lg">
                  {uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                </button>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatarUpload} className="hidden" />
              </div>
              <div>
                <p className="font-medium text-slate-900">Profile Photo</p>
                <p className="text-xs text-slate-500">Add a photo to build trust</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Professional Title <span className="text-red-400">*</span></label>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Full Stack Developer, UI/UX Designer"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Hourly Rate (USD)</label>
                <input type="number" min={0} value={hourlyRate || ''} onChange={e => setHourlyRate(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="50" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Location</label>
                <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                  placeholder="e.g. New York, USA" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all" />
              </div>
            </div>

            {/* Simple Skills Picker */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Skills (optional)</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {skillNames.map(name => (
                  <span key={name} className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium">
                    {name}
                    <button onClick={() => {
                      const skill = allSkills.find(s => s.name === name);
                      if (skill) setSelectedSkills(prev => prev.filter(id => id !== skill.id));
                    }} className="hover:text-emerald-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <select
                value=""
                onChange={e => {
                  const val = e.target.value;
                  if (val && !selectedSkills.includes(val)) {
                    setSelectedSkills(prev => [...prev, val]);
                  }
                }}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all text-sm"
              >
                <option value="">Search or select skills...</option>
                {allSkills
                  .filter(s => !selectedSkills.includes(s.id))
                  .slice(0, 30)
                  .map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
              </select>
            </div>
          </div>
        ) : (
          /* Client Fields */
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Company Name <span className="text-red-400">*</span></label>
              <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                placeholder="Your company or brand name"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Industry</label>
              <select value={industry} onChange={e => setIndustry(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all">
                <option value="">Select industry...</option>
                <option value="Technology">Technology</option>
                <option value="E-commerce">E-commerce</option>
                <option value="Marketing">Marketing</option>
                <option value="Finance">Finance</option>
                <option value="Healthcare">Healthcare</option>
                <option value="Education">Education</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving || (isFreelancer && !title.trim()) || (!isFreelancer && !companyName.trim())}
          className="w-full mt-6 h-12 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2"
        >
          {saving ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</> : <><CheckCircle className="w-5 h-5" /> Complete Setup</>}
        </button>

        <p className="text-xs text-slate-400 text-center mt-4">You can always update this later from your profile settings.</p>
      </div>
    </div>
  );
}

export function OnboardingPage() {
  const { user, getDashboardRoute } = useAuth();
  const { skills: allSkills } = useSkills();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isOAuthMode = searchParams.get('mode') === 'oauth';

  // ── ALL hooks declared BEFORE any early return ──
  const [step, setStep] = useState<Step>('welcome');
  const [animationDir, setAnimationDir] = useState<'next' | 'prev'>('next');
  const [saving, setSaving] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);

  // Avatar upload state
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Freelancer form state
  const [freelancerForm, setFreelancerForm] = useState<FreelancerForm>({
    title: '',
    bio: '',
    hourly_rate: 0,
    experience: 0,
    location: '',
    portfolio_url: '',
    availability: true,
    avatar_url: null,
  });

  // Client form state
  const [clientForm, setClientForm] = useState<ClientForm>({
    company_name: '',
    industry: '',
    size: '',
    location: '',
    description: '',
    website: '',
  });

  // Skills selector state (freelancer only)
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [skillNames, setSkillNames] = useState<string[]>([]);

  // Sync selectedSkillIds to skillNames for form submission
  useEffect(() => {
    const names = selectedSkillIds
      .map(id => allSkills.find(s => s.id === id))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map(s => s.name);
    setSkillNames(names);
  }, [selectedSkillIds, allSkills]);

  // OAuth users get a simpler 1-step form
  if (isOAuthMode) {
    return (
      <OAuthMiniForm
        onComplete={() => {
          const route = user?.role === 'client' ? '/client' : user?.role === 'admin' ? '/admin' : '/dashboard';
          navigate(route, { replace: true });
        }}
      />
    );
  }

  const isFreelancer = user?.role === 'freelancer';
  const isClient = user?.role === 'client';

  const handleNext = () => {
    setAnimationDir('next');
    if (step === 'welcome') setStep('profile');
    else if (step === 'profile') setStep('skills');
    else if (step === 'skills') setStep('review');
  };

  const handleBack = () => {
    setAnimationDir('prev');
    if (step === 'profile') setStep('welcome');
    else if (step === 'skills') setStep('profile');
    else if (step === 'review') setStep('skills');
  };

  const handleSkip = () => setShowSkipModal(true);

  const confirmSkip = async () => {
    // Mark onboarding as completed without saving profile data
    if (user?.id) {
      await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', user.id);
    }
    window.location.href = getDashboardRoute();
  };

  const handleSubmit = async () => {
    if (!user?.id) return;
    if (uploadingAvatar) {
      alert('Please wait for your profile photo to finish uploading.');
      return;
    }
    setSaving(true);

    try {
      if (isFreelancer) {
        // Save freelancer profile
        const { error: fpError } = await supabase
          .from('freelancer_profiles')
          .upsert({
            user_id: user.id,
            title: freelancerForm.title,
            bio: freelancerForm.bio,
            hourly_rate: freelancerForm.hourly_rate || null,
            experience: freelancerForm.experience || null,
            skills: skillNames.length > 0 ? skillNames : freelancerForm.title ? [freelancerForm.title] : [],
            location: freelancerForm.location || null,
            portfolio_url: freelancerForm.portfolio_url || null,
            availability: freelancerForm.availability,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
        if (fpError) throw fpError;

        // Save avatar to profiles table (the correct table for avatar)
        if (freelancerForm.avatar_url) {
          await supabase
            .from('profiles')
            .update({ avatar: freelancerForm.avatar_url })
            .eq('id', user.id);
        }
      } else if (isClient) {
        // Save client profile
        const { error: cpError } = await supabase
          .from('client_profiles')
          .upsert({
            user_id: user.id,
            company_name: clientForm.company_name || null,
            industry: clientForm.industry || null,
            size: clientForm.size || null,
            location: clientForm.location || null,
            description: clientForm.description || null,
            website: clientForm.website || null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });

        if (cpError) throw cpError;
      }

      // Mark onboarding as completed
      await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', user.id);

      window.location.href = getDashboardRoute();
    } catch (err) {
      console.error('Onboarding save error:', err);
      alert('Failed to save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Calculate progress
  const stepIndex = ['welcome', 'profile', 'skills', 'review'].indexOf(step);
  const totalSteps = 4;
  const progress = ((stepIndex + 1) / totalSteps) * 100;

  const stepDots = [
    { id: 'welcome', label: 'Welcome', icon: Sparkles },
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'skills', label: 'Skills', icon: Briefcase },
    { id: 'review', label: 'Review', icon: Check },
  ];

  const isFormValid = () => {
    if (step === 'welcome') return true;
    if (step === 'profile' && isFreelancer) {
      return freelancerForm.title.trim().length > 0 && freelancerForm.bio.trim().length > 0;
    }
    if (step === 'profile' && isClient) {
      return clientForm.company_name.trim().length > 0;
    }
    return true;
  };

  const canProceed = isFormValid();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50/30 flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 group">
            <img src="/UpdatedLogo.webp" alt="Growlancer" className="h-8 w-8 rounded-lg transition-transform group-hover:scale-105" />
            <span className="font-display font-black text-xl tracking-tight text-slate-900">Growlancer</span>
          </div>
          <button
            onClick={handleSkip}
            className="text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors"
          >
            Skip
          </button>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="w-full h-1 bg-slate-100">
        <div
          className="h-full bg-emerald-500 transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Step Dots Indicator */}
      <div className="bg-white/50 border-b border-slate-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          {stepDots.map((s, i) => {
            const Icon = s.icon;
            const isActive = stepIndex >= i;
            const isCurrent = step === s.id;
            return (
              <div key={s.id} className="flex items-center gap-1.5">
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                  isCurrent
                    ? 'bg-emerald-100 text-emerald-700'
                    : isActive
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-slate-400'
                }`}>
                  <Icon className="w-3 h-3" />
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < stepDots.length - 1 && (
                  <div className={`w-6 h-0.5 ${isActive && i < stepIndex ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 flex items-start justify-center p-4 sm:p-6 pt-8">
        <div className="max-w-2xl w-full">
          <div
            className={`bg-white rounded-3xl p-6 sm:p-10 shadow-sm border border-slate-100 transition-all duration-400 ${
              animationDir === 'next'
                ? 'animate-in fade-in slide-in-from-right-4'
                : 'animate-in fade-in slide-in-from-left-4'
            }`}
          >
            {/* ═══════════ WELCOME STEP ═══════════ */}
            {step === 'welcome' && (
              <div className="text-center">
                <div className="inline-flex items-center justify-center h-24 w-24 rounded-3xl bg-emerald-100 text-emerald-600 mb-8">
                  <Sparkles className="w-12 h-12" />
                </div>

                <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
                  {isFreelancer ? 'Welcome to Growlancer!' : 'Welcome to Growlancer!'}
                </h1>
                <p className="text-slate-600 text-lg leading-relaxed mb-8 max-w-lg mx-auto">
                  {isFreelancer
                    ? 'Let\'s set up your freelance profile so our AI can match you with the perfect projects. It only takes a few minutes!'
                    : 'Set up your client account to start posting projects and hiring talented freelancers from around the world.'}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
                  {[
                    { icon: User, label: isFreelancer ? 'Your Profile' : 'Company Info', color: 'bg-blue-100 text-blue-600' },
                    { icon: Briefcase, label: isFreelancer ? 'Your Skills' : 'Your Industry', color: 'bg-purple-100 text-purple-600' },
                    { icon: CheckCircle, label: 'Ready to Start', color: 'bg-emerald-100 text-emerald-600' },
                  ].map((item, i) => (
                    <div key={i} className={`flex items-center gap-2 p-3 rounded-xl ${item.color} text-sm font-medium`}>
                      <item.icon className="w-4 h-4 flex-shrink-0" />
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleNext}
                  className="inline-flex items-center gap-2 px-8 py-3.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-emerald-600/25"
                >
                  Get Started
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* ═══════════ PROFILE STEP ═══════════ */}
            {step === 'profile' && (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-bold text-slate-900">
                      {isFreelancer ? 'Your Professional Profile' : 'Your Company Profile'}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {isFreelancer
                        ? 'Tell clients about yourself and your expertise'
                        : 'Tell freelancers about your company and what you do'}
                    </p>
                  </div>
                </div>

                {isFreelancer ? (
                  <div className="space-y-5">
                {/* Avatar / Profile Photo */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 border-2 border-slate-200">
                      {freelancerForm.avatar_url ? (
                        <img src={freelancerForm.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <User className="w-8 h-8 text-slate-400" />
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingAvatar}
                      className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center hover:bg-emerald-700 transition-colors disabled:opacity-50 shadow-lg"
                    >
                      {uploadingAvatar ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Camera className="w-4 h-4" />
                      )}
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 5 * 1024 * 1024) {
                          alert('File must be less than 5MB');
                          return;
                        }
                        setUploadingAvatar(true);
                        try {
                          const result = await avatarUploadService.uploadAvatar(file);
                          if (result.success && result.avatar_url) {
                            setFreelancerForm(prev => ({ ...prev, avatar_url: result.avatar_url }));
                          } else {
                            alert(result.error || 'Failed to upload avatar');
                          }
                        } catch {
                          alert('Failed to upload avatar');
                        } finally {
                          setUploadingAvatar(false);
                        }
                      }}
                      className="hidden"
                    />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Profile Photo</p>
                    <p className="text-xs text-slate-500">Upload a professional photo to build trust with clients</p>
                  </div>
                </div>

                {/* Professional Title */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Professional Title <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={freelancerForm.title}
                    onChange={(e) => setFreelancerForm({ ...freelancerForm, title: e.target.value })}
                    placeholder="e.g., Full Stack Developer, UI/UX Designer"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                  />
                  <p className="text-xs text-slate-400 mt-1">This will appear as your headline on your profile</p>
                </div>

                    {/* Bio */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Bio <span className="text-red-400">*</span>
                      </label>
                      <textarea
                        rows={4}
                        value={freelancerForm.bio}
                        onChange={(e) => setFreelancerForm({ ...freelancerForm, bio: e.target.value })}
                        placeholder="Describe your expertise, experience, and what makes you unique..."
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all resize-none"
                      />
                    </div>

                    {/* Hourly Rate & Experience */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Hourly Rate (USD)</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">$</span>
                          <input
                            type="number"
                            min={0}
                            value={freelancerForm.hourly_rate || ''}
                            onChange={(e) => setFreelancerForm({ ...freelancerForm, hourly_rate: Math.max(0, parseInt(e.target.value) || 0) })}
                            placeholder="50"
                            className="w-full pl-8 pr-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Years of Experience</label>
                        <input
                          type="number"
                          min={0}
                          max={60}
                          value={freelancerForm.experience || ''}
                          onChange={(e) => setFreelancerForm({ ...freelancerForm, experience: Math.min(60, Math.max(0, parseInt(e.target.value) || 0)) })}
                          placeholder="5"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* Location */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Location</label>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                          type="text"
                          value={freelancerForm.location}
                          onChange={(e) => setFreelancerForm({ ...freelancerForm, location: e.target.value })}
                          placeholder="e.g., New York, USA or Remote"
                          className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                        />
                      </div>
                    </div>

                    {/* Portfolio URL */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Portfolio URL</label>
                      <input
                        type="url"
                        value={freelancerForm.portfolio_url}
                        onChange={(e) => setFreelancerForm({ ...freelancerForm, portfolio_url: e.target.value })}
                        placeholder="https://yourportfolio.com"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                      />
                    </div>

                    {/* Availability */}
                    <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                      <input
                        type="checkbox"
                        checked={freelancerForm.availability}
                        onChange={(e) => setFreelancerForm({ ...freelancerForm, availability: e.target.checked })}
                        className="w-5 h-5 text-emerald-600 rounded border-slate-300 cursor-pointer"
                      />
                      <div>
                        <span className="font-medium text-slate-900">I'm available to take new projects</span>
                        <p className="text-xs text-slate-500">Uncheck if you're currently busy</p>
                      </div>
                    </label>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Company Name */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Company Name <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={clientForm.company_name}
                        onChange={(e) => setClientForm({ ...clientForm, company_name: e.target.value })}
                        placeholder="Your company or brand name"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                      />
                    </div>

                    {/* Industry */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Industry</label>
                      <select
                        value={clientForm.industry}
                        onChange={(e) => setClientForm({ ...clientForm, industry: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                      >
                        <option value="">Select your industry...</option>
                        <option value="Technology">Technology</option>
                        <option value="E-commerce">E-commerce</option>
                        <option value="Marketing">Marketing & Advertising</option>
                        <option value="Finance">Finance & Banking</option>
                        <option value="Healthcare">Healthcare</option>
                        <option value="Education">Education</option>
                        <option value="Real Estate">Real Estate</option>
                        <option value="Media">Media & Entertainment</option>
                        <option value="Consulting">Consulting</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    {/* Company Size & Location */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Team Size</label>
                        <select
                          value={clientForm.size}
                          onChange={(e) => setClientForm({ ...clientForm, size: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                        >
                          <option value="">Select size...</option>
                          <option value="1">Just me (1)</option>
                          <option value="2-10">2-10 employees</option>
                          <option value="11-50">11-50 employees</option>
                          <option value="51-200">51-200 employees</option>
                          <option value="201-1000">201-1000 employees</option>
                          <option value="1000+">1000+ employees</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Location</label>
                        <div className="relative">
                          <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                          <input
                            type="text"
                            value={clientForm.location}
                            onChange={(e) => setClientForm({ ...clientForm, location: e.target.value })}
                            placeholder="e.g., San Francisco, USA"
                            className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Company Description */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Company Description</label>
                      <textarea
                        rows={4}
                        value={clientForm.description}
                        onChange={(e) => setClientForm({ ...clientForm, description: e.target.value })}
                        placeholder="Tell freelancers about your company, mission, and the type of projects you typically need help with..."
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all resize-none"
                      />
                    </div>

                    {/* Website */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Website</label>
                      <input
                        type="url"
                        value={clientForm.website}
                        onChange={(e) => setClientForm({ ...clientForm, website: e.target.value })}
                        placeholder="https://yourcompany.com"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                      />
                    </div>
                  </div>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between gap-4 mt-8 pt-6 border-t border-slate-100">
                  <button
                    onClick={handleBack}
                    className="flex items-center gap-2 px-6 py-3 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-all"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={!canProceed}
                    className="flex items-center gap-2 px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/25"
                  >
                    Next: {isFreelancer ? 'Skills' : 'Review'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ═══════════ SKILLS STEP (Freelancer Only) ═══════════ */}
            {step === 'skills' && (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-purple-100 text-purple-600 flex items-center justify-center">
                    <Briefcase className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-bold text-slate-900">
                      {isFreelancer ? 'Your Skills & Expertise' : 'Review Your Profile'}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {isFreelancer
                        ? 'Select skills so our AI can match you with relevant projects'
                        : 'Review your company details before finishing'}
                    </p>
                  </div>
                </div>

                {isFreelancer ? (
                  <div>
                    <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl mb-6">
                      <p className="text-sm text-purple-700">
                        <strong>Tip:</strong> Select skills from the hierarchy below to get AI-matched to relevant projects. 
                        You can always add more skills later from your profile settings.
                      </p>
                    </div>
                    <SkillsSelector
                      mode="freelancer"
                      maxSkills={15}
                      maxCategories={3}
                      selectedCategoryIds={[]}
                      selectedSkillIds={selectedSkillIds}
                      onSkillsChange={setSelectedSkillIds}
                      onCategoriesChange={() => {}}
                    />

                    {/* Selected skills summary */}
                    {skillNames.length > 0 && (
                      <div className="mt-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                        <div className="flex items-center gap-2 mb-3">
                          <CheckCircle className="w-5 h-5 text-emerald-600" />
                          <span className="font-medium text-emerald-800">{skillNames.length} skills selected</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {skillNames.map(name => (
                            <span key={name} className="px-3 py-1.5 bg-white text-emerald-700 rounded-lg text-sm font-medium border border-emerald-200">
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Client review of their profile */
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 rounded-xl">
                        <p className="text-xs text-slate-500 mb-1">Company</p>
                        <p className="font-medium text-slate-900">{clientForm.company_name || 'Not set'}</p>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-xl">
                        <p className="text-xs text-slate-500 mb-1">Industry</p>
                        <p className="font-medium text-slate-900">{clientForm.industry || 'Not set'}</p>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-xl">
                        <p className="text-xs text-slate-500 mb-1">Team Size</p>
                        <p className="font-medium text-slate-900">{clientForm.size || 'Not set'}</p>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-xl">
                        <p className="text-xs text-slate-500 mb-1">Location</p>
                        <p className="font-medium text-slate-900">{clientForm.location || 'Not set'}</p>
                      </div>
                    </div>
                    {clientForm.description && (
                      <div className="p-4 bg-slate-50 rounded-xl">
                        <p className="text-xs text-slate-500 mb-1">Description</p>
                        <p className="font-medium text-slate-900 line-clamp-3">{clientForm.description}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between gap-4 mt-8 pt-6 border-t border-slate-100">
                  <button
                    onClick={handleBack}
                    className="flex items-center gap-2 px-6 py-3 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-all"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    onClick={isFreelancer || step === 'skills' ? handleNext : handleSubmit}
                    className="flex items-center gap-2 px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25"
                  >
                    {isFreelancer ? 'Next: Review' : 'Complete Setup'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ═══════════ REVIEW STEP ═══════════ */}
            {step === 'review' && (
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <Check className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-bold text-slate-900">Review Your Profile</h2>
                    <p className="text-sm text-slate-500">Everything look good? Click Complete Setup to finish!</p>
                  </div>
                </div>

                {/* Profile Summary Card */}
                <div className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl p-6 border border-emerald-100 mb-6">
                  {isFreelancer ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center overflow-hidden">
                          {freelancerForm.avatar_url ? (
                            <img src={freelancerForm.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-8 h-8 text-emerald-600" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-slate-900">{freelancerForm.title || 'Your Title'}</h3>
                          <p className="text-sm text-slate-500">
                            {freelancerForm.hourly_rate > 0 ? `$${freelancerForm.hourly_rate}/hr` : 'Rate not set'} 
                            {freelancerForm.experience > 0 ? ` · ${freelancerForm.experience} years exp` : ''}
                          </p>
                        </div>
                      </div>
                      {freelancerForm.bio && (
                        <div className="p-3 bg-white rounded-xl border border-emerald-100">
                          <p className="text-sm text-slate-600 line-clamp-3">{freelancerForm.bio}</p>
                        </div>
                      )}
                      {skillNames.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 mb-2">Skills ({skillNames.length})</p>
                          <div className="flex flex-wrap gap-1.5">
                            {skillNames.slice(0, 8).map(name => (
                              <span key={name} className="px-2.5 py-1 bg-white text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium">
                                {name}
                              </span>
                            ))}
                            {skillNames.length > 8 && (
                              <span className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-xs font-medium">
                                +{skillNames.length - 8} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      {freelancerForm.location && (
                        <div className="flex items-center gap-1.5 text-sm text-slate-500">
                          <MapPin className="w-4 h-4" />
                          {freelancerForm.location}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
                          <Building2 className="w-8 h-8 text-emerald-600" />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-slate-900">{clientForm.company_name || 'Your Company'}</h3>
                          <p className="text-sm text-slate-500">
                            {clientForm.industry || 'Industry not set'} 
                            {clientForm.size ? ` · ${clientForm.size} people` : ''}
                          </p>
                        </div>
                      </div>
                      {clientForm.description && (
                        <div className="p-3 bg-white rounded-xl border border-emerald-100">
                          <p className="text-sm text-slate-600 line-clamp-3">{clientForm.description}</p>
                        </div>
                      )}
                      {clientForm.location && (
                        <div className="flex items-center gap-1.5 text-sm text-slate-500">
                          <MapPin className="w-4 h-4" />
                          {clientForm.location}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Completion Percentage */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-700">Profile Completion</span>
                    <span className="text-sm font-bold text-emerald-600">
                      {Math.round(
                        isFreelancer
                          ? ((freelancerForm.title ? 20 : 0) +
                             (freelancerForm.bio ? 20 : 0) +
                             (freelancerForm.hourly_rate > 0 ? 15 : 0) +
                             (skillNames.length > 0 ? 25 : 0) +
                             (freelancerForm.location ? 10 : 0) +
                             (freelancerForm.portfolio_url ? 10 : 0))
                          : ((clientForm.company_name ? 25 : 0) +
                             (clientForm.industry ? 20 : 0) +
                             (clientForm.size ? 15 : 0) +
                             (clientForm.location ? 15 : 0) +
                             (clientForm.description ? 25 : 0))
                      )}%
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-700"
                      style={{
                        width: `${
                          isFreelancer
                            ? ((freelancerForm.title ? 20 : 0) +
                               (freelancerForm.bio ? 20 : 0) +
                               (freelancerForm.hourly_rate > 0 ? 15 : 0) +
                               (skillNames.length > 0 ? 25 : 0) +
                               (freelancerForm.location ? 10 : 0) +
                               (freelancerForm.portfolio_url ? 10 : 0))
                            : ((clientForm.company_name ? 25 : 0) +
                               (clientForm.industry ? 20 : 0) +
                               (clientForm.size ? 15 : 0) +
                               (clientForm.location ? 15 : 0) +
                               (clientForm.description ? 25 : 0))
                        }%`
                      }}
                    />
                  </div>
                </div>

                {/* Action */}
                <div className="flex items-center justify-between gap-4 pt-6 border-t border-slate-100">
                  <button
                    onClick={handleBack}
                    className="flex items-center gap-2 px-6 py-3 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-all"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={saving}
                    className="flex items-center gap-2 px-8 py-3.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/25"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        Complete Setup
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-xs text-slate-400">
            You can always update your profile later from the Settings page
          </p>
        </div>
      </footer>

      {/* Skip Confirmation Modal */}
      {showSkipModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setShowSkipModal(false)}
          />
          <div className="relative bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-scale-in">
            <button
              onClick={() => setShowSkipModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>

            <div className="flex items-center justify-center w-16 h-16 bg-orange-100 rounded-2xl mb-6 mx-auto">
              <AlertTriangle className="w-8 h-8 text-orange-600" />
            </div>

            <h2 className="font-display text-2xl font-bold text-slate-900 text-center mb-3">
              Skip Profile Setup?
            </h2>

            <p className="text-slate-600 text-center mb-8 leading-relaxed">
              You can skip setting up your profile for now. You can always complete it later from the Settings page, 
              but you'll need a complete profile to get AI-matched projects.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSkipModal(false)}
                className="flex-1 px-6 py-3 text-slate-700 font-medium rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                Continue Setup
              </button>
              <button
                onClick={confirmSkip}
                className="flex-1 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors"
              >
                Skip Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
