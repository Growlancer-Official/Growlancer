/**
 * Admin Data Proxy — Helper for admin pages to fetch data via edge function
 * 
 * All admin pages use this instead of direct supabase queries because
 * RLS blocks unauthenticated requests. The edge function uses service_role
 * key internally (bypasses RLS).
 * 
 * Auth uses the standard Supabase session — supabase.functions.invoke()
 * automatically sends the Authorization: Bearer <token> header from the
 * current session, so no manual token handling is needed.
 */
import { supabase } from './supabase';

const FN = 'admin-data';

type QueryOptions = {
  table: string;
  select?: string;
  order?: string;
  orderDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  filters?: Record<string, string>;
  isNull?: Record<string, boolean>;
  gte?: Record<string, string>;
  lte?: Record<string, string>;
  in?: Record<string, string[]>;
  count?: 'exact' | 'planned';
  head?: boolean;
};

/**
 * Execute a generic query via the admin-data edge function (POST).
 * Returns { data, total }.
 */
export async function adminQuery<T = any>(options: QueryOptions): Promise<{ data: T[]; total?: number }> {
  const { data: result, error } = await supabase.functions.invoke(FN, {
    method: 'POST',
    body: {
      action: 'query',
      table: options.table,
      select: options.select || '*',
      order: options.order,
      orderDir: options.orderDir,
      limit: options.limit ?? 100,
      offset: options.offset ?? 0,
      count: options.count,
      head: options.head,
      filters: options.filters,
      isNull: options.isNull,
      gte: options.gte,
      lte: options.lte,
      in: options.in,
    },
  });

  if (error) throw error;
  return { data: (result as any)?.data || [], total: (result as any)?.total };
}

/**
 * Get counts for multiple tables at once.
 */
export async function adminCounts(tables: string[]): Promise<Record<string, number>> {
  const { data: result, error } = await supabase.functions.invoke(FN, {
    method: 'POST',
    body: { action: 'counts', tables },
  });

  if (error) throw error;
  return (result as any)?.counts || {};
}

/**
 * Update a record via the admin-data edge function.
 */
export async function adminUpdate(table: string, id: string, data: Record<string, any>, idField = 'id'): Promise<any> {
  const { data: result, error } = await supabase.functions.invoke(FN, {
    method: 'PATCH',
    body: { table, id, id_field: idField, data },
  });

  if (error) throw error;
  return (result as any)?.data;
}

/**
 * Delete a record via the admin-data edge function.
 */
export async function adminDelete(table: string, id: string, idField = 'id'): Promise<any> {
  const { data: result, error } = await supabase.functions.invoke(FN, {
    method: 'DELETE',
    body: { table, id, id_field: idField },
  });

  if (error) throw error;
  return (result as any)?.data;
}

/**
 * Insert a record via the admin-data edge function.
 */
export async function adminInsert(table: string, data: Record<string, any>): Promise<any> {
  const { data: result, error } = await supabase.functions.invoke(FN, {
    method: 'POST',
    body: { action: 'insert', table, data },
  });

  if (error) throw error;
  return (result as any)?.data;
}
