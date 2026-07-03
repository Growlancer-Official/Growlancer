import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, realtimeChannels } from '../lib/supabase';
import { clientPaymentMethodsService } from '../lib/clientPaymentMethods';
import { notificationPreferencesService } from '../lib/notificationPreferences';
import { avatarPackService } from '../lib/avatarPack';
import type { ClientPaymentMethod } from '../lib/clientPaymentMethods';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Building2,
  Camera,
  Check,
  Code,
  Copy,
  CreditCard,
  Delete,
  Eye,
  EyeOff,
  Globe,
  History,
  Image,
  Link,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Plus,
  QrCode,
  Save,
  Scan,
  Settings,
  Shield,
  Sidebar,
  Star,
  Trash2,
  Type,
  Upload,
  User,
  X,
} from 'lucide-react';

export function ClientSettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'company' | 'account' | 'security' | 'notifications' | 'privacy' | 'billing' | 'deletion'>('company');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Company form state
  const [companyData, setCompanyData] = useState({
    company_name: '',
    industry: '',
    website: '',
    size: '1-10',
    location: '',
    description: '',
  });

  // Account form state
  const [accountData, setAccountData] = useState({
    name: '',
    email: '',
  });

  // Security form state
  const [securityData, setSecurityData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    showCurrentPassword: false,
    showNewPassword: false,
  });

  // Notification preferences state
  const [notifications, setNotifications] = useState({
    proposals: { email: true, inApp: true, push: true },
    contracts: { email: true, inApp: true, push: true },
    messages: { email: true, inApp: true, push: true },
    payments: { email: true, inApp: true, push: true },
    milestones: { email: true, inApp: true, push: true },
    marketing: { email: false, inApp: true, push: false },
  });

  // Privacy settings state
  const [privacy, setPrivacy] = useState({
    profileVisibility: 'public' as 'public' | 'private',
    showOnlineStatus: true,
    allowDirectMessages: true,
    showTotalSpend: false,
    showActiveProjects: true,
  });

  // ── 2FA state ──
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [showQrCode, setShowQrCode] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [twoFactorSecret, setTwoFactorSecret] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Billing / Payment Methods state ──
  const [paymentMethods, setPaymentMethods] = useState<ClientPaymentMethod[]>([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingSaving, setBillingSaving] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newPaymentType, setNewPaymentType] = useState<'card' | 'paypal' | 'bank_transfer'>('paypal');

  // ── Company Logo state ──
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [deletingLogo, setDeletingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // ── Company Logo Handlers ──
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setErrorMessage(null);
    try {
      const result = await avatarPackService.uploadCompanyLogo(file, user?.id || 'temp');
      if (result.success && result.logo_url) {
        setCompanyLogo(result.logo_url);
        setSuccessMessage('Logo uploaded!');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        setErrorMessage(result.error || 'Failed to upload logo.');
      }
    } catch {
      setErrorMessage('Failed to upload logo.');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleLogoDelete = async () => {
    if (!confirm('Remove company logo?')) return;
    setDeletingLogo(true);
    try {
      await supabase.from('client_profiles').update({ company_logo: null } as any).eq('user_id', user?.id);
      setCompanyLogo(null);
      setSuccessMessage('Logo removed!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch {
      setErrorMessage('Failed to remove logo.');
    } finally {
      setDeletingLogo(false);
    }
  };

  // ── Account Deletion state ──
  const [deletionReason, setDeletionReason] = useState('');
  const [deletionConfirm, setDeletionConfirm] = useState('');
  const [deletionStep, setDeletionStep] = useState<'initial' | 'confirm' | 'processing'>('initial');
  const [newPaypalEmail, setNewPaypalEmail] = useState('');
  const [newCardLastFour, setNewCardLastFour] = useState('');
  const [newCardBrand, setNewCardBrand] = useState('');
  const [newCardExpiry, setNewCardExpiry] = useState('');
  const [newBankName, setNewBankName] = useState('');
  const [newBankAccountName, setNewBankAccountName] = useState('');
  const [newBankAccountLastFour, setNewBankAccountLastFour] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fetchClientProfile = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Fetch main profile
      const { data: profileResp, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!profileErr && profileResp) {
        setAccountData({
          name: profileResp.name || '',
          email: profileResp.email || '',
        });
      }

      // Fetch client profile
      const { data: clientResp, error: clientErr } = await supabase
        .from('client_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!clientErr && clientResp) {
        setCompanyData({
          company_name: clientResp.company_name || '',
          industry: clientResp.industry || '',
          website: clientResp.website || '',
          size: clientResp.size || '1-10',
          location: clientResp.location || '',
          description: clientResp.description || '',
        });
        setCompanyLogo((clientResp as { company_logo?: string | null }).company_logo || null);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error fetching profile:', error);
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchClientProfile();

    const subscription = realtimeChannels.profiles(`client-profile-${user?.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'client_profiles',
          filter: `user_id=eq.${user?.id}`,
        },            (payload) => {
          setCompanyData({
            company_name: payload.new.company_name || '',
            industry: payload.new.industry || '',
            website: payload.new.website || '',
            size: payload.new.size || '1-10',
            location: payload.new.location || '',
            description: payload.new.description || '',
          });
          setCompanyLogo((payload.new as { company_logo?: string | null }).company_logo || null);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user?.id, fetchClientProfile]);

  const handleCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { error } = await supabase
        .from('client_profiles')
        .upsert({
          user_id: user?.id,
          company_name: companyData.company_name,
          industry: companyData.industry,
          website: companyData.website,
          size: companyData.size,
          location: companyData.location,
          description: companyData.description,
        });

      if (error) throw error;
      setSuccessMessage('Company profile saved successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Error saving profile:', error);
      setErrorMessage('Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    if (securityData.newPassword !== securityData.confirmPassword) {
      setErrorMessage('New passwords do not match');
      setSaving(false);
      return;
    }

    if (securityData.newPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters');
      setSaving(false);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: securityData.newPassword,
      });

      if (error) throw error;

      setSuccessMessage('Password changed successfully!');
      setSecurityData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        showCurrentPassword: false,
        showNewPassword: false,
      });
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Error changing password:', error);
      setErrorMessage('Failed to change password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── 2FA Handlers ──
  const handleSetup2FA = async () => {
    setTwoFactorLoading(true);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('twofa-management', {
        body: { action: 'enroll' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data) {
        setQrCodeUrl(data.totp.qr_code || '');
        setTwoFactorSecret(data.totp.secret || '');
        setFactorId(data.factor_id || '');
        setRecoveryCodes(data.recovery_codes || []);
        setShowQrCode(true);
      }
    } catch (error) {
      console.error('Error setting up 2FA:', error);
      setErrorMessage('Failed to setup 2FA. Please try again.');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    setTwoFactorLoading(true);
    setErrorMessage(null);
    try {
      if (!factorId) {
        throw new Error('No MFA factor found. Please set up 2FA again.');
      }
      if (twoFactorCode.length !== 6) {
        throw new Error('Please enter a valid 6-digit verification code.');
      }

      const { data, error } = await supabase.functions.invoke('twofa-management', {
        body: {
          action: 'verify',
          factor_id: factorId,
          code: twoFactorCode,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setTwoFactorEnabled(true);
      setShowQrCode(false);
      setShowRecoveryCodes(true);
      setSuccessMessage('Two-factor authentication enabled successfully!');
      setTimeout(() => {
        setSuccessMessage(null);
        setShowRecoveryCodes(false);
      }, 5000);
    } catch (error) {
      console.error('Error verifying 2FA:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Invalid code. Please try again.');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    setTwoFactorLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twofa-management', {
        body: { action: 'disable' },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setTwoFactorEnabled(false);
      setSuccessMessage('Two-factor authentication disabled.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Error disabling 2FA:', error);
      setErrorMessage('Failed to disable 2FA.');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  // ── Notification Save Handler ──
  const handleNotificationsSave = async () => {
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const { success, error } = await notificationPreferencesService.save(notifications);

      if (!success) throw new Error(error || 'Failed to save preferences');
      setSuccessMessage('Notification preferences saved!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Error saving notification preferences:', error);
      setErrorMessage('Failed to save notification preferences.');
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  // ── Privacy Save Handler ──
  const handlePrivacySave = async () => {
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const { error } = await supabase
        .from('client_profiles')
        .upsert({
          user_id: user?.id,
          privacy_settings: privacy,
        } as any, { onConflict: 'user_id' });

      if (error) throw error;
      setSuccessMessage('Privacy settings saved!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Error saving privacy settings:', error);
      setErrorMessage('Failed to save privacy settings. Please try again.');
      setTimeout(() => setErrorMessage(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyRecoveryCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Account Deletion Handler ──
  const handleRequestDeletion = async () => {
    setDeletionStep('processing');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Failed to delete account');
      }

      // Sign out and redirect immediately
      setSuccessMessage('Your account has been permanently deleted.');
      setTimeout(async () => {
        await supabase.auth.signOut();
        window.location.href = '/';
      }, 1500);
    } catch (err: any) {
      console.error('[delete-account]', err);
      setErrorMessage(err?.message || 'Failed to delete account. Please contact support.');
      setDeletionStep('confirm');
    }
  };

  // ── Billing / Payment Methods Handlers ──
  const fetchPaymentMethods = useCallback(async () => {
    if (!user?.id) return;
    setBillingLoading(true);
    try {
      const result = await clientPaymentMethodsService.getPaymentMethods();
      if (result.success && result.methods) {
        setPaymentMethods(result.methods);
      }
    } catch (err) {
      console.error('Error fetching payment methods:', err);
    } finally {
      setBillingLoading(false);
    }
  }, [user?.id]);

  // Fetch payment methods when billing tab is active
  useEffect(() => {
    if (activeTab === 'billing') {
      fetchPaymentMethods();
    }
  }, [activeTab, fetchPaymentMethods]);

  const handleAddPaymentMethod = async () => {
    setBillingSaving(true);
    setErrorMessage(null);
    try {
      const data: any = { type: newPaymentType, is_default: paymentMethods.length === 0 };
      if (newPaymentType === 'paypal') {
        data.paypal_email = newPaypalEmail;
      } else if (newPaymentType === 'card') {
        data.card_last_four = newCardLastFour;
        data.card_brand = newCardBrand;
        data.card_expiry = newCardExpiry;
      } else if (newPaymentType === 'bank_transfer') {
        data.account_holder_name = newBankAccountName;
        data.account_number_last_four = newBankAccountLastFour;
        data.bank_name = newBankName;
      }
      const result = await clientPaymentMethodsService.addPaymentMethod(data);
      if (result.success) {
        setSuccessMessage('Payment method added successfully!');
        setTimeout(() => setSuccessMessage(null), 3000);
        setShowAddPayment(false);
        resetNewPaymentForm();
        await fetchPaymentMethods();
      } else {
        setErrorMessage(result.error || 'Failed to add payment method');
      }
    } catch (err) {
      console.error('Error adding payment method:', err);
      setErrorMessage('Failed to add payment method. Please try again.');
    } finally {
      setBillingSaving(false);
    }
  };

  const resetNewPaymentForm = () => {
    setNewPaypalEmail('');
    setNewCardLastFour('');
    setNewCardBrand('');
    setNewCardExpiry('');
    setNewBankName('');
    setNewBankAccountName('');
    setNewBankAccountLastFour('');
    setNewPaymentType('paypal');
  };

  const handleSetDefaultPayment = async (methodId: string) => {
    try {
      const result = await clientPaymentMethodsService.setDefaultPaymentMethod(methodId);
      if (result.success) {
        await fetchPaymentMethods();
      } else {
        setErrorMessage(result.error || 'Failed to set default');
      }
    } catch (err) {
      console.error('Error setting default payment method:', err);
    }
  };

  const handleDeletePayment = async (methodId: string) => {
    try {
      const result = await clientPaymentMethodsService.deletePaymentMethod(methodId);
      if (result.success) {
        setSuccessMessage('Payment method removed.');
        setTimeout(() => setSuccessMessage(null), 3000);
        setDeleteConfirmId(null);
        await fetchPaymentMethods();
      } else {
        setErrorMessage(result.error || 'Failed to delete payment method');
      }
    } catch (err) {
      console.error('Error deleting payment method:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 mt-1">Manage your account settings and preferences</p>
      </div>

      {/* Messages */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar Navigation */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl border border-slate-100 p-4 sticky top-4">
            <nav className="space-y-1">
              {[
                { id: 'company', label: 'Company Profile', icon: Building2 },
                { id: 'account', label: 'Account', icon: User },
                { id: 'security', label: 'Security', icon: Shield },
                { id: 'notifications', label: 'Notifications', icon: Bell },
                { id: 'privacy', label: 'Privacy', icon: Globe },
                { id: 'billing', label: 'Billing', icon: CreditCard },
                { id: 'deletion', label: 'Delete Account', icon: Trash2 },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id as any)}
                  className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl font-medium transition-colors ${
                    activeTab === id
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Company Profile Tab */}
          {activeTab === 'company' && (
            <>
              <div className="bg-white p-6 rounded-2xl border border-slate-100">
                <h2 className="font-display text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-emerald-600" />
                  Company Profile
                </h2>

                {/* Company Logo Upload */}
                <div className="mb-6 p-5 bg-slate-50 rounded-xl border border-slate-200">
                  <label className="block text-sm font-medium text-slate-700 mb-3">
                    Company Logo
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 overflow-hidden flex items-center justify-center bg-white flex-shrink-0">
                      {companyLogo ? (
                        <img src={companyLogo} alt="Company Logo" className="w-full h-full object-contain p-2" />
                      ) : (
                        <Image className="w-8 h-8 text-slate-300" />
                      )}
                    </div>
                    <div className="flex-1">
                      <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" onChange={handleLogoUpload} className="hidden" />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo}
                          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-emerald-300 transition-all disabled:opacity-50">
                          {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                          {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                        </button>
                        {companyLogo && (
                          <button type="button" onClick={handleLogoDelete} disabled={deletingLogo}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-all disabled:opacity-50">
                            {deletingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Remove
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-2">PNG, JPG, SVG or WebP. Max 2MB.</p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleCompanySubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Company Name</label>
                      <input type="text" value={companyData.company_name} onChange={(e) => setCompanyData({ ...companyData, company_name: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all" placeholder="Your company name" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Industry</label>
                      <input type="text" value={companyData.industry} onChange={(e) => setCompanyData({ ...companyData, industry: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all" placeholder="e.g., Technology, Healthcare" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Website</label>
                    <div className="relative">
                      <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input type="url" value={companyData.website} onChange={(e) => setCompanyData({ ...companyData, website: e.target.value })}
                        className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all" placeholder="https://yourcompany.com" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Company Size</label>
                      <select value={companyData.size} onChange={(e) => setCompanyData({ ...companyData, size: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all">
                        <option value="1-10">1-10 employees</option>
                        <option value="11-50">11-50 employees</option>
                        <option value="51-200">51-200 employees</option>
                        <option value="201-500">201-500 employees</option>
                        <option value="500+">500+ employees</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Location</label>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input type="text" value={companyData.location} onChange={(e) => setCompanyData({ ...companyData, location: e.target.value })}
                          className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all" placeholder="City, Country" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
                    <textarea rows={4} value={companyData.description} onChange={(e) => setCompanyData({ ...companyData, description: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all resize-none" placeholder="Tell freelancers about your company..." />
                  </div>
                  <div className="flex justify-end">
                    <button type="submit" disabled={saving}
                      className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25 disabled:opacity-50 disabled:cursor-not-allowed">
                      {saving ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</> : <><Save className="w-5 h-5" /> Save Changes</>}
                    </button>
                  </div>
                </form>
              </div>

              {/* Company Tips — fills blank space */}
              <div className="bg-gradient-to-br from-blue-50 to-white rounded-2xl p-6 border border-blue-100 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <Building2 className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-xs mb-1">Complete Profile</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">A complete company profile attracts more qualified freelancers. Add your logo and description to stand out.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <Globe className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-xs mb-1">Website Link</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">Add your company website to build credibility. Freelancers often research companies before applying.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <MapPin className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-xs mb-1">Location Matters</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">Listing your location helps match with local freelancers and sets clear timezone expectations.</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Account Tab */}
          {activeTab === 'account' && (
            <>
              <div className="bg-white p-6 rounded-2xl border border-slate-100">
                <h2 className="font-display text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <User className="w-5 h-5 text-emerald-600" />
                  Account Information
                </h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-slate-400" />
                      <div>
                        <p className="text-sm text-slate-500">Email</p>
                        <p className="font-medium text-slate-900">{accountData.email}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-slate-400" />
                      <div>
                        <p className="text-sm text-slate-500">Full Name</p>
                        <p className="font-medium text-slate-900">{accountData.name}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Account Tips — fills blank space */}
              <div className="bg-gradient-to-br from-indigo-50 to-white rounded-2xl p-6 border border-indigo-100 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-xs mb-1">Profile Trust</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">A complete profile with your name builds trust with freelancers. Make sure your information is up to date.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <Mail className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-xs mb-1">Email Notifications</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">All project updates and messages are sent to your email. Check the Notifications tab to customize alerts.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <Shield className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-xs mb-1">Account Security</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">Keep your account secure by using a strong password and enabling two-factor authentication.</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-100">
                <h2 className="font-display text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Lock className="w-5 h-5 text-emerald-600" /> Change Password
                </h2>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">New Password</label>
                    <div className="relative">
                      <input type={securityData.showNewPassword ? 'text' : 'password'} value={securityData.newPassword} onChange={(e) => setSecurityData({ ...securityData, newPassword: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all pr-10" />
                      <button type="button" onClick={() => setSecurityData({ ...securityData, showNewPassword: !securityData.showNewPassword })}
                        className="absolute right-4 top-1/2 -translate-y-1/2">
                        {securityData.showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Confirm Password</label>
                    <input type="password" value={securityData.confirmPassword} onChange={(e) => setSecurityData({ ...securityData, confirmPassword: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all" />
                  </div>
                  <button type="submit" disabled={saving} className="w-full px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25 disabled:opacity-50 disabled:cursor-not-allowed">
                    {saving ? 'Updating...' : 'Update Password'}
                  </button>
                </form>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-100">
                <h2 className="font-display text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-emerald-600" /> Two-Factor Authentication
                </h2>
                <p className="text-slate-600 mb-4">Add an extra layer of security to your account</p>
                {!showQrCode && !showRecoveryCodes && (
                  <div className="space-y-4">
                    {twoFactorEnabled ? (
                      <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                        <Shield className="w-6 h-6 text-emerald-600" />
                        <div className="flex-1">
                          <p className="font-medium text-emerald-800">2FA is Active</p>
                          <p className="text-sm text-emerald-600">Your account is protected by two-factor authentication</p>
                        </div>
                        <button onClick={handleDisable2FA} disabled={twoFactorLoading}
                          className="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-xl hover:bg-red-50 transition-colors">Disable</button>
                      </div>
                    ) : (
                      <button onClick={handleSetup2FA} disabled={twoFactorLoading}
                        className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25 disabled:opacity-50">
                        {twoFactorLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />}
                        {twoFactorLoading ? 'Setting up...' : 'Enable Two-Factor Authentication'}
                      </button>
                    )}
                  </div>
                )}
                {showQrCode && (
                  <div className="space-y-4">
                    <div className="flex justify-center p-6 bg-white border-2 border-dashed border-slate-200 rounded-xl">
                      <div className="text-center">
                        {qrCodeUrl ? <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48 mx-auto" /> : <div className="w-48 h-48 bg-slate-100 rounded-lg flex items-center justify-center"><QrCode className="w-16 h-16 text-slate-400" /></div>}
                        <p className="text-sm text-slate-500 mt-3">Scan this QR code with your authenticator app</p>
                      </div>
                    </div>
                    {twoFactorSecret && (
                      <div className="p-4 bg-slate-50 rounded-xl">
                        <p className="text-sm font-medium text-slate-700 mb-2">Or enter this code manually:</p>
                        <code className="block p-3 bg-white border border-slate-200 rounded-lg text-sm font-mono text-center select-all">{twoFactorSecret}</code>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Verify Code</label>
                      <div className="flex gap-2">
                        <input type="text" value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value)} placeholder="000000" maxLength={6}
                          className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all text-center text-lg font-mono tracking-widest" />
                        <button onClick={handleVerify2FA} disabled={twoFactorLoading || twoFactorCode.length !== 6}
                          className="px-6 py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                          {twoFactorLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {showRecoveryCodes && (
                  <div className="space-y-4">
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                      <div className="flex items-center gap-2 mb-2"><AlertTriangle className="w-5 h-5 text-amber-600" /><p className="font-medium text-amber-800">Recovery Codes</p></div>
                      <p className="text-sm text-amber-700 mb-3">Save these recovery codes in a secure place.</p>
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        {recoveryCodes.map((code, i) => <code key={i} className="p-2 bg-white border border-amber-300 rounded-lg text-sm font-mono text-center">{code}</code>)}
                      </div>
                      <button onClick={handleCopyRecoveryCodes} className="flex items-center gap-2 text-sm font-medium text-amber-700 hover:text-amber-800">
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? 'Copied!' : 'Copy Codes'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Security Tips — fills blank space */}
              <div className="bg-gradient-to-br from-amber-50 to-white rounded-2xl p-6 border border-amber-100 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <Lock className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-xs mb-1">Strong Passwords</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">Use at least 8 characters with a mix of letters, numbers, and special characters for maximum security.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <Shield className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-xs mb-1">Enable 2FA</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">Two-factor authentication adds an extra layer of security to prevent unauthorized access to your account.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <Eye className="w-4 h-4 text-amber-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-xs mb-1">Regular Updates</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">Change your password regularly and never reuse passwords from other websites or services.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <>
              <div className="bg-white p-6 rounded-2xl border border-slate-100">
                <h2 className="font-display text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Bell className="w-5 h-5 text-emerald-600" /> Notification Preferences
                </h2>
                <div className="space-y-4">
                  {Object.entries(notifications).map(([key, value]) => (
                    <div key={key} className="p-4 border border-slate-200 rounded-xl">
                      <p className="font-medium text-slate-900 mb-3 capitalize">{key}</p>
                      <div className="flex gap-6">
                        {Object.entries(value).map(([type, enabled]) => (
                          <label key={type} className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={enabled}
                              onChange={(e) => setNotifications({ ...notifications, [key]: { ...value, [type]: e.target.checked } })}
                              className="w-4 h-4 text-emerald-600 rounded border-slate-300" />
                            <span className="text-sm text-slate-600 capitalize">{type.replace(/([A-Z])/g, ' $1').trim()}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end pt-4 border-t border-slate-100 mt-6">
                  <button onClick={handleNotificationsSave} disabled={saving}
                    className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25 disabled:opacity-50 disabled:cursor-not-allowed">
                    {saving ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</> : <><Save className="w-5 h-5" /> Save Preferences</>}
                  </button>
                </div>
              </div>

              {/* Notifications Tips — fills blank space */}
              <div className="bg-gradient-to-br from-purple-50 to-white rounded-2xl p-6 border border-purple-100 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <Bell className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-xs mb-1">Stay Informed</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">Enable notifications to stay updated on proposals, messages, and project milestones in real time.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <Mail className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-xs mb-1">Email Alerts</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">Never miss important updates. Email notifications ensure you're always in the loop even when offline.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-purple-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <Star className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-xs mb-1">Customize Alerts</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">You have full control over which notifications you receive. Disable what's not relevant to your workflow.</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Privacy Tab */}
          {activeTab === 'privacy' && (
            <>
              <div className="bg-white p-6 rounded-2xl border border-slate-100">
                <h2 className="font-display text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Globe className="w-5 h-5 text-emerald-600" /> Privacy Settings
                </h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Profile Visibility</label>
                    <select value={privacy.profileVisibility} onChange={(e) => setPrivacy({ ...privacy, profileVisibility: e.target.value as any })}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all">
                      <option value="public">Public - Anyone can see your company profile</option>
                      <option value="private">Private - Hidden from search</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div><p className="font-medium text-slate-900">Allow Direct Messages</p><p className="text-sm text-slate-600">Allow freelancers to contact you directly</p></div>
                    <input type="checkbox" checked={privacy.allowDirectMessages} onChange={(e) => setPrivacy({ ...privacy, allowDirectMessages: e.target.checked })} className="w-5 h-5 text-emerald-600 rounded border-slate-300" />
                  </div>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div><p className="font-medium text-slate-900">Show Online Status</p><p className="text-sm text-slate-600">Let freelancers see when you're online</p></div>
                    <input type="checkbox" checked={privacy.showOnlineStatus} onChange={(e) => setPrivacy({ ...privacy, showOnlineStatus: e.target.checked })} className="w-5 h-5 text-emerald-600 rounded border-slate-300" />
                  </div>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div><p className="font-medium text-slate-900">Show Total Spend</p><p className="text-sm text-slate-600">Display your total platform spending on your profile</p></div>
                    <input type="checkbox" checked={privacy.showTotalSpend} onChange={(e) => setPrivacy({ ...privacy, showTotalSpend: e.target.checked })} className="w-5 h-5 text-emerald-600 rounded border-slate-300" />
                  </div>
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div><p className="font-medium text-slate-900">Show Active Projects</p><p className="text-sm text-slate-600">Display your active projects on your profile</p></div>
                    <input type="checkbox" checked={privacy.showActiveProjects} onChange={(e) => setPrivacy({ ...privacy, showActiveProjects: e.target.checked })} className="w-5 h-5 text-emerald-600 rounded border-slate-300" />
                  </div>
                  <div className="flex justify-end pt-4 border-t border-slate-100">
                    <button onClick={handlePrivacySave} disabled={saving}
                      className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25 disabled:opacity-50 disabled:cursor-not-allowed">
                      {saving ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</> : <><Save className="w-5 h-5" /> Save Privacy Settings</>}
                    </button>
                  </div>
                </div>
              </div>

              {/* Privacy Tips — fills blank space */}
              <div className="bg-gradient-to-br from-sky-50 to-white rounded-2xl p-6 border border-sky-100 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <Globe className="w-4 h-4 text-sky-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-xs mb-1">Public vs Private</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">Public profiles attract more freelancer applications. Switch to private if you prefer limited visibility.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <Eye className="w-4 h-4 text-sky-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-xs mb-1">Online Status</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">Showing your online status helps freelancers know when you're available for quick responses and interviews.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-sky-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <Shield className="w-4 h-4 text-sky-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-xs mb-1">Data Privacy</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">Your data is encrypted and secure. We never share your personal information without your explicit consent.</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Billing Tab */}
          {activeTab === 'billing' && (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-emerald-600" /> Payment Methods
                  </h2>
                  {!showAddPayment && (
                    <button onClick={() => setShowAddPayment(true)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-all">
                      <Plus className="w-4 h-4" /> Add Method
                    </button>
                  )}
                </div>

                {billingLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>
                ) : paymentMethods.length > 0 ? (
                  <div className="space-y-3">
                    {paymentMethods.map((method) => (
                      <div key={method.id} className="flex items-center gap-4 p-4 border border-slate-200 rounded-xl hover:border-slate-300 transition-all">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                          {method.type === 'paypal' ? <Mail className="w-5 h-5 text-blue-600" /> : method.type === 'card' ? <CreditCard className="w-5 h-5 text-slate-600" /> : <Building2 className="w-5 h-5 text-slate-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 capitalize">
                            {method.type === 'paypal' ? 'PayPal' : method.type === 'card' ? `${method.card_brand || 'Card'} ****${method.card_last_four || ''}` : `${method.bank_name || 'Bank'} ****${method.account_number_last_four || ''}`}
                          </p>
                          <p className="text-sm text-slate-500 truncate">
                            {method.type === 'paypal' ? method.paypal_email : method.type === 'card' ? `Expires ${method.card_expiry || 'N/A'}` : method.account_holder_name || ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {method.is_default ? (
                            <span className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg"><Star className="w-3 h-3 fill-amber-500" /> Default</span>
                          ) : (
                            <button onClick={() => handleSetDefaultPayment(method.id)} className="p-2 text-slate-400 hover:text-amber-500 transition-colors" title="Set as default"><Star className="w-4 h-4" /></button>
                          )}
                          {deleteConfirmId === method.id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleDeletePayment(method.id)} className="p-2 text-red-500 hover:text-red-700 transition-colors" title="Confirm delete"><Check className="w-4 h-4" /></button>
                              <button onClick={() => setDeleteConfirmId(null)} className="p-2 text-slate-400 hover:text-slate-600 transition-colors" title="Cancel"><X className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteConfirmId(method.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors" title="Remove"><Trash2 className="w-4 h-4" /></button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <CreditCard className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                    <p>No payment methods added yet.</p>
                    <p className="text-sm">Click "Add Method" to add your first payment method.</p>
                  </div>
                )}
              </div>

              {showAddPayment && (
                <div className="bg-white p-6 rounded-2xl border border-slate-100">
                  <h3 className="font-display text-base font-bold text-slate-900 mb-4">Add Payment Method</h3>
                  <div className="flex gap-2 mb-6">
                    {(['paypal', 'card', 'bank_transfer'] as const).map((type) => (
                      <button key={type} onClick={() => setNewPaymentType(type)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${newPaymentType === type ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        {type === 'paypal' ? 'PayPal' : type === 'card' ? 'Card' : 'Bank Transfer'}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-4">
                    {newPaymentType === 'paypal' && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">PayPal Email</label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                          <input type="email" value={newPaypalEmail} onChange={(e) => setNewPaypalEmail(e.target.value)} placeholder="your-paypal@example.com"
                            className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all" />
                        </div>
                      </div>
                    )}
                    {newPaymentType === 'card' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Card Brand</label>
                          <select value={newCardBrand} onChange={(e) => setNewCardBrand(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all">
                            <option value="">Select brand</option><option value="Visa">Visa</option><option value="Mastercard">Mastercard</option><option value="Amex">American Express</option><option value="Discover">Discover</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Last 4 Digits</label>
                          <input type="text" value={newCardLastFour} onChange={(e) => setNewCardLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" maxLength={4} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all" />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-slate-700 mb-2">Expiry Date</label>
                          <input type="text" value={newCardExpiry} onChange={(e) => setNewCardExpiry(e.target.value)} placeholder="MM/YY" maxLength={5} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all" />
                        </div>
                      </div>
                    )}
                    {newPaymentType === 'bank_transfer' && (
                      <div className="space-y-4">
                        <div><label className="block text-sm font-medium text-slate-700 mb-2">Bank Name</label><input type="text" value={newBankName} onChange={(e) => setNewBankName(e.target.value)} placeholder="e.g., Wells Fargo" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all" /></div>
                        <div><label className="block text-sm font-medium text-slate-700 mb-2">Account Holder Name</label><input type="text" value={newBankAccountName} onChange={(e) => setNewBankAccountName(e.target.value)} placeholder="Full name on account" className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all" /></div>
                        <div><label className="block text-sm font-medium text-slate-700 mb-2">Last 4 Digits</label><input type="text" value={newBankAccountLastFour} onChange={(e) => setNewBankAccountLastFour(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" maxLength={4} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all" /></div>
                      </div>
                    )}
                    <div className="flex gap-3 pt-2">
                      <button onClick={handleAddPaymentMethod} disabled={billingSaving}
                        className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25 disabled:opacity-50 disabled:cursor-not-allowed">
                        {billingSaving ? <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</> : <><Plus className="w-5 h-5" /> Add Payment Method</>}
                      </button>
                      <button onClick={() => { setShowAddPayment(false); resetNewPaymentForm(); }} className="px-6 py-3 text-slate-600 font-medium rounded-xl border border-slate-200 hover:bg-slate-50 transition-all">Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="bg-white p-6 rounded-2xl border border-slate-100">
                <h3 className="font-display text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-emerald-600" /> Billing History
                </h3>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="text-slate-600 text-sm">Your transaction history and invoices will appear here.</p>
                </div>
              </div>

              {/* Billing Tips — fills blank space */}
              <div className="bg-gradient-to-br from-green-50 to-white rounded-2xl p-6 border border-green-100 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <CreditCard className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-xs mb-1">Payment Methods</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">Add multiple payment methods for flexibility. Set a default for automatic payments and transactions.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <Star className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-xs mb-1">Default Method</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">Your default payment method will be used for all automatic payments and subscription renewals.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                      <Lock className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900 text-xs mb-1">Secure Billing</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed">All payment information is encrypted and securely stored. We never share your financial details with third parties.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          {/* Deletion Tab */}
          {activeTab === 'deletion' && (
            <div className="bg-white p-6 rounded-2xl border border-slate-100">
              <h2 className="font-display text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-500" />
                Delete Account
              </h2>

              {deletionStep === 'initial' && (
                <div className="space-y-6">
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                      <p className="font-medium text-red-800">Warning: This action cannot be undone</p>
                    </div>
                    <p className="text-sm text-red-700">
                      Deleting your account will permanently remove all your data including projects,
                      contracts, messages, and payment history. This action is irreversible.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Why are you leaving? (optional)
                    </label>
                    <textarea
                      rows={3}
                      value={deletionReason}
                      onChange={(e) => setDeletionReason(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none transition-all resize-none"
                      placeholder="Help us improve by sharing why you're leaving..."
                    />
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={deletionConfirm === 'DELETE'}
                        onChange={(e) => setDeletionConfirm(e.target.checked ? 'DELETE' : '')}
                        className="mt-1 w-4 h-4 text-red-600 rounded border-slate-300 cursor-pointer"
                      />
                      <div>
                        <p className="font-medium text-slate-900">I understand this action is irreversible</p>
                        <p className="text-sm text-slate-500">
                          I confirm that I want to permanently delete my account and all associated data
                        </p>
                      </div>
                    </label>
                  </div>

                  <button
                    onClick={() => setDeletionStep('confirm')}
                    disabled={deletionConfirm !== 'DELETE'}
                    className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-red-600/25 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-5 h-5" />
                    Continue with Deletion
                  </button>
                </div>
              )}

              {deletionStep === 'confirm' && (
                <div className="space-y-6">
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                    <AlertTriangle className="w-5 h-5 text-red-600 mb-2" />
                    <p className="font-medium text-red-800">Final Confirmation</p>
                    <p className="text-sm text-red-700 mt-1">
                      Please type <strong>DELETE</strong> below to confirm
                    </p>
                  </div>

                  <input
                    type="text"
                    value={deletionConfirm}
                    onChange={(e) => setDeletionConfirm(e.target.value)}
                    placeholder="Type DELETE to confirm"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none transition-all text-center text-lg font-bold"
                  />

                  <div className="flex gap-3">
                    <button
                      onClick={() => { setDeletionStep('initial'); setDeletionConfirm(''); }}
                      className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleRequestDeletion}
                      disabled={deletionConfirm !== 'DELETE'}
                      className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-red-600/25 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-5 h-5" />
                      Permanently Delete Account
                    </button>
                  </div>
                </div>
              )}

              {deletionStep === 'processing' && (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-red-600 mx-auto mb-4" />
                  <p className="font-medium text-slate-900">Processing your deletion request...</p>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
