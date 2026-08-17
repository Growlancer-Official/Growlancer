import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, realtimeChannels, clearSupabaseAuthStorage } from '../lib/supabase';
import { razorpayService, type SavedPaymentCard } from '../lib/razorpay';
import { notificationPreferencesService } from '../lib/notificationPreferences';
import { avatarPackService } from '../lib/avatarPack';
import { formatCurrency } from '../utils/date';
import { inviteService, type UserInvitation } from '../lib/inviteService';
import { ReauthDialog } from '../components/ReauthDialog';
import { isReauthValid, markReauthVerified } from '../lib/reauth';
import { EmailVerificationBanner } from '../components/EmailVerificationBanner';
import { IndustrySelect } from '../components/IndustrySelect';
import { getNameChangeLock } from '../lib/nameChangeLock';
import { validateOptionalGstin, normalizeGstin } from '../lib/gst';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Building2,
  Camera,
  Check,
  CheckCircle,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  Globe,
  Image,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Plus,
  QrCode,
  Receipt,
  RefreshCw,
  Save,
  Send,
  Shield,
  Star,
  Landmark,
  Smartphone,
  Timer,
  Wallet,
  Trash2,
  User,
  UserPlus,
  X,
  XCircle,
} from 'lucide-react';

// ── Billing helpers ─────────────────────────────────────────────────────────
interface BillingOrder {
  id: string;
  razorpay_order_id: string;
  razorpay_payment_id?: string | null;
  order_type: string;
  amount: number;
  currency: string;
  status: string;
  description?: string | null;
  created_at: string;
}

function orderTypeLabel(type: string): string {
  switch (type) {
    case 'contract_escrow': return 'Escrow Funding';
    case 'subscription': return 'Subscription';
    case 'service_purchase': return 'Service Purchase';
    case 'card_verification': return 'Card Verification';
    default:
      return type
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
  }
}

