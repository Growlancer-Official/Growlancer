import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  ArrowRight,
  Briefcase,
  CheckCircle,
  DollarSign,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { useCategories } from '../hooks/useCategories';
import { useSkills } from '../hooks/useSkills';
import { SkillsSelector } from '../components/SkillsSelector';

export function ClientPostProjectPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const editProjectId = searchParams.get('edit');
  const { categories } = useCategories();
  const { skills: allSkills } = useSkills();
  const [loading, setLoading] = useState(false);
  const [fetchingEditData, setFetchingEditData] = useState(!!editProjectId);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    budget_min: '',
    budget_max: '',
    skills_required: [] as string[],
    deadline: '',
    category: '',
    experience_level: 'intermediate' as 'entry' | 'intermediate' | 'expert',
    visibility: 'public' as 'public' | 'private' | 'invited',
  });

  // Load existing project data for edit mode
  useEffect(() => {
    if (!editProjectId) return;
    
    const fetchProject = async () => {
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('id', editProjectId)
          .eq('client_id', user?.id)
          .single();

        if (error) throw error;
        if (data) {
          const skillNames: string[] = data.skills_required || [];
          setFormData({
            title: data.title || '',
            description: data.description || '',
            budget_min: data.budget_min?.toString() || '',
            budget_max: data.budget_max?.toString() || '',
            skills_required: skillNames,
            deadline: data.deadline ? data.deadline.slice(0, 10) : '',
            category: data.category || '',
            experience_level: (data.experience_level as 'entry' | 'intermediate' | 'expert') || 'intermediate',
            visibility: (data.visibility as 'public' | 'private' | 'invited') || 'public',
          });

          // Resolve category and skill IDs from existing data
          if (data.category) {
            const cat = categories.find(c => c.name === data.category);
            if (cat) setSelectedCategoryIds([cat.id]);
          }
        }
      } catch (err) {
        console.error('Error loading project for edit:', err);
      } finally {
        setFetchingEditData(false);
      }
    };
    fetchProject();
  }, [editProjectId, user?.id]);

  // Map selected skill IDs to skill names for form submission
  const getSelectedSkillNames = (): string[] => {
    return selectedSkillIds
      .map(id => allSkills.find(s => s.id === id))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map(s => s.name);
  };

  // Sync selected category into formData.category string
  useEffect(() => {
    if (selectedCategoryIds.length > 0) {
      const cat = categories.find(c => c.id === selectedCategoryIds[0]);
      if (cat) setFormData(prev => ({ ...prev, category: cat.name }));
    }
  }, [selectedCategoryIds, categories]);

  // Sync selected skill IDs into formData.skills_required
  useEffect(() => {
    const skillNames = getSelectedSkillNames();
    if (skillNames.length > 0) {
      setFormData(prev => ({ ...prev, skills_required: skillNames }));
    }
  }, [selectedSkillIds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.description || !formData.budget_min || !formData.budget_max) {
      alert('Please fill in all required fields');
      return;
    }

    // Budget range validation
    const minBudget = parseInt(formData.budget_min);
    const maxBudget = parseInt(formData.budget_max);
    if (isNaN(minBudget) || isNaN(maxBudget)) {
      alert('Please enter valid budget amounts.');
      return;
    }
    if (minBudget < 500) {
      alert('Minimum budget must be at least $500.');
      return;
    }
    if (maxBudget < minBudget) {
      alert('Minimum budget cannot be greater than maximum budget.');
      return;
    }
    setLoading(true);

    try {
      const projectData = {
        client_id: user?.id,
        title: formData.title,
        description: formData.description,
        budget_min: parseInt(formData.budget_min),
        budget_max: parseInt(formData.budget_max),
        skills_required: formData.skills_required,
        deadline: formData.deadline || null,
        category: formData.category,
        experience_level: formData.experience_level,
        visibility: formData.visibility,
      };

      let result;
      if (editProjectId) {
        // UPDATE existing project
        result = await supabase
          .from('projects')
          .update({ ...projectData, updated_at: new Date().toISOString() })
          .eq('id', editProjectId)
          .select()
          .single();
      } else {
        // INSERT new project
        result = await supabase
          .from('projects')
          .insert(projectData)
          .select()
          .single();
      }

      const { data: projectDataResult, error: insertError } = result;

      if (insertError) throw insertError;
      if (!projectDataResult) throw new Error('No project data returned');

      // Save to project_categories and project_skills junction tables
      const projectId = projectDataResult.id;

      // Save category link
      for (const catId of selectedCategoryIds) {
        await supabase.from('project_categories').upsert({
          project_id: projectId,
          category_id: catId,
        }, { onConflict: 'project_id, category_id', ignoreDuplicates: true });
      }

      // Save skill links
      for (const skillId of selectedSkillIds) {
        await supabase.from('project_skills').upsert({
          project_id: projectId,
          skill_id: skillId,
        }, { onConflict: 'project_id, skill_id', ignoreDuplicates: true });
      }

      // Clear old AI matches so fresh skill-based matching runs on matches page
      await supabase.from('ai_matches').delete().eq('project_id', projectId);

      navigate(`/client/matches?project_id=${projectDataResult.id}`);
    } catch (error) {
      console.error('Error saving project:', error);
      alert('Failed to save project. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (fetchingEditData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-slate-900 mb-2">
          {editProjectId ? 'Edit Project' : 'Post New Project'}
        </h1>
        <p className="text-slate-500">
          {editProjectId
            ? 'Update your project details and regenerate AI matches'
            : 'Fill in the details to post your project and get matched with talented freelancers'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100">
          <h2 className="font-display text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-emerald-600" />
            Basic Information
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Project Title *</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                placeholder="e.g., Build a React Native Mobile App"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Description *</label>
              <textarea
                required
                rows={6}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all resize-none"
                placeholder="Describe your project in detail. Include requirements, deliverables, and any specific skills needed..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Experience Level *</label>
                <select
                  required
                  value={formData.experience_level}
                  onChange={(e) => setFormData({ ...formData, experience_level: e.target.value as 'entry' | 'intermediate' | 'expert' })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                >
                  <option value="entry">Entry Level</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="expert">Expert</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Deadline</label>
                <input
                  type="date"
                  value={formData.deadline}
                  onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Budget */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100">
          <h2 className="font-display text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            Budget
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Min Budget ($) *</label>
              <input
                type="number"
                required
                min="500"
                value={formData.budget_min}
                onChange={(e) => setFormData({ ...formData, budget_min: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                placeholder="500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Max Budget ($) *</label>
              <input
                type="number"
                required
                min="500"
                value={formData.budget_max}
                onChange={(e) => setFormData({ ...formData, budget_max: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                placeholder="2000"
              />
            </div>
          </div>
        </div>

        {/* Category → Subcategory → Skills Hierarchy (restored from SkillsSelector) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100">
          <h2 className="font-display text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            Category & Skills
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            Select a category, subcategories, and specific skills your project requires
          </p>
          <SkillsSelector
            mode="client"
            maxSkills={15}
            maxCategories={1}
            selectedCategoryIds={selectedCategoryIds}
            selectedSkillIds={selectedSkillIds}
            onCategoriesChange={setSelectedCategoryIds}
            onSkillsChange={setSelectedSkillIds}
          />

          {/* Show selected skills summary */}
          {selectedSkillIds.length > 0 && (
            <div className="mt-4 p-3 bg-emerald-50 rounded-xl">
              <div className="flex items-center gap-1.5 mb-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-700">
                  {selectedSkillIds.length} skills selected
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedSkillIds
                  .map(id => allSkills.find(s => s.id === id))
                  .filter((s): s is NonNullable<typeof s> => !!s)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(skill => (
                    <span key={skill.id} className="px-2 py-1 bg-white text-emerald-700 rounded-lg text-xs font-medium">
                      {skill.name}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Visibility */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100">
          <h2 className="font-display text-lg font-bold text-slate-900 mb-4">Project Visibility</h2>
          <div className="space-y-3">
            {[
              { value: 'public', label: 'Public - Visible to all freelancers', desc: 'Get maximum exposure and proposals' },
              { value: 'private', label: 'Private - Only invited freelancers', desc: 'Control who can see your project' },
              { value: 'invited', label: 'Invited Only - Send specific invites', desc: 'Target specific freelancers' },
            ].map((option) => (
              <label
                key={option.value}
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${
                  formData.visibility === option.value
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={option.value}
                  checked={formData.visibility === option.value}
                  onChange={(e) => setFormData({ ...formData, visibility: e.target.value as 'public' | 'private' | 'invited' })}
                  className="mt-1"
                />
                <div>
                  <p className="font-medium text-slate-900">{option.label}</p>
                  <p className="text-sm text-slate-500">{option.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate('/client/projects')}
            className="px-6 py-3 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/25 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                {editProjectId ? 'Updating...' : 'Posting...'}
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                {editProjectId ? 'Update Project' : 'Post Project'}
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
