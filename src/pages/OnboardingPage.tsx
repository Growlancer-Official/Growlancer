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
import { CategoryPicker } from '../components/CategoryPicker';
import { IndustrySelect } from '../components/IndustrySelect';
import { useCategories } from '../hooks/useCategories';
import { avatarUploadService } from '../lib/avatarUpload';
import { avatarPackService } from '../lib/avatarPack';
import { fetchUserProfile, createUserProfile } from '../lib/services/authService';
import { useToast } from '../components/Toast';

interface FreelancerForm {
  title: string;
  bio: string;
  hourly_rate: number;
  experience: number;
  location: string;
  portfolio_url: string;
  availability: boolean;
  avatar_url: string | null;
  languages: string[];
}

/** Common languages offered to freelancers during onboarding (module-scope constant). */
const COMMON_LANGUAGES = ['English', 'Hindi', 'Spanish', 'French', 'German', 'Portuguese', 'Arabic', 'Japanese', 'Chinese', 'Korean', 'Russian', 'Italian', 'Dutch', 'Turkish', 'Bengali', 'Telugu', 'Tamil', 'Marathi', 'Gujarati', 'Kannada', 'Malayalam', 'Punjabi', 'Urdu'];

/** Max characters allowed for a custom language name. */
const MAX_LANGUAGE_LENGTH = 40;

interface ClientForm {
  company_name: string;
  industry: string;
  size: string;
  location: string;
  description: string;
  website: string;
  company_logo: string | null;
}

type Step = 'welcome' | 'profile' | 'skills' | 'review';

