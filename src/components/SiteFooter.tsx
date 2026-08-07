import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';

type SiteFooterProps = {
  onOpenSignup?: (role?: 'freelancer' | 'client') => void;
};

export function SiteFooter({ onOpenSignup }: SiteFooterProps) {
  return (
    <footer className="border-t border-slate-200 bg-white">
      {/* Main Footer Content */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Brand Column */}
          <div className="sm:col-span-2 lg:col-span-4">
            <Link to="/" className="inline-flex items-center gap-3 group">
              <img 
                src="/UpdatedLogo.webp" 
                alt="Growlancer" 
                className="h-11 w-11 rounded-xl group-hover:scale-105 transition-transform duration-300"
              />
              <div>
                <div className="font-semibold tracking-tight text-slate-900 font-display text-lg">Growlancer</div>
                <div className="text-xs text-slate-500">AI-Powered Freelancing Marketplace</div>
              </div>
            </Link>
            <p className="mt-5 text-sm text-slate-600 leading-relaxed max-w-sm">
              Built to reduce hiring noise, protect payments with escrow, and keep collaboration structured — so you can focus on the work that matters.
            </p>
            
            {/* Trust Badges */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 rounded-lg ring-1 ring-emerald-200/50">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[11px] font-medium text-emerald-700">Udyam Registered</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-lg ring-1 ring-slate-200">
                <Sparkles className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-[11px] font-medium text-slate-600">India-First</span>
              </div>
            </div>
          </div>

          {/* Product Links */}
          <div className="lg:col-span-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Product</div>
            <ul className="space-y-3">
              <li><Link to="/how-it-works" className="text-sm text-slate-600 hover:text-emerald-600 transition-colors duration-200">How it works</Link></li>
              <li><Link to="/features" className="text-sm text-slate-600 hover:text-emerald-600 transition-colors duration-200">Features</Link></li>
              <li><Link to="/categories" className="text-sm text-slate-600 hover:text-emerald-600 transition-colors duration-200">Categories</Link></li>
              <li><Link to="/pricing" className="text-sm text-slate-600 hover:text-emerald-600 transition-colors duration-200">Pricing</Link></li>
              <li><Link to="/internships" className="text-sm text-slate-600 hover:text-emerald-600 transition-colors duration-200">Internships</Link></li>
            </ul>
          </div>

          {/* Company Links */}
          <div className="lg:col-span-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Company</div>
            <ul className="space-y-3">
              <li><Link to="/about" className="text-sm text-slate-600 hover:text-emerald-600 transition-colors duration-200">About</Link></li>
              <li><Link to="/philosophy" className="text-sm text-slate-600 hover:text-emerald-600 transition-colors duration-200">Philosophy</Link></li>
              <li><Link to="/contact" className="text-sm text-slate-600 hover:text-emerald-600 transition-colors duration-200">Contact</Link></li>
              <li><Link to="/careers" className="text-sm text-slate-600 hover:text-emerald-600 transition-colors duration-200">Careers</Link></li>
              <li><Link to="/help-center" className="text-sm text-slate-600 hover:text-emerald-600 transition-colors duration-200">Help Center</Link></li>
            </ul>
          </div>

          {/* Support Links */}
          <div className="lg:col-span-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Support</div>
            <ul className="space-y-3">
              <li><Link to="/safety" className="text-sm text-slate-600 hover:text-emerald-600 transition-colors duration-200">Safety & Trust</Link></li>
              <li><Link to="/guidelines" className="text-sm text-slate-600 hover:text-emerald-600 transition-colors duration-200">Guidelines</Link></li>
              <li><Link to="/status" className="text-sm text-slate-600 hover:text-emerald-600 transition-colors duration-200">Platform Status</Link></li>
              <li><Link to="/help-center" className="text-sm text-slate-600 hover:text-emerald-600 transition-colors duration-200">Help Center</Link></li>
            </ul>
          </div>

          {/* Legal Links */}
          <div className="lg:col-span-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">Legal</div>
            <ul className="space-y-3">
              <li><Link to="/terms" className="text-sm text-slate-600 hover:text-emerald-600 transition-colors duration-200">Terms of Service</Link></li>
              <li><Link to="/privacy" className="text-sm text-slate-600 hover:text-emerald-600 transition-colors duration-200">Privacy Policy</Link></li>
              <li><Link to="/escrow-policy" className="text-sm text-slate-600 hover:text-emerald-600 transition-colors duration-200">Escrow Policy</Link></li>
              <li><Link to="/cookies" className="text-sm text-slate-600 hover:text-emerald-600 transition-colors duration-200">Cookie Policy</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-10 pt-8 border-t border-slate-200">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
            {/* Copyright */}
            <div className="text-sm text-slate-500 text-center lg:text-left">
              &copy; {new Date().getFullYear()} <span className="font-semibold text-slate-800">Growlancer</span>. 
              Built for clarity, speed, and trust. All rights reserved.
            </div>

            {/* Trust & Payment Badges */}
            <div className="flex flex-col sm:flex-row items-center gap-4">
              {/* Payment Methods */}
              <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-xl ring-1 ring-slate-200">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Payments</span>
                {/* PayPal */}
                <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PayPal">
                  <path fill="#003087" d="M7.016 19.198h-4.2a.562.562 0 0 1-.555-.65L5.093.584A.692.692 0 0 1 5.776 0h7.222c3.417 0 5.904 2.488 5.846 5.5-.006.25-.027.5-.066.747A6.794 6.794 0 0 1 12.071 12H8.743a.69.69 0 0 0-.682.583l-.325 2.056-.013.083-.692 4.39-.015.087z"/>
                  <path fill="#009cde" d="M19.79 6.142c-.01.087-.01.175-.023.261a7.76 7.76 0 0 1-7.695 6.598H9.007l-.283 1.795-.013.083-.692 4.39-.134.843-.014.088H6.86l-.497 3.15a.562.562 0 0 0 .555.65h3.612c.34 0 .63-.249.683-.585l.952-6.031a.692.692 0 0 1 .683-.584h2.126a6.793 6.793 0 0 0 6.707-5.752c.306-1.95-.466-3.744-1.89-4.906z"/>
                </svg>
                <span className="text-slate-300 text-xs">|</span>
                {/* Razorpay */}
                <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Razorpay">
                  <defs>
                    <linearGradient id="rzp-grad2" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#3395FF"/>
                      <stop offset="100%" stopColor="#1A5CFF"/>
                    </linearGradient>
                  </defs>
                  <path fill="url(#rzp-grad2)" fillRule="evenodd" d="M22.436 0l-11.91 7.773-1.174 4.276 6.625-4.297L11.65 24h4.391l6.395-24zM14.26 10.098L3.389 17.166 1.564 24h9.008l3.688-13.902Z"/>
                </svg>
                <span className="text-[10px] text-slate-400">Secure</span>
              </div>

              {/* CTA Buttons */}
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => onOpenSignup?.('client')} 
                  className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 active:bg-emerald-800 transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  Get Started
                  <ArrowRight className="ml-1.5 w-3.5 h-3.5" />
                </button>
                <button 
                  onClick={() => onOpenSignup?.('freelancer')} 
                  className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-white text-slate-700 text-sm font-semibold ring-1 ring-slate-200 hover:bg-slate-50 hover:ring-slate-300 active:bg-slate-100 transition-all duration-200"
                >
                  Join as Freelancer
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
