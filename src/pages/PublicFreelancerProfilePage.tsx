import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Award, Briefcase, Calendar, CheckCircle, ChevronRight, Clock, Contact, DollarSign, ExternalLink, Globe, Home, Image, Info, Languages, Loader2, MapPin, MessageSquare, Share2, Shield, Star, Users,  } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { portfolioService } from '../lib/portfolio';
import { reviewService } from '../lib/reviews';

interface FreelancerProfile {
  id: string;
  full_name: string | null;
  avatar: string | null;
  location: string | null;
  title: string | null;
  bio: string | null;
  hourly_rate: number | null;
  experience: string | null;
  skills: string[];
  languages: string[];
  education: string[];
  certifications: string[];
  portfolio_url: string | null;
  availability: string | null;
  created_at: string;
}

interface PortfolioItem {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  tags: string[];
  is_featured: boolean;
}

interface ReviewData {
  id: string;
  reviewer: { full_name: string | null; avatar: string | null };
  communication_rating: number;
  quality_rating: number;
  timeliness_rating: number;
  professionalism_rating: number;
  overall_rating: number;
  review_text: string | null;
  created_at: string;
}

export function PublicFreelancerProfilePage() {
  const { freelancerId } = useParams<{ freelancerId: string }>();
  const [profile, setProfile] = useState<FreelancerProfile | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [averageRating, setAverageRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'portfolio' | 'reviews' | 'about'>('portfolio');

  useEffect(() => {
    if (!freelancerId) return;

    const fetchProfile = async () => {
      setLoading(true);
      try {
        // Fetch freelancer profile
        const { data: profileData, error: profileError } = await supabase
          .from('freelancer_profiles')
          .select('*')
          .eq('id', freelancerId)
          .single();

        if (profileError) throw profileError;
        setProfile(profileData as unknown as FreelancerProfile);

        // Fetch portfolio
        const portfolioItems = await portfolioService.getByUser(freelancerId);
        setPortfolio(portfolioItems as unknown as PortfolioItem[]);

        // Fetch reviews
        const reviewsResult = await reviewService.getUserReviews(freelancerId);
        setReviews(reviewsResult.reviews as unknown as ReviewData[]);
        setAverageRating(reviewsResult.average_rating);
        setTotalReviews(reviewsResult.total_reviews);
      } catch (err) {
        console.error('Failed to load freelancer profile:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [freelancerId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Profile Not Found</h2>
          <p className="text-slate-500 mb-6">This freelancer profile doesn't exist or has been removed.</p>
          <Link to="/" className="text-emerald-600 hover:underline font-medium">Go Home</Link>
        </div>
      </div>
    );
  }

  const formatRating = (rating: number) => rating.toFixed(1);

  const RatingStars = ({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) => (
    <div className={`flex gap-0.5 ${size === 'md' ? 'text-lg' : 'text-sm'}`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${
            star <= Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-200'
          } ${size === 'md' ? 'w-5 h-5' : 'w-4 h-4'}`}
        />
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-cream">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar */}
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden bg-white/20 ring-4 ring-white/30 flex-shrink-0">
              {profile.avatar ? (
                <img src={profile.avatar} alt={profile.full_name || ''} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-white/60">
                  {(profile.full_name || 'U')[0]}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="text-center sm:text-left flex-1">
              <h1 className="text-3xl sm:text-4xl font-bold">{profile.full_name || 'Freelancer'}</h1>
              {profile.title && (
                <p className="text-lg text-white/80 mt-1">{profile.title}</p>
              )}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-3 text-sm text-white/70">
                {profile.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {profile.location}
                  </span>
                )}
                {profile.hourly_rate && (
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-4 h-4" />
                    {profile.hourly_rate}/hr
                  </span>
                )}
                {profile.availability && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {profile.availability}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  Member since {new Date(profile.created_at).getFullYear()}
                </span>
              </div>

              {totalReviews > 0 && (
                <div className="flex items-center justify-center sm:justify-start gap-2 mt-3">
                  <RatingStars rating={averageRating} />
                  <span className="text-white/90 font-medium">{formatRating(averageRating)}</span>
                  <span className="text-white/60">({totalReviews} reviews)</span>
                </div>
              )}
            </div>

            {/* CTA Buttons */}
            <div className="flex gap-2">
              <button className="flex items-center gap-2 px-5 py-2.5 bg-white text-emerald-700 rounded-xl hover:bg-emerald-50 transition-colors font-medium shadow-sm">
                <MessageSquare className="w-4 h-4" />
                Contact
              </button>
              <button className="p-2.5 bg-white/20 rounded-xl hover:bg-white/30 transition-colors">
                <Share2 className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8">
            {[
              { icon: Briefcase, label: 'Experience', value: profile.experience || 'N/A' },
              { icon: CheckCircle, label: 'Skills', value: String(profile.skills?.length || 0) },
              { icon: Award, label: 'Certifications', value: String(profile.certifications?.length || 0) },
              { icon: Users, label: 'Languages', value: String(profile.languages?.length || 0) },
            ].map((stat, idx) => (
              <div key={idx} className="bg-white/10 rounded-xl p-4 text-center backdrop-blur-sm">
                <stat.icon className="w-5 h-5 mx-auto mb-1.5 opacity-80" />
                <p className="text-lg font-semibold">{stat.value}</p>
                <p className="text-xs text-white/60">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex gap-0 border-b border-slate-200 mb-8">
          {[
            { id: 'portfolio' as const, label: 'Portfolio', count: portfolio.length },
            { id: 'reviews' as const, label: 'Reviews', count: totalReviews },
            { id: 'about' as const, label: 'About' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-2 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'portfolio' && (
          <div>
            {portfolio.length === 0 ? (
              <div className="text-center py-16">
                <Image className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No portfolio items yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {portfolio.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-md transition-all"
                  >
                    <div className="aspect-video bg-slate-50">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Image className="w-10 h-10 text-slate-300" />
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-slate-900">{item.title}</h3>
                      {item.description && (
                        <p className="text-sm text-slate-500 mt-1 line-clamp-2">{item.description}</p>
                      )}
                      {item.tags && item.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {item.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="px-2 py-0.5 bg-slate-50 text-slate-600 text-xs rounded-md">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div>
            {reviews.length === 0 ? (
              <div className="text-center py-16">
                <Star className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No reviews yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {reviews.map((review) => (
                  <div key={review.id} className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-sm font-medium text-slate-600 flex-shrink-0">
                        {review.reviewer?.avatar ? (
                          <img src={review.reviewer.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          (review.reviewer?.full_name || 'U')[0]
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-slate-900">{review.reviewer?.full_name || 'Anonymous'}</p>
                          <span className="text-xs text-slate-400">
                            {new Date(review.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <RatingStars rating={review.overall_rating} size="sm" />
                        {review.review_text && (
                          <p className="text-sm text-slate-600 mt-2">{review.review_text}</p>
                        )}
                        <div className="flex gap-4 mt-2 text-xs text-slate-400">
                          <span>Quality: {review.quality_rating}/5</span>
                          <span>Communication: {review.communication_rating}/5</span>
                          <span>Timeliness: {review.timeliness_rating}/5</span>
                          <span>Professionalism: {review.professionalism_rating}/5</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'about' && (
          <div className="max-w-3xl space-y-6">
            {/* Bio */}
            {profile.bio && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 mb-3">About</h2>
                <p className="text-slate-600 whitespace-pre-wrap">{profile.bio}</p>
              </div>
            )}

            {/* Skills */}
            {profile.skills && profile.skills.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 mb-3">Skills</h2>
                <div className="flex flex-wrap gap-2">
                  {profile.skills.map((skill) => (
                    <span
                      key={skill}
                      className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-sm rounded-lg font-medium"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Languages */}
            {profile.languages && profile.languages.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 mb-3">Languages</h2>
                <div className="flex flex-wrap gap-2">
                  {profile.languages.map((lang) => (
                    <span key={lang} className="px-3 py-1.5 bg-slate-50 text-slate-700 text-sm rounded-lg">
                      {lang}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {profile.education && profile.education.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 mb-3">Education</h2>
                <ul className="space-y-2">
                  {profile.education.map((edu, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-slate-600">
                      <ChevronRight className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      {edu}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Certifications */}
            {profile.certifications && profile.certifications.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 mb-3">Certifications</h2>
                <div className="flex flex-wrap gap-2">
                  {profile.certifications.map((cert) => (
                    <span
                      key={cert}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 text-sm rounded-lg"
                    >
                      <Award className="w-4 h-4" />
                      {cert}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}