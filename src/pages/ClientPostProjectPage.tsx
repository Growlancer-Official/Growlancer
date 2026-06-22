import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase, dbFunctions } from '../lib/supabase';
import {
  ArrowRight,
  Briefcase,
  CheckCircle,
  DollarSign,
  Save,
  Send,
  Sparkles,
  Target,
} from 'lucide-react';
import { SkillsSelector } from '../components/SkillsSelector';
import { useSkills } from '../hooks/useSkills';
import { useCategories } from '../hooks/useCategories';

export function ClientPostProjectPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { skills } = useSkills();
  const { categories } = useCategories();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    budget_min: '',
    budget_max: '',
    skills_required: [] as string[],
    skill_ids: [] as string[],
    deadline: '',
    category: '',
    experience_level: 'intermediate' as 'entry' | 'intermediate' | 'expert',
    visibility: 'public' as 'public' | 'private' | 'invited',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Insert the project
      const { data: projectData, error: insertError } = await supabase
        .from('projects')
        .insert({
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
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Save selected skills to project_skills table
      if (projectData?.id && formData.skill_ids.length > 0) {
        const skillInserts = formData.skill_ids.map((skillId) => ({
          project_id: projectData.id,
          skill_id: skillId,
        }));
        const { error: skillError } = await supabase
          .from('project_skills')
          .insert(skillInserts);

        if (skillError) {
          console.error('Error saving project skills:', skillError);
        }
      }

      // Generate AI matches for the project
      if (projectData?.id) {
        const { error: matchError } = await dbFunctions.generateProjectMatches(projectData.id);
        
        if (matchError) {
          console.error('Error generating AI matches:', matchError);
          // Don't fail the whole process if matching fails, just log it
        }
      }

      navigate(`/client/matches?project_id=${projectData.id}`);
    } catch (error) {
      console.error('Error creating project:', error);
      alert('Failed to create project. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-slate-900 mb-2">Post New Project</h1>
        <p className="text-slate-500">Fill in the details to post your project and get matched with talented freelancers</p>
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

        {/* Budget & Timeline */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100">
          <h2 className="font-display text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            Budget & Timeline
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Min Budget ($) *</label>
              <input
                type="number"
                required
                min="0"
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
                min="0"
                value={formData.budget_max}
                onChange={(e) => setFormData({ ...formData, budget_max: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                placeholder="2000"
              />
            </div>
          </div>
        </div>

        {/* Skills - Category → Subcategory → Skills cascade */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100">
          <h2 className="font-display text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            Skills Required
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Step 1: Select a category → Step 2: Choose subcategories → Step 3: Pick specific skills needed for your project
          </p>
          <SkillsSelector
            mode="client"
            maxSkills={15}
            selectedSkillIds={formData.skill_ids}
            onSkillsChange={(ids) => {
              setFormData({
                ...formData,
                skill_ids: ids,
                skills_required: skills.filter((s) => ids.includes(s.id)).map((s) => s.name),
              });
            }}
            selectedCategoryIds={
              formData.category
                ? (() => {
                    // Find category ID from name
                    const cat = categories.find((c) => c.name === formData.category);
                    return cat ? [cat.id] : [];
                  })()
                : []
            }
            onCategoriesChange={(ids) => {
              // Derive category name from IDs
              const cat = categories.find((c) => ids.includes(c.id));
              setFormData({ ...formData, category: cat?.name || '' });
            }}
          />
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
                Posting...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                Post Project
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
