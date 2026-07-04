import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { createClient, PostgrestError } from "@supabase/supabase-js";

// Cache the client instance
let client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
  }
  client = createClient(url, key);
  return client;
}

export default defineTool({
  description:
    "Query the Growlancer Supabase database. Read-only — no inserts, updates, or deletes. Use this to look up users, projects, contracts, and other platform data via structured query parameters.",
  inputSchema: z.object({
    table: z
      .string()
      .min(1)
      .describe("The table to query. Examples: profiles, projects, contracts, proposals, escrow, transactions, notifications, wallets"),
    select: z
      .string()
      .optional()
      .default("*")
      .describe("Columns to select, comma-separated. Example: 'id, full_name, email, created_at'"),
    filters: z
      .array(
        z.object({
          column: z.string(),
          operator: z
            .enum(["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "contains", "overlaps"])
            .default("eq"),
          value: z.any(),
        })
      )
      .optional()
      .describe("Filters to apply (AND logic). For 'is' operator, use null for IS NULL checks. For 'in', pass an array."),
    orderBy: z
      .object({
        column: z.string(),
        ascending: z.boolean().optional().default(false),
      })
      .optional()
      .describe("Sort column and direction"),
    limit: z.number().min(1).max(500).optional().default(50).describe("Max rows to return"),
    single: z.boolean().optional().default(false).describe("If true, return a single row. Returns null if not found."),
  }),
  approval: always(),
  async execute(input) {
    try {
      const supabase = getClient();
      let query = supabase.from(input.table as any).select(input.select);

      // Apply filters
      if (input.filters) {
        for (const f of input.filters) {
          // Deserialize special values from JSON
          const val = f.value;

          if (f.operator === "in") {
            if (!Array.isArray(val)) {
              return { success: false, error: `'in' operator requires an array value, got ${typeof val}` };
            }
            (query as any) = query.in(f.column, val);
          } else if (f.operator === "is") {
            (query as any) = query.is(f.column, val);
          } else if (f.operator === "contains") {
            (query as any) = query.contains(f.column, val);
          } else if (f.operator === "overlaps") {
            (query as any) = query.overlaps(f.column, val);
          } else {
            (query as any) = query[f.operator](f.column, val);
          }
        }
      }

      // Apply ordering
      if (input.orderBy) {
        query = query.order(input.orderBy.column, { ascending: input.orderBy.ascending });
      }

      let data: unknown;
      let error: PostgrestError | null = null;

      if (input.single) {
        // For single mode, use .maybeSingle() instead of .single() to avoid PGRST116 on no-match
        query = query.limit(1);
        const result = await query.maybeSingle();
        data = result.data;
        error = result.error;
      } else {
        query = query.limit(input.limit!);
        const result = await query;
        data = result.data;
        error = result.error;
      }

      if (error) {
        return {
          success: false,
          error: error.message,
          hint: "Check the table name and columns. Common tables: profiles, freelancer_profiles, client_profiles, projects, proposals, contracts, escrow, transactions, withdrawals, wallets, notifications, messages, reviews, disputes",
        };
      }

      return {
        success: true,
        data,
        count: Array.isArray(data) ? data.length : data !== null ? 1 : 0,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  },
});
