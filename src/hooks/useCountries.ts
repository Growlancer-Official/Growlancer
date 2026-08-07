import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

let channelInstanceId = 0;

export interface Country {
  id: string;
  name: string;
  code: string;
}

interface UseCountriesReturn {
  countries: Country[];
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Real-time country list from the `countries` table (197 countries).
 * Powers the waitlist country dropdown and any future country-based features.
 */
export function useCountries(): UseCountriesReturn {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      // `countries` is not yet in the generated Database types — cast the
      // builder so the live table stays usable (same pattern as useIndustries).
      const { data, error } = await (supabase.from as any)('countries')
        .select('id, name, code')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (!error && data) {
        setCountries((data as unknown as Country[]).sort((a, b) => a.name.localeCompare(b.name)));
      } else if (error) {
        console.warn('Countries query failed:', error.message);
      }
    } catch (err) {
      console.warn('Error fetching countries (non-critical):', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const instanceId = ++channelInstanceId;
    const channel = supabase
      .channel(`countries-realtime-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'countries' },
        () => { fetchAll(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchAll]);

  return { countries, loading, refresh: fetchAll };
}
