import { Link } from 'react-router-dom';
import { NewsletterForm } from './NewsletterForm';

type SiteFooterProps = {
  onOpenSignup?: (role?: 'freelancer' | 'client') => void;
};

export function SiteFooter({ onOpenSignup }: SiteFooterProps) {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4">
            <Link to="/" className="flex items-center gap-3">
              <img src="/Growlancer Logo (2).png" alt="Growlancer" className="h-10 w-10 rounded-2xl" />
              <div>
                <div className="font-semibold tracking-tight text-slate-900 font-display">Growlancer</div>
                <div className="text-sm text-slate-600">AI-powered freelancing marketplace</div>
              </div>
            </Link>
            <p className="mt-4 text-sm text-slate-600 leading-relaxed max-w-md">Growlancer is built to reduce hiring noise, protect payments with escrow, and keep collaboration structured.</p>
          </div>

          <div className="lg:col-span-2">
            <div className="text-xs font-semibold text-slate-500 tracking-wide uppercase">Product</div>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link to="/how-it-works" className="text-slate-700 hover:text-slate-900 transition-colors">How it works</Link></li>
              <li><Link to="/features" className="text-slate-700 hover:text-slate-900 transition-colors">Features</Link></li>
              <li><Link to="/categories" className="text-slate-700 hover:text-slate-900 transition-colors">Categories</Link></li>
              <li><Link to="/pricing" className="text-slate-700 hover:text-slate-900 transition-colors">Pricing</Link></li>
            </ul>
          </div>

          <div className="lg:col-span-2">
            <div className="text-xs font-semibold text-slate-500 tracking-wide uppercase">Company</div>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link to="/about" className="text-slate-700 hover:text-slate-900 transition-colors">About</Link></li>
              <li><Link to="/philosophy" className="text-slate-700 hover:text-slate-900 transition-colors">Philosophy</Link></li>
              <li><Link to="/contact" className="text-slate-700 hover:text-slate-900 transition-colors">Contact</Link></li>
              <li><Link to="/careers" className="text-slate-700 hover:text-slate-900 transition-colors">Careers</Link></li>
            </ul>
          </div>

          <div className="lg:col-span-2">
            <div className="text-xs font-semibold text-slate-500 tracking-wide uppercase">Support</div>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link to="/help-center" className="text-slate-700 hover:text-slate-900 transition-colors">Help center</Link></li>
              <li><Link to="/safety" className="text-slate-700 hover:text-slate-900 transition-colors">Safety & trust</Link></li>
              <li><Link to="/guidelines" className="text-slate-700 hover:text-slate-900 transition-colors">Guidelines</Link></li>
              <li><Link to="/status" className="text-slate-700 hover:text-slate-900 transition-colors">Status</Link></li>
            </ul>
          </div>

          <div className="lg:col-span-2">
            <div className="text-xs font-semibold text-slate-500 tracking-wide uppercase">Legal</div>
            <ul className="mt-3 space-y-2 text-sm">
              <li><Link to="/terms" className="text-slate-700 hover:text-slate-900 transition-colors">Terms</Link></li>
              <li><Link to="/privacy" className="text-slate-700 hover:text-slate-900 transition-colors">Privacy</Link></li>
              <li><Link to="/escrow-policy" className="text-slate-700 hover:text-slate-900 transition-colors">Escrow policy</Link></li>
              <li><Link to="/cookies" className="text-slate-700 hover:text-slate-900 transition-colors">Cookies</Link></li>
            </ul>
          </div>

          {/* Newsletter */}
          <div className="lg:col-span-4 sm:col-span-2">
            <NewsletterForm />
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-slate-600">&copy; {new Date().getFullYear()} <span className="font-semibold text-slate-900">Growlancer</span>. Built for clarity, speed, and trust.</div>
          <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-50 rounded-lg ring-1 ring-slate-200">
            {/* PayPal monogram: Simple Icons v11 geometry (CC0), split into two closed paths with distinct origins; brand blues per PayPal guidelines */}
            <svg
              className="h-7 w-7 shrink-0"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              role="img"
              aria-label="PayPal"
            >
              <path
                fill="#003087"
                d="M7.016 19.198h-4.2a.562.562 0 0 1-.555-.65L5.093.584A.692.692 0 0 1 5.776 0h7.222c3.417 0 5.904 2.488 5.846 5.5-.006.25-.027.5-.066.747A6.794 6.794 0 0 1 12.071 12H8.743a.69.69 0 0 0-.682.583l-.325 2.056-.013.083-.692 4.39-.015.087z"
              />
              <path
                fill="#009cde"
                d="M19.79 6.142c-.01.087-.01.175-.023.261a7.76 7.76 0 0 1-7.695 6.598H9.007l-.283 1.795-.013.083-.692 4.39-.134.843-.014.088H6.86l-.497 3.15a.562.562 0 0 0 .555.65h3.612c.34 0 .63-.249.683-.585l.952-6.031a.692.692 0 0 1 .683-.584h2.126a6.793 6.793 0 0 0 6.707-5.752c.306-1.95-.466-3.744-1.89-4.906z"
              />
            </svg>
            <span className="text-sm font-semibold text-slate-700">Secure Payments via PayPal</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onOpenSignup('client')} className="inline-flex items-center justify-center h-10 px-4 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors shadow-sm">Get Started</button>
            <button onClick={() => onOpenSignup('freelancer')} className="inline-flex items-center justify-center h-10 px-4 rounded-lg bg-white text-slate-900 font-semibold ring-1 ring-slate-200 hover:bg-slate-50 transition-colors">Join</button>
          </div>
        </div>
      </div>
    </footer>
  );
}
