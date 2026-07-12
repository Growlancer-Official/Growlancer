import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, Shield, Loader2, AlertCircle, Sparkles, Key, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/**
 * AdminSignupPage — Create admin account with Supabase Auth.
 * Requires a secret admin code to prevent unauthorized signups.
 * After signup + admin grant, real-time redirect via onAuthStateChange in AdminAuthGuard.
 */
export function AdminSignupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate inputs
    if (!name.trim() || !email.trim() || !password.trim() || !adminCode.trim()) {
      setError('Please fill in all fields');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    try {
      // 1. Create the account via Supabase Auth
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password: password.trim(),
        options: {
          data: {
            name: name.trim(),
            role: 'admin',
          },
        },
      });

      if (signUpError) {
        if (signUpError.message.includes('already registered')) {
          setError('This email is already registered. Please log in instead.');
        } else {
          setError(signUpError.message);
        }
        return;
      }

      if (!authData.user) {
        setError('Failed to create account. Please try again.');
        return;
      }

      // Wait a moment for the profile trigger to create the profile
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 2. Call the admin-signup edge function (verifies code against server env var)
      const { data: fnResult, error: fnError } = await supabase.functions.invoke('admin-signup', {
        method: 'POST',
        body: {
          action: 'verify_admin_signup',
          user_id: authData.user.id,
          secret_code: adminCode.trim(),
        },
      });

      const result = fnResult as { success?: boolean; error?: string };

      if (fnError) {
        // Edge function failed — sign out and show error
        await supabase.auth.signOut();
        setError(fnError.message);
        return;
      }

      if (!result?.success) {
        // Secret code wrong or already admin
        await supabase.auth.signOut();
        setError(result?.error || 'Failed to grant admin access. Check your secret code.');
        return;
      }

      // 3. Success! Show success message
      setStep('success');

      // 4. Wait 1.5 sec then redirect — AdminAuthGuard's onAuthStateChange will auto-redirect
      setTimeout(() => {
        navigate('/admin', { replace: true });
      }, 1500);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Success state
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="p-8 rounded-[2rem]" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Admin Account Created!</h2>
            <p className="text-slate-400 text-sm mb-4">
              Your admin account has been set up successfully.
            </p>
            <div className="flex items-center justify-center gap-2 text-emerald-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Redirecting to admin dashboard...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <img 
              src="/UpdatedLogo.webp" 
              alt="Growlancer" 
              className="h-12 w-12 rounded-xl shadow-lg"
            />
            <div className="text-left">
              <h1 className="text-xl font-bold text-white">Growlancer</h1>
              <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Admin Setup</span>
            </div>
          </div>
          <p className="text-slate-400 text-sm">
            Create your admin account. You need the secret admin code.
          </p>
        </div>

        {/* Signup Form */}
        <form 
          onSubmit={handleSignup}
          className="p-8 rounded-[2rem]"
          style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Create Admin Account</h2>
              <p className="text-xs text-slate-500">One-time setup — secure with email & password</p>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Name */}
          <div className="mb-4">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Mohammad Miran Khan"
              autoFocus
              className="w-full px-4 py-3 bg-slate-800/50 border border-white/5 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Email */}
          <div className="mb-4">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Admin Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@growlancer.com"
              className="w-full px-4 py-3 bg-slate-800/50 border border-white/5 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Password */}
          <div className="mb-4">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Password <span className="text-slate-600">(min 8 chars)</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Create a strong password"
                className="w-full pl-11 pr-11 py-3 bg-slate-800/50 border border-white/5 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="mb-4">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              Confirm Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repeat your password"
              className="w-full px-4 py-3 bg-slate-800/50 border border-white/5 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>

          {/* Secret Admin Code */}
          <div className="mb-6">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
              <span className="flex items-center gap-1">
                <Key className="w-3 h-3" />
                Secret Admin Code
              </span>
            </label>
            <input
              type="password"
              value={adminCode}
              onChange={e => setAdminCode(e.target.value)}
              placeholder="Enter the secret admin setup code"
              className="w-full px-4 py-3 bg-slate-800/50 border border-amber-500/20 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
            />
            <p className="mt-1 text-[10px] text-slate-500">
              Enter the admin setup code provided to you.
            </p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Creating admin account...</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Create Admin Account</>
            )}
          </button>

          {/* Link to Login */}
          <div className="mt-4 text-center">
            <Link
              to="/admin"
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              Already have an account? Sign in
            </Link>
          </div>
        </form>

        <p className="text-center mt-6 text-[10px] text-slate-600">
          Only one admin account is needed. Keep your credentials secure.
        </p>
      </div>
    </div>
  );
}
