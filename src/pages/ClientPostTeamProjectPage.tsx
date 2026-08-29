import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formatCurrency, currencySymbol } from '../lib/currency';
import { teamProjectsService, type TeamRoleSuggestion } from '../lib/teamProjects';
import { ArrowRight, Loader2, Plus, Sparkles, Trash2, Users, CheckCircle2, AlertCircle } from 'lucide-react';
import { useToast } from '../components/Toast';
import { TipNote } from '../components/TipNote';

interface RoleDraft {
  key: string;
  role_title: string;
  required_skills: string;
  budget_min: string;
  budget_max: string;
  matching: boolean;
  matched: boolean;
  matchError: string | null;
  suggestions: TeamRoleSuggestion[];
}

let roleKeyCounter = 0;
const nextRoleKey = () => `role_${Date.now()}_${roleKeyCounter++}`;

export function ClientPostTeamProjectPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [totalBudgetEstimate, setTotalBudgetEstimate] = useState('');
  const [roles, setRoles] = useState<RoleDraft[]>([
    { key: nextRoleKey(), role_title: '', required_skills: '', budget_min: '', budget_max: '', matching: false, matched: false, matchError: null, suggestions: [] },
  ]);
  const [saving, setSaving] = useState(false);

  const updateRole = (key: string, patch: Partial<RoleDraft>) => {
    setRoles((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const addRole = () => {
    setRoles((prev) => [
      ...prev,
      { key: nextRoleKey(), role_title: '', required_skills: '', budget_min: '', budget_max: '', matching: false, matched: false, matchError: null, suggestions: [] },
    ]);
  };

  const removeRole = (key: string) => {
    setRoles((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  };

  // Parse a comma-separated skill string into a clean array
  const parseSkills = (raw: string): string[] =>
    raw.split(',').map((s) => s.trim()).filter(Boolean);

  // Real-time per-role AI matching — uses the SAME engine as single projects.
  const runMatchForRole = async (role: RoleDraft) => {
    const skills = parseSkills(role.required_skills);
    if (!role.role_title.trim()) {
      toast.error('Role title required', 'Give the role a name (e.g. UI/UX Designer) before matching.');
      return;
    }
    if (skills.length === 0) {
      toast.error('Skills required', 'Add at least one required skill so AI matching can find the right freelancer.');
      return;
    }
    updateRole(role.key, { matching: true, matchError: null });
    const budgetMax = role.budget_max ? Number(role.budget_max) : role.budget_min ? Number(role.budget_min) : null;
    try {
      const result = await teamProjectsService.matchRole({
        id: role.key,
        required_skills: skills,
        budget_range_max: budgetMax,
      });
      if (result.error) {
        updateRole(role.key, { matching: false, matchError: result.error });
        return;
      }
      updateRole(role.key, { matching: false, matched: true, suggestions: result.data || [] });
    } catch (err: any) {
      updateRole(role.key, { matching: false, matchError: err?.message || 'Matching failed. Please try again.' });
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Not signed in', 'Please sign in to post a team project.');
      return;
    }
    if (!title.trim()) {
      toast.error('Title required', 'Give your team project a title.');
      return;
    }
    const validRoles = roles.filter((r) => r.role_title.trim());
    if (validRoles.length === 0) {
      toast.error('At least one role required', 'Add the roles you need — e.g. Designer, Developer, Writer.');
      return;
    }
    for (const r of validRoles) {
      const min = r.budget_min ? Number(r.budget_min) : 0;
      const max = r.budget_max ? Number(r.budget_max) : 0;
      if (max > 0 && min > 0 && max < min) {
        toast.error('Budget error', `Role "${r.role_title}" max budget is below its min.`);
        return;
      }
    }

    setSaving(true);
    try {
      // 1. Create the team project
      const proj = await teamProjectsService.createProject({
        clientId: user.id,
        title: title.trim(),
        description: description.trim() || undefined,
        totalBudgetEstimate: totalBudgetEstimate ? Number(totalBudgetEstimate) : undefined,
      });
      if (proj.error || !proj.data) throw new Error(proj.error || 'Failed to create team project');

      // 2. Create each role (idempotent — if a save fails part-way, the project
      // still exists and roles can be re-added from the detail page).
      const createdRoleIds: string[] = [];
      for (const r of validRoles) {
        const role = await teamProjectsService.addRole({
          teamProjectId: proj.data.id,
          roleTitle: r.role_title.trim(),
          requiredSkills: parseSkills(r.required_skills),
          budgetMin: r.budget_min ? Number(r.budget_min) : undefined,
          budgetMax: r.budget_max ? Number(r.budget_max) : undefined,
        });
        if (role.error || !role.data) {
          toast.error('Partial save', `Role "${r.role_title}" failed to save: ${role.error || 'unknown error'}. You can add it from the project page.`);
          continue;
        }
        createdRoleIds.push(role.data.id);
        // Fire AI matching for this role (best-effort, non-blocking)
        if (parseSkills(r.required_skills).length > 0) {
          void teamProjectsService.matchRole({
            id: role.data.id,
            required_skills: parseSkills(r.required_skills),
            budget_range_max: role.data.budget_range_max,
          });
        }
      }

      toast.success('Team project created', `${createdRoleIds.length} role(s) added. Now invite or match freelancers for each role.`);
      navigate(`/client/team-projects/${proj.data.id}`);
    } catch (err: any) {
      console.error('Create team project error:', err);
      toast.error('Something went wrong', err?.message || 'Failed to create the team project. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-4">
      <button onClick={() => navigate('/client/team-projects')} className="text-sm text-slate-500 hover:text-slate-800 mb-2 flex items-center gap-1">
        ← Back to Team Projects
      </button>

      <div className="flex items-center gap-3 mb-2">
        <div className="w-11 h-11 rounded-xl bg-violet-100 text-violet-600 flex items-center justify-center">
          <Users className="w-6 h-6" />
        </div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Post a Team Project</h1>
      </div>
      <p className="text-slate-600 mb-3">
        Hire a whole team for bigger projects — Designer, Developer, Writer — all in one place. Each freelancer has their <strong>own protected escrow</strong>.
      </p>

      <TipNote tone="info" className="mb-3">
        <strong>How it works:</strong> each role gets an <strong>independent contract</strong> — its own escrow, milestones and dispute. One member's issue never affects the rest of the team. Commission (5%) applies per contract — no separate "team fee".
      </TipNote>

      <form onSubmit={handleCreateProject} className="space-y-4">
        {/* Project basics */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <h2 className="font-semibold text-slate-900 mb-2">Project Details</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Project Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Build our company website + branding"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="What are you building? Share the goal, timeline and anything the team should know."
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Total Budget Estimate ({currencySymbol()})</label>
              <input
                type="number"
                value={totalBudgetEstimate}
                onChange={(e) => setTotalBudgetEstimate(e.target.value)}
                placeholder="Optional — overall project budget"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Roles */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Team Roles</h2>
            <button
              type="button"
              onClick={addRole}
              className="inline-flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-emerald-600 text-emerald-600 text-sm font-medium hover:bg-emerald-50 transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Role
            </button>
          </div>

          {roles.map((role, idx) => (
            <div key={role.key} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Role {idx + 1}</span>
                <button type="button" onClick={() => removeRole(role.key)} disabled={roles.length <= 1} className="text-slate-400 hover:text-red-500 disabled:opacity-30">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Role Title *</label>
                  <input
                    type="text"
                    value={role.role_title}
                    onChange={(e) => updateRole(role.key, { role_title: e.target.value })}
                    placeholder="e.g. UI/UX Designer"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Required Skills (comma separated)</label>
                  <input
                    type="text"
                    value={role.required_skills}
                    onChange={(e) => updateRole(role.key, { required_skills: e.target.value, matched: false })}
                    placeholder="e.g. Figma, UI Design, Prototyping"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Budget Min ({currencySymbol()})</label>
                  <input
                    type="number"
                    value={role.budget_min}
                    onChange={(e) => updateRole(role.key, { budget_min: e.target.value, matched: false })}
                    placeholder="e.g. 5000"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Budget Max ({currencySymbol()})</label>
                  <input
                    type="number"
                    value={role.budget_max}
                    onChange={(e) => updateRole(role.key, { budget_max: e.target.value, matched: false })}
                    placeholder="e.g. 15000"
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* AI match trigger */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => runMatchForRole(role)}
                  disabled={role.matching}
                  className="inline-flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                >
                  {role.matching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {role.matching ? 'Matching...' : 'Find AI Matches'}
                </button>
                {role.matched && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                    <CheckCircle2 className="w-4 h-4" /> {role.suggestions.length} suggested
                  </span>
                )}
                {role.matchError && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-red-600 font-medium">
                    <AlertCircle className="w-4 h-4" /> {role.matchError}
                  </span>
                )}
              </div>

              {/* Suggested freelancers — role-scoped, never cross-role */}
              {role.suggestions.length > 0 && (
                <div className="border-t border-slate-100 pt-4">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3">Suggested Freelancers for this role</p>
                  <div className="space-y-4 max-h-64 overflow-y-auto">
                    {role.suggestions.slice(0, 6).map((s) => (
                      <div key={s.freelancer_id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center font-bold text-sm shrink-0">
                            {(s.name || '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800 truncate">{s.name}</p>
                            <p className="text-xs text-slate-500">
                              {s.match_score}% match{s.skill_score >= 70 ? ' · strong skill overlap' : ''}
                              {s.verification_status === 'verified' ? ' · ✓ verified' : ''}
                            </p>
                          </div>
                        </div>
                        {s.hourly_rate > 0 && (
                          <span className="text-xs font-medium text-slate-600 shrink-0">{formatCurrency(s.hourly_rate)}/hr</span>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    Save the project first, then invite freelancers from the team project page.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={() => navigate('/client/team-projects')} className="px-5 py-3 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-60 shadow-lg"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            {saving ? 'Creating...' : 'Create Team Project'}
          </button>
        </div>
      </form>
    </div>
  );
}