const orderStatusStyles: Record<string, string> = {
  created: 'bg-slate-100 text-slate-600',
  captured: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-600',
  refunded: 'bg-amber-100 text-amber-700',
};

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
    account_type: 'individual' as 'individual' | 'business',
    gst_number: '',
    industry: '',
    website: '',
    size: '1-10',
    location: '',
    description: '',
  });
  const [gstError, setGstError] = useState<string | null>(null);

  // Account form state
  const [accountData, setAccountData] = useState({
    name: '',
    email: '',
  });

  // ── Edit Profile (name) state ──
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  // When the display name was last changed (profiles.name_changed_at) — used to
  // enforce the 30-day name-change lock for security.
  const [nameChangedAt, setNameChangedAt] = useState<string | null>(null);
  const nameLock = getNameChangeLock(nameChangedAt);

  // ── Change Email state ──
  const [newEmail, setNewEmail] = useState('');
  const [changeEmailLoading, setChangeEmailLoading] = useState(false);
  const [emailChangeSent, setEmailChangeSent] = useState(false);

  // ── Invite User state ──
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'freelancer' | 'client'>('freelancer');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [inviteResendingId, setInviteResendingId] = useState<string | null>(null);
  const [inviteCancellingId, setInviteCancellingId] = useState<string | null>(null);

  // ── Reauth state (change password / change email / disable 2FA / delete payment) ──
  const [reauthOpen, setReauthOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'password' | 'email' | 'disable2fa' | 'deletePayment' | null>(null);
  const [pendingPaymentMethodId, setPendingPaymentMethodId] = useState<string | null>(null);
  const [signOutOthers, setSignOutOthers] = useState(false);

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
  const [confirmDisable2FA, setConfirmDisable2FA] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Email verification state ──
  const [emailVerified, setEmailVerified] = useState(false);
  const [checkingEmailVerification, setCheckingEmailVerification] = useState(true);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);

  useEffect(() => {
    async function checkEmailVerified() {
      try {
        const { data } = await supabase.auth.getUser();
        setEmailVerified(!!data?.user?.email_confirmed_at);
      } catch {
        setEmailVerified(false);
      } finally {
        setCheckingEmailVerification(false);
      }
    }
    checkEmailVerified();
  }, []);

  // Send a fresh verification email (OAuth users with unconfirmed email can
  // verify later from here — the app never blocks them from the dashboard).
  const handleSendVerificationEmail = async () => {
    setSendingVerification(true);
    setVerificationMessage(null);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: accountData.email,
        options: {
          // 🎯 Confirm link lands on EmailConfirmPage ("close this window")
          // NO ?type= query — see VerifyEmailPage resend (query suffix breaks
          // the GoTrue allowlist glob → homepage flash; type arrives in fragment).
          emailRedirectTo: `${window.location.origin}/auth/email-confirm`,
        },
      });
      if (error) {
        // Supabase User (not the app's AuthUser) carries app_metadata — fetch
        // it fresh so OAuth users get a recovery hint instead of a raw error.
        const { data: meta } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
        const provider = meta?.user?.app_metadata?.provider as string | undefined;
        const oauthHint =
          provider === 'github' || provider === 'linkedin_oidc'
            ? ` If you signed up with ${provider === 'github' ? 'GitHub' : 'LinkedIn'}, make sure your email is public/verified on the provider, or use Sign up with email instead.`
            : '';
        setVerificationMessage(`Could not send verification email: ${error.message}${oauthHint}`);
      } else {
        setVerificationMessage('Verification email sent! Check your inbox (and spam folder).');
      }
    } catch {
      setVerificationMessage('Failed to send verification email. Please try again.');
    } finally {
      setSendingVerification(false);
    }
  };

  // ── Billing / Payment Methods state ──
  const [savedCards, setSavedCards] = useState<SavedPaymentCard[]>([]);
  const [billingOrders, setBillingOrders] = useState<BillingOrder[]>([]);
  const [billingLoading, setBillingLoading] = useState(false);
  const [addingCard, setAddingCard] = useState(false);
  const [deleteCardConfirmId, setDeleteCardConfirmId] = useState<string | null>(null);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);

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
      // 🔄 Keep profiles.avatar in sync so the header icon clears too
      await supabase.from('profiles').update({ avatar: null, updated_at: new Date().toISOString() } as any).eq('id', user?.id);
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
        setNameChangedAt((profileResp as any).name_changed_at || null);
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
          account_type: (clientResp as { account_type?: string }).account_type === 'business' ? 'business' : 'individual',
          gst_number: (clientResp as { gst_number?: string | null }).gst_number || '',
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
            account_type: (payload.new as { account_type?: string }).account_type === 'business' ? 'business' : 'individual',
            gst_number: (payload.new as { gst_number?: string | null }).gst_number || '',
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
    setGstError(null);

    // Business validation: company name required + GSTIN must be valid if provided
    if (companyData.account_type === 'business') {
      if (!companyData.company_name.trim()) {
        setSaving(false);
        setErrorMessage('Company name is required for business accounts.');
        return;
      }
      const gstCheck = validateOptionalGstin(companyData.gst_number);
      if (!gstCheck.valid) {
        setSaving(false);
        setGstError(gstCheck.error || 'Invalid GSTIN');
        return;
      }
    }

    try {
      const { error } = await supabase
        .from('client_profiles')
        .upsert({
          user_id: user?.id,
          company_name: companyData.account_type === 'business' ? companyData.company_name : null,
          account_type: companyData.account_type,
          gst_number: companyData.account_type === 'business' ? (companyData.gst_number || null) : null,
          industry: companyData.industry,
          website: companyData.website,
          size: companyData.size,
          location: companyData.location,
          description: companyData.description,
          updated_at: new Date().toISOString(),
          // 🐛 FIX: upsert must target the UNIQUE user_id column — without
          // onConflict, the primary key (id) is used, so every save after the
          // first INSERTs a new row with a fresh id and violates
          // client_profiles_user_id_key (duplicate user_id) → the save always
          // failed with "Failed to save profile" once the row existed.
        } as any, { onConflict: 'user_id' });

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
    setErrorMessage(null);
    setSuccessMessage(null);

    if (securityData.newPassword !== securityData.confirmPassword) {
      setErrorMessage('New passwords do not match');
      return;
    }

    if (securityData.newPassword.length < 8) {
      setErrorMessage('Password must be at least 8 characters');
      return;
    }

    // 🛡️ Reauthentication gate — verify identity (password or OTP) first,
    // valid for a 10-minute window.
    if (!isReauthValid()) {
      setPendingAction('password');
      setReauthOpen(true);
      return;
    }

    await performPasswordChange();
  };

  const performPasswordChange = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: securityData.newPassword,
      });

      if (error) throw error;

      // 🆕 Optional: sign out all other sessions except this one
      if (signOutOthers) {
        await supabase.auth.signOut({ scope: 'others' }).catch(() => {});
      }

      setSuccessMessage(signOutOthers
        ? 'Password changed and all other sessions signed out!' 
        : 'Password changed successfully!');
      setSecurityData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        showCurrentPassword: false,
        showNewPassword: false,
      });
      setSignOutOthers(false);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Error changing password:', error);
      setErrorMessage('Failed to change password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Change Email handler ──
  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setChangeEmailLoading(true);

    const normalized = newEmail.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      setChangeEmailLoading(false);
      return;
    }
    if (normalized === accountData.email.toLowerCase()) {
      setErrorMessage('This is already your current email address.');
      setChangeEmailLoading(false);
      return;
    }

    // 🛡️ Reauthentication gate for sensitive email change
    if (!isReauthValid()) {
      setPendingAction('email');
      setReauthOpen(true);
      setChangeEmailLoading(false);
      return;
    }

    await performEmailChange(normalized);
  };

  const performEmailChange = async (normalized: string) => {
    try {
      const { error } = await supabase.auth.updateUser(
        // NO ?type= query — GoTrue appends type=email_change to the URL
        // fragment itself; AuthCallbackPage reads it from the hash. A query
        // suffix would break the allowlist glob match (homepage flash).
        { email: normalized },
        { emailRedirectTo: `${window.location.origin}/auth/callback` }
      );

      if (error) throw error;

      setEmailChangeSent(true);
      setSuccessMessage(
        'A confirmation email has been sent to your new address. Click the link in it to finish changing your email.'
      );
      setTimeout(() => setSuccessMessage(null), 6000);
    } catch (error) {
      console.error('Error changing email:', error);
      setErrorMessage(error instanceof Error && error.message.includes('already')
        ? 'This email is already registered to another account.'
        : 'Failed to send email confirmation. Please try again.');
    } finally {
      setChangeEmailLoading(false);
    }
  };

  // ── Edit Profile (name) handler ──
  const startEditName = () => {
    if (nameLock.locked) {
      setErrorMessage(`Your name is locked for security. You can change it on ${nameLock.unlockDate}.`);
      return;
    }
    setNameDraft(accountData.name || '');
    setErrorMessage(null);
    setEditingName(true);
  };

  const cancelEditName = () => {
    setEditingName(false);
    setNameDraft('');
    setErrorMessage(null);
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setErrorMessage('Name cannot be empty.');
      return;
    }
    setSavingName(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    // 30-day name-change lock: reject edits while the lock is active.
    if (nameLock.locked && trimmed !== accountData.name) {
      setSavingName(false);
      setErrorMessage(`Your name is locked for security. You can change it on ${nameLock.unlockDate}.`);
      return;
    }
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ name: trimmed, updated_at: new Date().toISOString() } as any)
        .eq('id', user?.id);
      if (error) throw error;
      setAccountData((prev) => ({ ...prev, name: trimmed }));
      setEditingName(false);
      setNameDraft('');
      // AuthContext listens to profiles realtime updates, so the header syncs automatically.
      setSuccessMessage('Profile name updated!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Error saving name:', err);
      setErrorMessage('Failed to update name. Please try again.');
    } finally {
      setSavingName(false);
    }
  };

  // ── Invite User handlers ──
  const loadInvitations = useCallback(async () => {
    if (!user?.id) return;
    const list = await inviteService.listInvitations(user.id);
    setInvitations(list);
  }, [user?.id]);

  useEffect(() => {
    if (activeTab !== 'account' || !user?.id) return;
    loadInvitations();
    const sub = inviteService.subscribe(user.id, setInvitations);
    return () => sub.unsubscribe();
  }, [activeTab, user?.id, loadInvitations]);

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setInviteLoading(true);

    if (!user?.id) {
      setErrorMessage('You must be signed in to invite someone.');
      setInviteLoading(false);
      return;
    }

    const result = await inviteService.createInvitation(user.id, inviteEmail, inviteRole);

    if (!result.success) {
      setErrorMessage(result.error || 'Failed to send invitation.');
      setInviteLoading(false);
      return;
    }

    setInviteEmail('');
    setSuccessMessage(`Invitation sent to ${inviteEmail.trim().toLowerCase()}! They'll receive an email to join.`);
    setTimeout(() => setSuccessMessage(null), 4000);
    await loadInvitations();
    setInviteLoading(false);
  };

  const handleResendInvite = async (invitationId: string) => {
    setInviteResendingId(invitationId);
    setErrorMessage(null);
    const result = await inviteService.resendInvitation(invitationId);
    setInviteResendingId(null);
    if (!result.success) {
      setErrorMessage(result.error || 'Failed to resend invitation.');
      return;
    }
    setSuccessMessage('Invitation email resent!');
    setTimeout(() => setSuccessMessage(null), 3000);
    await loadInvitations();
  };

  const handleCancelInvite = async (invitationId: string) => {
    if (!confirm('Cancel this invitation? The invited person will no longer be able to join.')) return;
    setInviteCancellingId(invitationId);
    setErrorMessage(null);
    const result = await inviteService.cancelInvitation(invitationId);
    setInviteCancellingId(null);
    if (!result.success) {
      setErrorMessage(result.error || 'Failed to cancel invitation.');
      return;
    }
    setSuccessMessage('Invitation cancelled.');
    setTimeout(() => setSuccessMessage(null), 3000);
    await loadInvitations();
  };

  const handleReauthVerified = async () => {
    markReauthVerified();
    setReauthOpen(false);
    if (pendingAction === 'password') {
      await performPasswordChange();
    } else if (pendingAction === 'email') {
      await performEmailChange(newEmail.trim().toLowerCase());
    } else if (pendingAction === 'disable2fa') {
      // Show the code input — 2FA disable needs the current TOTP code,
      // which must be entered by the user (never runs with an empty code).
      setConfirmDisable2FA(true);
    } else if (pendingAction === 'deletePayment' && pendingPaymentMethodId) {
      await performDeleteSavedCard(pendingPaymentMethodId);
    }
    setPendingAction(null);
    setPendingPaymentMethodId(null);
  };

  const inviteStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-amber-50 text-amber-700 border-amber-200',
      accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      expired: 'bg-slate-50 text-slate-500 border-slate-200',
      cancelled: 'bg-red-50 text-red-600 border-red-200',
    };
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status] || styles.pending}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const inviteStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted': return <Check className="w-4 h-4 text-emerald-600" />;
      case 'cancelled': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'expired': return <Timer className="w-4 h-4 text-slate-400" />;
      default: return <Send className="w-4 h-4 text-amber-500" />;
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
    // 🛡️ Reauthentication gate — disabling 2FA is a sensitive action
    if (!isReauthValid()) {
      setPendingAction('disable2fa');
      setReauthOpen(true);
      return;
    }
    // Ask for the current 6-digit code — verified server-side before disabling.
    setConfirmDisable2FA(true);
  };

  const performDisable2FA = async () => {
    if (!twoFactorCode || twoFactorCode.length !== 6) {
      setErrorMessage('Please enter your current 6-digit code to disable 2FA.');
      return;
    }
    setTwoFactorLoading(true);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('twofa-management', {
        body: { action: 'disable', code: twoFactorCode },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setTwoFactorEnabled(false);
      setConfirmDisable2FA(false);
      setTwoFactorCode('');
      setSuccessMessage('Two-factor authentication disabled.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      console.error('Error disabling 2FA:', error);
      setErrorMessage('Failed to disable 2FA. Enter your current authenticator code.');
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
      const authResult = await supabase.auth.getSession();
      const session = authResult.data?.session ?? null;
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
        await supabase.auth.signOut().catch(() => {});
        clearSupabaseAuthStorage();
        window.location.href = '/';
      }, 1500);
    } catch (err: any) {
      console.error('[delete-account]', err);
      setErrorMessage(err?.message || 'Failed to delete account. Please contact support.');
      setDeletionStep('confirm');
    }
  };

  // ── Billing / Payment Methods Handlers ──
  const fetchSavedCards = useCallback(async () => {
    if (!user?.id) return;
    try {
      const cards = await razorpayService.getSavedCards();
      setSavedCards(cards);
    } catch { /* card fetch is best-effort */ }
  }, [user?.id]);

  const fetchBillingOrders = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('razorpay_orders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!error && data) {
        setBillingOrders(data as BillingOrder[]);
      }
    } catch { /* order fetch is best-effort */ }
  }, [user?.id]);

  // Load billing data + keep it real-time while the billing tab is active
  useEffect(() => {
    if (activeTab !== 'billing' || !user?.id) return;

    setBillingLoading(true);
    void Promise.all([fetchSavedCards(), fetchBillingOrders()]).finally(() => setBillingLoading(false));

    const cardsChannel = realtimeChannels.savedPaymentCards(`client-billing-cards-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'saved_payment_cards', filter: `user_id=eq.${user.id}` },
        () => { void fetchSavedCards(); }
      )
      .subscribe();

    const ordersChannel = realtimeChannels.razorpayOrders(`client-billing-orders-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'razorpay_orders', filter: `user_id=eq.${user.id}` },
        () => { void fetchBillingOrders(); }
      )
      .subscribe();

    return () => {
      cardsChannel.unsubscribe();
      ordersChannel.unsubscribe();
    };
  }, [activeTab, user?.id, fetchSavedCards, fetchBillingOrders]);

  // Add a card via Razorpay tokenization — a ₹1 verification order is created
  // server-side (the amount is never trusted from the client), the card is
  // tokenized inside the checkout, and the ₹1 is auto-refunded afterwards.
  const handleAddCard = async () => {
    if (!user) return;
    setAddingCard(true);
    setErrorMessage(null);
    try {
      const { order, razorpay_key_id, currency } = await razorpayService.createOrder({
        order_type: 'card_verification',
        amount: 1,
        currency: 'INR',
        description: 'Card verification for one-click payments',
      });

      await razorpayService.openCheckout({
        key: razorpay_key_id,
        amount: 100, // ₹1 in paise
        currency,
        name: 'Growlancer',
        description: `Card verification — ${formatCurrency(1)} will be refunded`,
        order_id: order.razorpay_order_id,
        prefill: { name: user.name || '', email: user.email || '' },
        theme: { color: '#059669' },
        card: { save: true },
        handler: async (response) => {
          // Server-side signature verification
          await razorpayService.verifyPayment(response);

          // Store the tokenized card (Razorpay returns card details in the handler)
          const card = (response as any).card;
          if (card?.id && card?.last4) {
            try {
              await razorpayService.saveCard({
                razorpay_payment_id: response.razorpay_payment_id,
                card_id: card.id,
                card_last_four: card.last4,
                card_type: card.type || null,
                card_network: card.network || null,
                card_expiry_month: card.expiry_month?.toString() || null,
                card_expiry_year: card.expiry_year?.toString() || null,
                card_holder_name: card.name || null,
              });
            } catch { /* card saving is best-effort */ }
          }

          // Auto-refund the ₹1 verification charge (best-effort)
          try {
            await razorpayService.refundPayment(response.razorpay_payment_id, 1);
          } catch { /* refund is best-effort */ }

          setSuccessMessage(`Card added — ${formatCurrency(1)} verification charge refunded.`);
          setTimeout(() => setSuccessMessage(null), 4000);
          await fetchSavedCards();
          await fetchBillingOrders();
        },
        modal: {
          ondismiss: () => { setAddingCard(false); },
          confirm_close: true,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add card.';
      // Dismissing the Razorpay modal is a deliberate cancel — not an error.
      if (!msg.toLowerCase().includes('cancelled') && !msg.toLowerCase().includes('dismiss')) {
        setErrorMessage(msg);
      }
    } finally {
      setAddingCard(false);
    }
  };

  const handleDeleteSavedCard = async (cardId: string) => {
    // 🛡️ Reauthentication gate — removing a saved card is a sensitive action
    if (!isReauthValid()) {
      setPendingPaymentMethodId(cardId);
      setPendingAction('deletePayment');
      setReauthOpen(true);
      return;
    }
    await performDeleteSavedCard(cardId);
  };

  const performDeleteSavedCard = async (cardId: string) => {
    setDeletingCardId(cardId);
    try {
      await razorpayService.deleteSavedCard(cardId);
      setSuccessMessage('Saved card removed.');
      setTimeout(() => setSuccessMessage(null), 3000);
      setDeleteCardConfirmId(null);
      await fetchSavedCards();
    } catch (err) {
      console.error('Error removing saved card:', err);
      setErrorMessage('Failed to remove saved card.');
    } finally {
      setDeletingCardId(null);
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

      {/* Email verification recommendation — industry-standard: nudge unverified
          users to confirm their email; hidden automatically once confirmed */}
      <EmailVerificationBanner />

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
                  {/* Account type */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Account Type</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setCompanyData({ ...companyData, account_type: 'individual' })}
                        className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${
                          companyData.account_type === 'individual'
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <User className="w-4 h-4" /> Individual
                      </button>
                      <button
                        type="button"
                        onClick={() => setCompanyData({ ...companyData, account_type: 'business' })}
                        className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${
                          companyData.account_type === 'business'
                            ? 'border-violet-500 bg-violet-50 text-violet-700 ring-2 ring-violet-200'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <Building2 className="w-4 h-4" /> Business
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                      {companyData.account_type === 'business'
                        ? 'Companies post projects with their company name — GST number appears on invoices.'
                        : 'Individual accounts hire with their personal name.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        {companyData.account_type === 'business' ? 'Company Name *' : 'Company / Brand Name (optional)'}
                      </label>
                      <input type="text" value={companyData.company_name} onChange={(e) => setCompanyData({ ...companyData, company_name: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all" placeholder="Your company name" />
                    </div>
                    {companyData.account_type === 'business' && (
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">GST Number</label>
                        <input
                          type="text"
                          value={companyData.gst_number}
                          onChange={(e) => {
                            const raw = e.target.value.toUpperCase();
                            setCompanyData({ ...companyData, gst_number: raw });
                            const check = validateOptionalGstin(raw);
                            setGstError(check.valid ? null : check.error || null);
                          }}
                          placeholder="e.g. 27AABCS1234F1Z5"
                          maxLength={15}
                          className={`w-full px-4 py-3 rounded-xl border outline-none transition-all font-mono tracking-wider ${
                            gstError
                              ? 'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-200'
                              : 'border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200'
                          }`}
                        />
                        {gstError ? (
                          <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" /> {gstError}
                          </p>
                        ) : companyData.gst_number ? (
                          <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
                            <CheckCircle className="w-3.5 h-3.5" /> Valid GSTIN format
                          </p>
                        ) : (
                          <p className="text-xs text-slate-400 mt-1.5">
                            Optional — business invoices show your GST number. {normalizeGstin(companyData.gst_number) && 'Note: GSTIN is 15 characters.'}
                          </p>
                        )}
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Industry</label>
                      <IndustrySelect
                        value={companyData.industry}
                        onChange={(ind) => setCompanyData({ ...companyData, industry: ind })}
                        placeholder="Select your industry..."
                      />
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
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
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
                    <div className="flex items-center gap-2">
                      {checkingEmailVerification ? (
                        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                      ) : emailVerified ? (
                        <span className="flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium">
                          <Check className="w-3.5 h-3.5" /> Verified
                        </span>
                      ) : (
                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2">
                          <span className="flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium">
                            <AlertCircle className="w-3.5 h-3.5" /> Not Verified
                          </span>
                          <button
                            onClick={handleSendVerificationEmail}
                            disabled={sendingVerification}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                          >
                            {sendingVerification ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5" />
                            )}
                            {sendingVerification ? 'Sending...' : 'Verify Email'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {verificationMessage && (
                    <p className={`text-xs mt-2 ${verificationMessage.includes('Could not') || verificationMessage.includes('Failed') ? 'text-red-500' : 'text-emerald-600'}`}>
                      {verificationMessage}
                    </p>
                  )}
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-slate-400" />
                      <div>
                        <p className="text-sm text-slate-500">Full Name</p>
                        {editingName ? (
                          <form onSubmit={handleSaveName} className="mt-1 flex items-center gap-2">
                            <input
                              type="text"
                              value={nameDraft}
                              onChange={(e) => setNameDraft(e.target.value)}
                              autoFocus
                              maxLength={60}
                              className="w-full sm:w-64 min-w-0 px-3 py-2 rounded-lg border border-emerald-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none text-sm font-medium text-slate-900"
                            />
                            <button
                              type="submit"
                              disabled={savingName}
                              className="inline-flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                            >
                              {savingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditName}
                              className="inline-flex items-center gap-1 px-3 py-2 bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-300 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                              Cancel
                            </button>
                          </form>
                        ) : (
                          <p className="font-medium text-slate-900 flex flex-wrap items-center gap-2">
                            {accountData.name || '—'}
                            {nameLock.locked ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg">
                                <Lock className="w-3 h-3" /> Locked till {nameLock.unlockDate}
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={startEditName}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                              >
                                <User className="w-3 h-3" /> Edit Profile
                              </button>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Change Email Address ── */}
              <div className="bg-white p-6 rounded-2xl border border-slate-100">
                <h2 className="font-display text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
                  <Mail className="w-5 h-5 text-emerald-600" /> Change Email Address
                </h2>
                <p className="text-sm text-slate-500 mb-5">
                  We'll send a confirmation link to your new address. Your email won't change until you confirm it.
                </p>

                {emailChangeSent ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-emerald-700">
                      A confirmation email has been sent to <strong className="text-emerald-800">{newEmail}</strong>.
                      Click the link in it to finish changing your email.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleChangeEmail} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">New Email Address</label>
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="you@newcompany.com"
                        autoComplete="email"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={changeEmailLoading}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {changeEmailLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" /> Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-5 h-5" /> Send Confirmation
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>

              {/* ── Invite User ── */}
              <div className="bg-white p-6 rounded-2xl border border-slate-100">
                <h2 className="font-display text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-emerald-600" /> Invite User
                </h2>
                <p className="text-sm text-slate-500 mb-5">
                  Invite a freelancer or client to join Growlancer. They'll receive an email with a secure invite link.
                </p>

                <form onSubmit={handleInviteUser} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="colleague@company.com"
                        autoComplete="off"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as 'freelancer' | 'client')}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all bg-white"
                      >
                        <option value="freelancer">Freelancer</option>
                        <option value="client">Client</option>
                      </select>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={inviteLoading}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {inviteLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" /> Sending invitation...
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-5 h-5" /> Send Invitation
                      </>
                    )}
                  </button>
                </form>

                {/* Invitations List — real-time status */}
                {invitations.length > 0 && (
                  <div className="mt-6 pt-5 border-t border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">Sent Invitations</h3>
                    <div className="space-y-3">
                      {invitations.map((inv) => (
                        <div key={inv.id} className="flex items-center justify-between gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
                              {inviteStatusIcon(inv.status)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900 text-sm truncate">{inv.email}</p>
                              <p className="text-xs text-slate-500 capitalize">
                                {inv.role} · Invited {new Date(inv.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {inviteStatusBadge(inv.status)}
                            {inv.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleResendInvite(inv.id)}
                                  disabled={inviteResendingId === inv.id}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-600 bg-white border border-emerald-200 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                                >
                                  {inviteResendingId === inv.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <RefreshCw className="w-3.5 h-3.5" />
                                  )}
                                  Resend
                                </button>
                                <button
                                  onClick={() => handleCancelInvite(inv.id)}
                                  disabled={inviteCancellingId === inv.id}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-600 bg-white border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  Cancel
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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
                  <label className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl cursor-pointer">
                    <input
                      type="checkbox"
                      checked={signOutOthers}
                      onChange={(e) => setSignOutOthers(e.target.checked)}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 cursor-pointer"
                    />
                    <div>
                      <p className="font-medium text-slate-900 text-sm">Sign out all other sessions</p>
                      <p className="text-xs text-slate-500">Log out every other device after the password change</p>
                    </div>
                  </label>
                  <button type="submit" disabled={saving} className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
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
                        {!confirmDisable2FA ? (
                          <button onClick={handleDisable2FA} disabled={twoFactorLoading}
                            className="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-xl hover:bg-red-50 transition-colors">Disable</button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <input
                              value={twoFactorCode}
                              onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                              placeholder="6-digit code"
                              maxLength={6}
                              inputMode="numeric"
                              autoFocus
                              className="w-28 px-3 py-2 text-sm text-center font-mono border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                            />
                            <button onClick={() => void performDisable2FA()} disabled={twoFactorLoading}
                              className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50">
                              {twoFactorLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
                            </button>
                            <button onClick={() => { setConfirmDisable2FA(false); setTwoFactorCode(''); }}
                              className="px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button onClick={handleSetup2FA} disabled={twoFactorLoading}
                        className="flex items-center gap-2 inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50">
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
                          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
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
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
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
                      className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
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
                  <button
                    onClick={handleAddCard}
                    disabled={addingCard}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    {addingCard ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {addingCard ? 'Adding...' : 'Add Card'}
                  </button>
                </div>

                {billingLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>
                ) : savedCards.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {savedCards.map((card) => (
                      <div key={card.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:border-emerald-300 transition-all">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <CreditCard className="w-5 h-5 text-emerald-600" />
                            <div>
                              <span className="font-medium text-slate-900 text-sm">
                                {card.card_network || 'Card'} •••• {card.card_last_four}
                              </span>
                              <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium uppercase">
                                {card.card_type || 'Card'}
                              </span>
                            </div>
                          </div>
                          {deleteCardConfirmId === card.card_id ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => handleDeleteSavedCard(card.card_id)} disabled={deletingCardId === card.card_id} className="p-1.5 text-red-500 hover:text-red-700 transition-colors" title="Confirm remove">
                                {deletingCardId === card.card_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                              </button>
                              <button onClick={() => setDeleteCardConfirmId(null)} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors" title="Cancel"><X className="w-4 h-4" /></button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteCardConfirmId(card.card_id)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors" title="Remove saved card"><Trash2 className="w-4 h-4" /></button>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 space-y-0.5">
                          {card.card_expiry_month && card.card_expiry_year && (
                            <p>Expires {card.card_expiry_month}/{card.card_expiry_year}</p>
                          )}
                          {card.card_holder_name && <p>{card.card_holder_name}</p>}
                          {card.last_used_at && (
                            <p>Last used {new Date(card.last_used_at).toLocaleDateString()}</p>
                          )}
                        </div>
                        <div className="mt-3 p-2 bg-emerald-50 rounded-lg border border-emerald-100">
                          <p className="text-[10px] text-emerald-700 font-medium flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> Tokenized via Razorpay — one-click payments enabled
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <CreditCard className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                    <p>No saved cards yet.</p>
                    <p className="text-sm mt-1">Add a card for fast, one-click escrow payments — or pay anytime with UPI / Net Banking at checkout.</p>
                  </div>
                )}
              </div>

              {/* Other payment methods — UPI / Net Banking / Wallets at Razorpay checkout */}
              <div className="bg-white p-6 rounded-2xl border border-slate-100">
                <h3 className="font-display text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-emerald-600" /> Other Payment Methods
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Choose any of these when you fund escrow or pay at checkout — powered by Razorpay. No setup needed.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:border-emerald-300 transition-all">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Smartphone className="w-4 h-4 text-emerald-600" />
                      <span className="font-medium text-slate-900 text-sm">UPI</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">GPay, PhonePe, Paytm & all UPI apps. Instant, zero-fee for you.</p>
                    <span className="inline-flex mt-2 items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" /> Available at checkout</span>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:border-emerald-300 transition-all">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Landmark className="w-4 h-4 text-emerald-600" />
                      <span className="font-medium text-slate-900 text-sm">Net Banking</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">All major Indian banks — HDFC, SBI, ICICI, Axis & more.</p>
                    <span className="inline-flex mt-2 items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" /> Available at checkout</span>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:border-emerald-300 transition-all">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Wallet className="w-4 h-4 text-emerald-600" />
                      <span className="font-medium text-slate-900 text-sm">Wallets</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">Paytm Wallet, Amazon Pay, Mobikwik & other prepaid wallets.</p>
                    <span className="inline-flex mt-2 items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" /> Available at checkout</span>
                  </div>
                </div>
              </div>

              {/* PayPal — coming soon (payment methods are Razorpay-tokenized cards above) */}
              <div className="p-4 rounded-xl border border-dashed border-slate-200 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-4 h-4 text-blue-500" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-slate-700 text-sm flex items-center gap-2">
                    PayPal <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-semibold uppercase">Coming Soon</span>
                  </p>
                  <p className="text-xs text-slate-400">International payments will be available soon.</p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-100">
                <h3 className="font-display text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-emerald-600" /> Billing History
                </h3>
                {billingLoading ? (
                  <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-emerald-600" /></div>
                ) : billingOrders.length > 0 ? (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {billingOrders.map((order) => (
                      <div key={order.id} className="flex items-center gap-4 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                        <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                          {order.order_type === 'contract_escrow'
                            ? <Shield className="w-4 h-4 text-emerald-600" />
                            : <CreditCard className="w-4 h-4 text-emerald-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 text-sm truncate">{orderTypeLabel(order.order_type)}</p>
                          <p className="text-xs text-slate-500 truncate">
                            {order.description || 'Razorpay payment'} ·{' '}
                            {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-semibold text-slate-900 text-sm">{formatCurrency(order.amount)}</p>
                          <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase ${orderStatusStyles[order.status] || orderStatusStyles.created}`}>
                            {order.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    <Receipt className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                    <p>No payments yet.</p>
                    <p className="text-sm mt-1">Your escrow and subscription payments will appear here in real time.</p>
                  </div>
                )}
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

      {/* ── Reauthentication Dialog (password / OTP, 10-min window) ── */}
      <ReauthDialog
        open={reauthOpen}
        onClose={() => setReauthOpen(false)}
        onVerified={handleReauthVerified}
        title="Confirm your identity"
        description="For your security, please verify your identity before changing sensitive account details. Your session stays verified for 10 minutes."
      />
    </div>
  );
}