function OAuthMiniForm({ onComplete }: { onComplete: (role: 'freelancer' | 'client') => void }) {
  const { user, updateUser } = useAuth();
  const { categories } = useCategories();
  const toast = useToast();
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
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [skillNames, setSkillNames] = useState<string[]>([]);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Client fields
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Map selected category IDs to names for saving
  const categoryNames = selectedCategoryIds
    .map(id => categories.find(c => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .map(c => c.name);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('File Too Large', 'Company logo must be less than 2MB'); return; }
    setUploadingLogo(true);
    try {
      const result = await avatarPackService.uploadCompanyLogo(file, user.id);
      if (result.success && result.logo_url) {
        setCompanyLogo(result.logo_url);
        toast.success('Logo Uploaded', 'Company logo added!');
      } else {
        toast.error('Upload Failed', result.error || 'Failed to upload logo');
      }
    } catch { toast.error('Upload Failed', 'Failed to upload company logo'); }
    finally { setUploadingLogo(false); }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('File Too Large', 'File must be less than 5MB'); return; }
    setUploadingAvatar(true);
    try {
      const result = await avatarUploadService.uploadAvatar(file);
      if (result.success && result.avatar_url) {
        setAvatar(result.avatar_url);
      }
    } catch { toast.error('Upload Failed', 'Failed to upload avatar'); }
    finally { setUploadingAvatar(false); }
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      // 🆕 UPSERT PATTERN: First check if profile exists, create if not, then update
      const existing = await fetchUserProfile(user.id);
      if (!existing) {
        const created = await createUserProfile(
          user.id,
          user.email || '',
          user.name || 'User',
          selectedRole
        );
        if (!created) {
          toast.error('Profile Error', 'Failed to create your profile. Please try again or contact support.');
          setSaving(false);
          return;
        }
      } else if (user.role !== selectedRole) {
        // Profile exists, update role if changed
        const { error: roleErr } = await supabase.from('profiles').update({ role: selectedRole }).eq('id', user.id);
        if (roleErr) {
          console.error('OAuth onboarding role update error:', roleErr);
          toast.error('Role Error', 'Failed to save your role: ' + roleErr.message);
          setSaving(false);
          return;
        }
      }

      if (isFreelancer) {
        const { error: fpError } = await supabase.from('freelancer_profiles').upsert({
          user_id: user.id,
          title: title || undefined,
          hourly_rate: hourlyRate > 0 ? hourlyRate : null,
          location: location || null,
          skills: skillNames.length > 0 ? skillNames : null,
          categories: categoryNames.length > 0 ? categoryNames : null,
          availability: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (fpError) {
          console.error('OAuth onboarding freelancer_profiles error:', fpError);
          toast.error('Save Error', 'Failed to save: ' + fpError.message);
          setSaving(false);
          return;
        }
        if (avatar) {
          await supabase.from('profiles').update({ avatar }).eq('id', user.id);
          updateUser({ avatar });
        }
      } else {
        const { error: cpError } = await supabase.from('client_profiles').upsert({
          user_id: user.id,
          company_name: companyName || null,
          industry: industry || null,
          company_logo: companyLogo || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (cpError) {
          console.error('OAuth onboarding client_profiles error:', cpError);
          toast.error('Save Error', 'Failed to save: ' + cpError.message);
          setSaving(false);
          return;
        }
      }

      const { error: onboardingErr } = await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', user.id);
      if (onboardingErr) {
        console.error('OAuth onboarding completion error:', onboardingErr);
        toast.error('Completion Error', 'Failed to complete: ' + onboardingErr.message);
        setSaving(false);
        return;
      }

      // 🆕 Sync BOTH onboarding completion AND the chosen role into context so the
      // dashboard redirect below lands on the correct dashboard (a user who switched
      // from freelancer → client must reach /client, not /dashboard).
      updateUser({ onboardingCompleted: true, role: selectedRole });
      setStep('done');
      setTimeout(() => onComplete(selectedRole), 1500);
    } catch (err) {
      console.error('OAuth onboarding save error:', err);
      toast.error('Save Error', 'Failed to save. Please try again. Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
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
        {/* Progress indication */}
        <div className="flex items-center gap-2 mb-6">
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full w-full bg-emerald-500 rounded-full" />
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quick Setup</span>
        </div>

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

        {/* 🆕 New-account note — OAuth users without an existing Growlancer account
            land on this mini form after GitHub/LinkedIn sign-in. Show a clear
            'signup' message so it's obvious a new account is being created. */}
        <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
          <Sparkles className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800 leading-relaxed">
            New account detected — you're one step away from joining Growlancer.
            Pick your role below to finish signing up.
          </p>
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
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Hourly Rate (₹/hr)</label>
                <input type="number" min={0} value={hourlyRate || ''} onChange={e => setHourlyRate(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="50" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Location</label>
                <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                  placeholder="e.g. New York, USA" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all" />
              </div>
            </div>

            {/* Categories + Free-text skills */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-500 mb-3">Select your categories and add the skills you offer</p>
              <CategoryPicker
                mode="freelancer"
                maxCategories={3}
                selectedCategoryIds={selectedCategoryIds}
                selectedSkills={skillNames}
                onCategoriesChange={setSelectedCategoryIds}
                onSkillsChange={setSkillNames}
              />
            </div>
          </div>
        ) : (
          /* Client Fields */
          <div className="space-y-5">
            {/* Company Logo */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 border-2 border-slate-200 flex items-center justify-center">
                  {companyLogo ? <img src={companyLogo} alt="Company logo" className="w-full h-full object-cover" /> : <Building2 className="w-8 h-8 text-slate-400" />}
                </div>
                <button onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}
                  className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center hover:bg-emerald-700 transition-colors disabled:opacity-50 shadow-lg">
                  {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                </button>
                <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" onChange={handleLogoUpload} className="hidden" />
              </div>
              <div>
                <p className="font-medium text-slate-900">Company Logo</p>
                <p className="text-xs text-slate-500">Add your company logo to build trust (optional)</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Company Name <span className="text-red-400">*</span></label>
              <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
                placeholder="Your company or brand name"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Industry</label>
              <IndustrySelect
                value={industry}
                onChange={setIndustry}
                placeholder="Select your industry..."
              />
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
  const toast = useToast();
  const { user, getDashboardRoute, updateUser } = useAuth();
  const { categories } = useCategories();
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

  // Client company logo upload state
  const [uploadingClientLogo, setUploadingClientLogo] = useState(false);
  const clientLogoInputRef = useRef<HTMLInputElement>(null);

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
    languages: [],
  });

  const [languageInput, setLanguageInput] = useState('');
  const [languageSuggestions, setLanguageSuggestions] = useState<string[]>([]);

  // Client form state
  const [clientForm, setClientForm] = useState<ClientForm>({
    company_name: '',
    industry: '',
    size: '',
    location: '',
    description: '',
    website: '',
    company_logo: null,
  });

  // Category + free-text skills state (freelancer only)
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [skillNames, setSkillNames] = useState<string[]>([]);
  const [selectedCategoryNames, setSelectedCategoryNames] = useState<string[]>([]);

  // Sync selected category IDs to names for form submission
  useEffect(() => {
    const names = selectedCategoryIds
      .map(id => categories.find(c => c.id === id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map(c => c.name);
    setSelectedCategoryNames(names);
  }, [selectedCategoryIds, categories]);

  // OAuth users get a simpler 1-step form
  if (isOAuthMode) {
    return (
      <OAuthMiniForm
        onComplete={(role) => {
          const route = role === 'client' ? '/client' : '/dashboard';
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
    else if (step === 'profile') {
      // Client users skip the skills step (no skills to add) and go straight to review
      if (isClient) setStep('review');
      else setStep('skills');
    }
    else if (step === 'skills') setStep('review');
  };

  const handleBack = () => {
    setAnimationDir('prev');
    if (step === 'profile') setStep('welcome');
    else if (step === 'skills') setStep('profile');
    else if (step === 'review') {
      // Client users go back to profile (they never visited skills)
      if (isClient) setStep('profile');
      else setStep('skills');
    }
  };

  const handleSkip = () => setShowSkipModal(true);

  const confirmSkip = async () => {
    if (!user?.id) return;

    try {
      // Ensure a basic profile row exists so the dashboard doesn't
      // see an empty/null profile (breaks getOpenProjects matching).
      const existing = await fetchUserProfile(user.id);
      if (!existing) {
        const created = await createUserProfile(
          user.id, user.email || '', user.name || 'User',
          user.role === 'client' ? 'client' : 'freelancer'
        );
        if (!created) {
          toast.error('Profile Error', 'Failed to create your profile. Please try again or contact support.');
          return;
        }
      }

      // If freelancer, create a minimal freelancer_profiles row
      if (isFreelancer) {
        const { error: fpErr } = await supabase.from('freelancer_profiles').upsert({
          user_id: user.id,
          availability: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (fpErr) {
          toast.error('Save Error', 'Failed to save your profile: ' + fpErr.message);
          return;
        }
      }

      // If client, create a minimal client_profiles row
      if (isClient) {
        const { error: cpErr } = await supabase.from('client_profiles').upsert({
          user_id: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (cpErr) {
          toast.error('Save Error', 'Failed to save your company profile: ' + cpErr.message);
          return;
        }
      }

      const { error: onboardingErr } = await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', user.id);
      if (onboardingErr) {
        toast.error('Completion Error', 'Failed to complete onboarding: ' + onboardingErr.message);
        return;
      }

      updateUser({ onboardingCompleted: true });
    } catch (err) {
      console.error('Skip onboarding error:', err);
      toast.error('Save Error', 'Failed to skip setup. Please try again.');
      return;
    }

    window.location.href = getDashboardRoute();
  };

  const handleSubmit = async () => {
    if (!user?.id) return;
    if (uploadingAvatar) {
      toast.error('Upload In Progress', 'Please wait for your profile photo to finish uploading.');
      return;
    }
    setSaving(true);

    try {
      const existing = await fetchUserProfile(user.id);
      if (!existing) {
        const created = await createUserProfile(
          user.id,
          user.email || '',
          user.name || 'User',
          user.role === 'client' ? 'client' : 'freelancer'
        );
        if (!created) {
          toast.error('Profile Error', 'Failed to create your profile. Please try again or contact support.');
          setSaving(false);
          return;
        }
      }

      if (isFreelancer) {
        const { error: fpError } = await supabase
          .from('freelancer_profiles')
          .upsert({
            user_id: user.id,
            title: freelancerForm.title,
            bio: freelancerForm.bio,
            hourly_rate: freelancerForm.hourly_rate || null,
            experience: freelancerForm.experience || null,
            skills: skillNames.length > 0 ? skillNames : freelancerForm.title ? [freelancerForm.title] : [],
            categories: selectedCategoryNames.length > 0 ? selectedCategoryNames : null,
            location: freelancerForm.location || null,
            portfolio_url: freelancerForm.portfolio_url || null,
            languages: freelancerForm.languages.length > 0 ? freelancerForm.languages : null,
            availability: freelancerForm.availability,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
        if (fpError) {
          console.error('Onboarding freelancer_profiles error:', fpError);
          toast.error('Save Error', 'Failed to save your profile: ' + fpError.message);
          setSaving(false);
          return;
        }

        if (freelancerForm.avatar_url) {
          const { error: avatarError } = await supabase
            .from('profiles')
            .update({ avatar: freelancerForm.avatar_url })
            .eq('id', user.id);
          if (avatarError) {
            console.error('Onboarding avatar save error:', avatarError);
            // Non-fatal — continue (avatar failure shouldn't block onboarding)
          }
        }
      } else if (isClient) {
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
            company_logo: clientForm.company_logo || null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });

        if (cpError) {
          console.error('Onboarding client_profiles error:', cpError);
          toast.error('Save Error', 'Failed to save your company profile: ' + cpError.message);
          setSaving(false);
          return;
        }
      }

      const updatedProfile = await fetchUserProfile(user.id);
      if (!updatedProfile) {
        toast.error('Session Expired', 'Please log in again.');
        setSaving(false);
        return;
      }

      const { error: onboardingError } = await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', user.id);

      if (onboardingError) {
        console.error('Onboarding completion error:', onboardingError);
        toast.error('Completion Error', 'Failed to complete onboarding: ' + onboardingError.message);
        setSaving(false);
        return;
      }

      // 🆕 Sync context BEFORE redirect so the dashboard route check sees
      // onboardingCompleted = true immediately (no stale-gate flash).
      updateUser({ onboardingCompleted: true });
      window.location.href = getDashboardRoute();
    } catch (err) {
      console.error('Onboarding save error:', err);
      toast.error('Save Error', 'Failed to save your profile. Please try again. Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  // Calculate progress
  // Clients skip the skills step, so their flow is 3 steps (welcome → profile → review)
  const stepIndex = ['welcome', 'profile', 'skills', 'review'].indexOf(step);
  const totalSteps = isClient ? 3 : 4;
  const progress = ((stepIndex + 1) / totalSteps) * 100;

  const stepDots = isClient
    ? [
        { id: 'welcome', label: 'Welcome', icon: Sparkles },
        { id: 'profile', label: 'Profile', icon: User },
        { id: 'review', label: 'Review', icon: Check },
      ]
    : [
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
                  <div>
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
                          toast.error('File Too Large', 'File must be less than 5MB');
                          return;
                        }
                        setUploadingAvatar(true);
                        try {
                          const result = await avatarUploadService.uploadAvatar(file);
                          if (result.success && result.avatar_url) {
                            setFreelancerForm(prev => ({ ...prev, avatar_url: result.avatar_url }));
                          } else {
                            toast.error('Upload Failed', result.error || 'Failed to upload avatar');
                          }
                        } catch {
                          toast.error('Upload Failed', 'Failed to upload avatar');
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
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Hourly Rate (₹/hr)</label>
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

                    {/* Languages */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Languages</label>
                      <div className="relative">
                        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                          type="text"
                          value={languageInput}
                          maxLength={MAX_LANGUAGE_LENGTH}
                          onChange={(e) => {
                            setLanguageInput(e.target.value);
                            if (e.target.value.trim().length > 0) {
                              const filtered = COMMON_LANGUAGES.filter(l =>
                                l.toLowerCase().includes(e.target.value.toLowerCase()) &&
                                !freelancerForm.languages.includes(l)
                              );
                              setLanguageSuggestions(filtered.slice(0, 5));
                            } else {
                              setLanguageSuggestions([]);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && languageInput.trim()) {
                              e.preventDefault();
                              const lang = languageInput.trim();
                              if (!freelancerForm.languages.includes(lang)) {
                                setFreelancerForm(prev => ({ ...prev, languages: [...prev.languages, lang] }));
                              }
                              setLanguageInput('');
                              setLanguageSuggestions([]);
                            }
                          }}
                          onBlur={() => setTimeout(() => setLanguageSuggestions([]), 150)}
                          placeholder="Add languages you speak (e.g., English, Hindi)"
                          className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                        />
                        {languageSuggestions.length > 0 && (
                          <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                            {languageSuggestions.map(lang => (
                              <button
                                key={lang}
                                type="button"
                                onClick={() => {
                                  if (!freelancerForm.languages.includes(lang)) {
                                    setFreelancerForm(prev => ({ ...prev, languages: [...prev.languages, lang] }));
                                  }
                                  setLanguageInput('');
                                  setLanguageSuggestions([]);
                                }}
                                className="w-full text-left px-4 py-2.5 text-sm hover:bg-emerald-50 transition-colors"
                              >{lang}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      {freelancerForm.languages.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {freelancerForm.languages.map(lang => (
                            <span
                              key={lang}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-medium"
                            >
                              {lang}
                              <button
                                type="button"
                                onClick={() => setFreelancerForm(prev => ({ ...prev, languages: prev.languages.filter(l => l !== lang) }))}
                                className="hover:text-red-500 transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
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
                    {/* Company Logo */}
                    <div className="flex items-center gap-4 mb-4">
                      <div className="relative">
                        <div className="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 border-2 border-slate-200 flex items-center justify-center">
                          {clientForm.company_logo ? (
                            <img src={clientForm.company_logo} alt="Company logo" className="w-full h-full object-cover" />
                          ) : (
                            <Building2 className="w-8 h-8 text-slate-400" />
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => clientLogoInputRef.current?.click()}
                          disabled={uploadingClientLogo}
                          className="absolute -bottom-1 -right-1 w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center hover:bg-emerald-700 transition-colors disabled:opacity-50 shadow-lg"
                        >
                          {uploadingClientLogo ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Camera className="w-4 h-4" />
                          )}
                        </button>
                        <input
                          ref={clientLogoInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/svg+xml"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file || !user?.id) return;
                            if (file.size > 2 * 1024 * 1024) {
                              toast.error('File Too Large', 'Company logo must be less than 2MB');
                              return;
                            }
                            setUploadingClientLogo(true);
                            try {
                              const result = await avatarPackService.uploadCompanyLogo(file, user.id);
                              if (result.success && result.logo_url) {
                                setClientForm(prev => ({ ...prev, company_logo: result.logo_url }));
                                toast.success('Logo Uploaded', 'Company logo added!');
                              } else {
                                toast.error('Upload Failed', result.error || 'Failed to upload logo');
                              }
                            } catch {
                              toast.error('Upload Failed', 'Failed to upload company logo');
                            } finally {
                              setUploadingClientLogo(false);
                            }
                          }}
                          className="hidden"
                        />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">Company Logo</p>
                        <p className="text-xs text-slate-500">Add your company logo to build trust (optional)</p>
                      </div>
                    </div>

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
                      <IndustrySelect
                        value={clientForm.industry}
                        onChange={(ind) => setClientForm({ ...clientForm, industry: ind })}
                        placeholder="Select your industry..."
                      />
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
                    <h2 className="font-display text-xl font-bold text-slate-900">Your Skills & Expertise</h2>
                    <p className="text-sm text-slate-500">
                      Select skills so our AI can match you with relevant projects
                    </p>
                  </div>
                </div>

                {isFreelancer && (
                  <div>
                    <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl mb-6">
                      <p className="text-sm text-purple-700">
                        <strong>Tip:</strong> Pick up to 3 categories that describe your work, then add your own skills.
                        Growlancer matches you to projects based on your categories — you can update these anytime from your profile settings.
                      </p>
                    </div>
                    <CategoryPicker
                      mode="freelancer"
                      maxCategories={3}
                      selectedCategoryIds={selectedCategoryIds}
                      selectedSkills={skillNames}
                      onCategoriesChange={setSelectedCategoryIds}
                      onSkillsChange={setSkillNames}
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
                )}

                {/* Navigation — skills step is freelancer-only (clients skip it) */}
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
                    className="flex items-center gap-2 px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25"
                  >
                    Next: Review
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
                            {freelancerForm.hourly_rate > 0 ? `₹${freelancerForm.hourly_rate}/hr` : 'Rate not set'} 
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
                      {freelancerForm.languages.length > 0 && (
                        <div className="flex items-center gap-1.5 text-sm text-slate-500">
                          <Globe className="w-4 h-4" />
                          {freelancerForm.languages.join(', ')}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center overflow-hidden">
                          {clientForm.company_logo ? (
                            <img src={clientForm.company_logo} alt="Company logo" className="w-full h-full object-cover" />
                          ) : (
                            <Building2 className="w-8 h-8 text-emerald-600" />
                          )}
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
                      {clientForm.website && (
                        <div className="flex items-center gap-1.5 text-sm text-slate-500">
                          <Globe className="w-4 h-4" />
                          {clientForm.website}
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
