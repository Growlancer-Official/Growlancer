import { Mail, Clock, Globe, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function WaitlistPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-8 md:p-12 text-center">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-200">
              <Globe className="w-10 h-10 text-white" />
            </div>
          </div>

          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img
              src="/Growlancer Logo (2).png"
              alt="Growlancer"
              className="h-12 w-12 rounded-xl"
            />
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-3">
            Coming Soon in Your Country 🚀
          </h1>

          <p className="text-slate-500 mb-8 leading-relaxed">
            Growlancer is currently available in <strong>India</strong> only. 
            We are working hard to expand to other countries and would love 
            to keep you updated on our launch progress.
          </p>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
              <Clock className="w-6 h-6 text-emerald-600 mb-2 mx-auto" />
              <h3 className="text-sm font-bold text-slate-900 mb-1">Early Access</h3>
              <p className="text-xs text-slate-500">
                Be among the first to know when we launch in your country
              </p>
            </div>
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
              <Mail className="w-6 h-6 text-emerald-600 mb-2 mx-auto" />
              <h3 className="text-sm font-bold text-slate-900 mb-1">Launch Updates</h3>
              <p className="text-xs text-slate-500">
                Get notified via email when your country is supported
              </p>
            </div>
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-8">
            <p className="text-sm text-amber-800">
              <strong>You're on the waitlist!</strong> We'll notify you at 
              your email address as soon as Growlancer becomes available in 
              your country. No action needed from you right now.
            </p>
          </div>

          {/* Navigation */}
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-6">
          &copy; {new Date().getFullYear()} Growlancer. All rights reserved.
        </p>
      </div>
    </div>
  );
}
