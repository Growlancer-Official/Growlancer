-- ============================================================================
-- Auto-clean all user data when the user is deleted from Supabase Auth.
--
-- When you delete a user from the Supabase dashboard (Auth → Users → Delete),
-- it only removes the `auth.users` row — public tables (profiles, wallet,
-- contracts, proposals, etc.) are left orphaned, which pollutes testing and
-- references. This trigger reuses the existing `delete_user_all_data` RPC to
-- wipe everything the user owned on ANY auth.users delete.
--
-- Recursion: delete_user_all_data also deletes from auth.users (last step).
-- An AFTER DELETE trigger runs after the row is already gone, so that inner
-- delete matches 0 rows → no trigger re-fire. A session-scoped flag is added
-- as belt-and-suspenders for any other caller.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_user_deleted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard against recursion if delete_user_all_data's own auth.users delete
  -- re-enters this trigger.
  IF current_setting('app.user_delete_in_progress', true) = '1' THEN
    RETURN OLD;
  END IF;

  PERFORM set_config('app.user_delete_in_progress', '1', true); -- txn-scoped
  PERFORM public.delete_user_all_data(OLD.id);
  PERFORM set_config('app.user_delete_in_progress', '0', true);
  RETURN OLD;
END;
$$;

-- Trigger functions are called as the table owner; lock down direct calls.
REVOKE ALL ON FUNCTION public.handle_user_deleted() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_user_deleted();