import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function DebugPage() {
  const [status, setStatus] = useState<string>('Checking...');
  const [error, setError] = useState<string | null>(null);
  const [envVars, setEnvVars] = useState<{url: string, key: string}>({url: '', key: ''});

  useEffect(() => {
    async function checkConnection() {
      try {
        // Check env vars
        const url = import.meta.env.VITE_SUPABASE_URL;
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
        setEnvVars({
          url: url ? '✅ Set' : '❌ Missing',
          key: key ? '✅ Set' : '❌ Missing'
        });

        if (!url || !key) {
          setStatus('❌ Missing environment variables');
          return;
        }

        // Try to get session
        setStatus('🔍 Checking Supabase connection...');
        const { data, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          setStatus('❌ Session error');
          setError(sessionError.message);
          return;
        }

        if (data.session) {
          setStatus('✅ Connected - Session found');
          
          // Check profile
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.session.user.id)
            .single();
          
          if (profileError) {
            setError(`Profile error: ${profileError.message}`);
          } else if (profile) {
            setStatus(`✅ Connected - Profile: ${profile.name}`);
          } else {
            setError('No profile found for this user');
          }
        } else {
          setStatus('✅ Connected - No session (logged out)');
        }
      } catch (err) {
        setStatus('❌ Connection failed');
        setError(err instanceof Error ? err.message : String(err));
      }
    }

    checkConnection();
  }, []);

  return (
    <div className="min-h-screen bg-cream p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Debug Page</h1>
        
        <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
          <h2 className="font-bold mb-4">Environment Variables</h2>
          <p>VITE_SUPABASE_URL: {envVars.url}</p>
          <p>VITE_SUPABASE_ANON_KEY: {envVars.key}</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm mb-6">
          <h2 className="font-bold mb-4">Connection Status</h2>
          <p className="text-lg">{status}</p>
          {error && (
            <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-xl">
              <p className="font-bold">Error:</p>
              <p>{error}</p>
            </div>
          )}
        </div>

        {envVars.url === '✅ Set' && envVars.key === '✅ Set' && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
            <p className="text-sm text-slate-600">
              All environment variables are configured. Sign in through the normal login flow to test authentication.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
