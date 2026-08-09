import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
} from 'lucide-react';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../../context/AuthContext';
import {
  AVAILABLE_SKILL_TESTS,
  CERTIFICATION_LEVELS,
  MAX_VIOLATIONS_BEFORE_BAN,
  skillCertificationService,
  skillTestAttemptService,
  type SkillTest,
} from '../../lib/skillCertifications';

interface Question {
  text: string;
  options: string[];
  correctIndex: number;
}

const QUESTION_BANK: Record<string, Question[]> = {
  'js-basic': [
    { text: 'What does `typeof null` return?', options: ['"null"', '"undefined"', '"object"', '"boolean"'], correctIndex: 2 },
    { text: 'Which method adds an element to the end of an array?', options: ['pop()', 'push()', 'shift()', 'unshift()'], correctIndex: 1 },
    { text: 'What is the result of `2 + "2"`?', options: ['4', '"22"', '22', 'Error'], correctIndex: 1 },
    { text: 'Which keyword declares a block-scoped variable?', options: ['var', 'let', 'const', 'Both let and const'], correctIndex: 3 },
    { text: 'What does `===` check?', options: ['Value only', 'Type only', 'Value and type', 'Reference'], correctIndex: 2 },
  ],
  'react': [
    { text: 'What hook is used for side effects?', options: ['useState', 'useEffect', 'useContext', 'useReducer'], correctIndex: 1 },
    { text: 'What is JSX?', options: ['A database query language', 'A JavaScript syntax extension', 'A CSS framework', 'A build tool'], correctIndex: 1 },
    { text: 'How do you pass data from parent to child?', options: ['State', 'Props', 'Context', 'Refs'], correctIndex: 1 },
    { text: 'What does `useState` return?', options: ['A single value', 'An array with two values', 'An object', 'A promise'], correctIndex: 1 },
    { text: 'What is the virtual DOM?', options: ['A direct copy of the real DOM', 'A lightweight representation of the DOM', 'A browser API', 'A JavaScript library'], correctIndex: 1 },
  ],
  'node': [
    { text: 'What is Express.js?', options: ['A database', 'A web framework for Node.js', 'A frontend library', 'A testing tool'], correctIndex: 1 },
    { text: 'Which method creates an HTTP server in Node.js?', options: ['http.createServer()', 'http.newServer()', 'http.startServer()', 'http.listen()'], correctIndex: 0 },
    { text: 'What does `require()` do?', options: ['Imports a module', 'Exports a module', 'Creates a file', 'Reads input'], correctIndex: 0 },
    { text: 'What is middleware in Express?', options: ['Database layer', 'Functions that execute during request cycle', 'Template engine', 'Error handler'], correctIndex: 1 },
    { text: 'How do you handle POST request body in Express?', options: ['req.body', 'req.query', 'req.params', 'req.data'], correctIndex: 0 },
  ],
  'python': [
    { text: 'What is the correct file extension for Python files?', options: ['.pt', '.py', '.pyt', '.pn'], correctIndex: 1 },
    { text: 'Which keyword is used to define a function?', options: ['func', 'define', 'def', 'function'], correctIndex: 2 },
    { text: 'What does `len()` return?', options: ['Length of an object', 'Last element', 'List of items', 'Number of arguments'], correctIndex: 0 },
    { text: 'What is a list comprehension?', options: ['A way to create lists concisely', 'A built-in function', 'A data type', 'An error type'], correctIndex: 0 },
    { text: 'Which is immutable?', options: ['List', 'Dict', 'Tuple', 'Set'], correctIndex: 2 },
  ],
  'sql': [
    { text: 'Which SQL statement is used to retrieve data?', options: ['GET', 'FETCH', 'SELECT', 'RETRIEVE'], correctIndex: 2 },
    { text: 'What does JOIN do?', options: ['Combines rows from two tables', 'Deletes a table', 'Creates an index', 'Sorts results'], correctIndex: 0 },
    { text: 'Which clause filters grouped results?', options: ['WHERE', 'HAVING', 'FILTER', 'GROUP'], correctIndex: 1 },
    { text: 'What is a primary key?', options: ['A unique identifier for a row', 'A foreign key reference', 'An index', 'A constraint'], correctIndex: 0 },
    { text: 'What does `COUNT(*)` return?', options: ['Number of distinct values', 'Total number of rows', 'Sum of all values', 'Average value'], correctIndex: 1 },
  ],
  'design-ui': [
    { text: 'What is the golden ratio approximately?', options: ['1.414', '1.618', '2.0', '3.14'], correctIndex: 1 },
    { text: 'What does CRAP stand for in design?', options: ['Color, Ratio, Alignment, Pattern', 'Contrast, Repetition, Alignment, Proximity', 'Creativity, Rhythm, Art, Proportion', 'Color, Resolution, Aspect, Pixel'], correctIndex: 1 },
    { text: 'What is kerning?', options: ['Space between lines', 'Space between characters', 'Space between paragraphs', 'Space between elements'], correctIndex: 1 },
    { text: 'Which color model is used for digital screens?', options: ['CMYK', 'RGB', 'HSL', 'Pantone'], correctIndex: 1 },
    { text: 'What is the purpose of a grid system?', options: ['To create visual hierarchy and alignment', 'To add colors to a design', 'To reduce file size', 'To create animations'], correctIndex: 0 },
  ],
  'seo': [
    { text: 'What does SEO stand for?', options: ['Search Engine Optimization', 'Site Enhancement Operation', 'Search Engine Output', 'Systematic Error Optimization'], correctIndex: 0 },
    { text: 'What is a meta description?', options: ['A hidden page element', 'A brief summary of page content', 'A keyword list', 'An HTML tag for styling'], correctIndex: 1 },
    { text: 'What is an alt attribute used for?', options: ['Images', 'Links', 'Headings', 'Paragraphs'], correctIndex: 0 },
    { text: 'What is a backlink?', options: ['A link to your site from another site', 'A link within your own site', 'A broken link', 'A link to social media'], correctIndex: 0 },
    { text: 'What does page speed affect?', options: ['Only user experience', 'Search rankings and user experience', 'Only search rankings', 'Page design'], correctIndex: 1 },
  ],
  'typescript': [
    { text: 'What does TypeScript add to JavaScript?', options: ['Static types', 'New runtime', 'CSS styling', 'Database access'], correctIndex: 0 },
    { text: 'What is the syntax for a type annotation?', options: ['variable: type', 'type: variable', 'variable type', 'type variable'], correctIndex: 0 },
    { text: 'What does `interface` define?', options: ['A class', 'A shape of an object', 'A function', 'A variable'], correctIndex: 1 },
    { text: 'What is a generic?', options: ['A type parameter', 'A variable type', 'A class type', 'A function type'], correctIndex: 0 },
    { text: 'What does `?` after a property mean?', options: ['Required', 'Optional', 'Nullable', 'Readonly'], correctIndex: 1 },
  ],
  'aws': [
    { text: 'What does EC2 provide?', options: ['Virtual servers', 'Object storage', 'Databases', 'DNS services'], correctIndex: 0 },
    { text: 'What is S3 used for?', options: ['Compute', 'Object storage', 'Networking', 'Monitoring'], correctIndex: 1 },
    { text: 'What is Lambda?', options: ['A virtual machine', 'A serverless compute service', 'A database service', 'A storage service'], correctIndex: 1 },
    { text: 'What does IAM manage?', options: ['Compute resources', 'Access control and permissions', 'Network traffic', 'Storage'], correctIndex: 1 },
    { text: 'What is an S3 bucket?', options: ['A compute instance', 'A container for objects', 'A database table', 'A network subnet'], correctIndex: 1 },
  ],
  'js-adv': [
    { text: 'What is a closure?', options: ['A function with access to its outer scope', 'A closed function', 'A private variable', 'A class method'], correctIndex: 0 },
    { text: 'What does `Promise.all()` do?', options: ['Runs promises sequentially', 'Waits for all promises to resolve', 'Cancels all promises', 'Returns the first resolved promise'], correctIndex: 1 },
    { text: 'What is the event loop?', options: ['A UI component', 'A mechanism for async execution', 'A loop construct', 'An error handler'], correctIndex: 1 },
    { text: 'What is a generator function?', options: ['A function that can be paused and resumed', 'A function that generates code', 'A factory function', 'A recursive function'], correctIndex: 0 },
    { text: 'What does `Object.create()` do?', options: ['Creates a new object with a specified prototype', 'Creates a class instance', 'Copies an object', 'Freezes an object'], correctIndex: 0 },
  ],
  // ─── NEW: Generative AI & Prompt Engineering ─────────────────────
  'ai-prompt': [
    { text: 'What is prompt engineering?', options: ['Writing code for AI models', 'Designing and refining inputs to get desired AI outputs', 'Building AI hardware', 'Training neural networks'], correctIndex: 1 },
    { text: 'What does few-shot prompting mean?', options: ['Using AI with limited time', 'Providing a few examples in the prompt', 'Limiting the AI to short responses', 'Using minimal characters'], correctIndex: 1 },
    { text: 'What is a system prompt?', options: ['A prompt that resets the AI', 'Initial instructions setting the AI behavior and persona', 'The error message when AI fails', 'A prompt for system administrators'], correctIndex: 1 },
    { text: 'What is chain-of-thought prompting?', options: ['Prompting AI to reason step-by-step', 'Linking multiple AI models together', 'Creating a chain of prompts in sequence', 'A security technique'], correctIndex: 0 },
    { text: 'What is temperature in AI models?', options: ['The physical temperature of servers', 'A parameter controlling randomness of output', 'The speed of AI response', 'The model version number'], correctIndex: 1 },
  ],
  // ─── NEW: Tailwind CSS ───────────────────────────────────────────
  'tailwind': [
    { text: 'How do you center a div using Tailwind?', options: ['text-center mx-auto', 'flex items-center justify-center', 'absolute center-0', 'block m-auto'], correctIndex: 1 },
    { text: 'What utility creates a shadow in Tailwind?', options: ['drop-shadow', 'box-shadow', 'shadow-md', 'glow'], correctIndex: 2 },
    { text: 'How do you make a responsive grid?', options: ['grid grid-cols-1 md:grid-cols-3', 'flex-row responsive', 'display: responsive-grid', 'grid-template: auto'], correctIndex: 0 },
    { text: 'What does `transition-all` do?', options: ['Adds transitions to all properties', 'Creates page transitions', 'Animates elements on scroll', 'Transforms elements'], correctIndex: 0 },
    { text: 'How do you make text bold in Tailwind?', options: ['text-bold', 'font-bold', 'bold-text', 'font-700'], correctIndex: 1 },
  ],
  // ─── NEW: Next.js ────────────────────────────────────────────────
  'nextjs': [
    { text: 'How do you create a page in Next.js App Router?', options: ['Create a file in pages/', 'Create a page.tsx in app/ directory', 'Define a route in next.config.js', 'Use createPage() function'], correctIndex: 1 },
    { text: 'What is server-side rendering (SSR)?', options: ['Rendering on the client only', 'Generating HTML on the server per request', 'Pre-building static HTML files', 'Using server components only'], correctIndex: 1 },
    { text: 'What is a Server Component in Next.js?', options: ['A component that runs on the server', 'An API route handler', 'A middleware function', 'A database query builder'], correctIndex: 0 },
    { text: 'How do you fetch data in server components?', options: ['With useEffect', 'With async/await directly in component', 'With fetch() in client only', 'With useQuery hook'], correctIndex: 1 },
    { text: 'What is the purpose of layout.tsx?', options: ['To define shared UI across pages', 'To configure the database', 'To create API endpoints', 'To define styles only'], correctIndex: 0 },
  ],
  // ─── NEW: React Native ───────────────────────────────────────────
  'react-native': [
    { text: 'What does React Native use for styling?', options: ['CSS stylesheets', 'JavaScript objects with style properties', 'SASS files', 'Tailwind CSS by default'], correctIndex: 1 },
    { text: 'Which component is used for scrolling?', options: ['<ScrollView>', '<FlatView>', '<List>', '<ScrollContainer>'], correctIndex: 0 },
    { text: 'What is the bridge in React Native?', options: ['A UI component', 'Communication layer between JS and native', 'A debugging tool', 'A navigation library'], correctIndex: 1 },
    { text: 'How do you navigate between screens?', options: ['<a href> tags', 'React Navigation library', 'window.location', 'document.navigate()'], correctIndex: 1 },
    { text: 'What is AsyncStorage used for?', options: ['Storing API keys securely', 'Persisting key-value data locally', 'Caching images', 'Managing sessions'], correctIndex: 1 },
  ],
  // ─── NEW: Flutter ────────────────────────────────────────────────
  'flutter': [
    { text: 'What language is used for Flutter?', options: ['Java', 'Dart', 'Kotlin', 'Swift'], correctIndex: 1 },
    { text: 'What is a Widget in Flutter?', options: ['A UI component', 'A data model', 'A database table', 'An API route'], correctIndex: 0 },
    { text: 'What does `StatefulWidget` mean?', options: ['A widget with no mutable state', 'A widget that can change during runtime', 'A fixed layout component', 'A widget for forms only'], correctIndex: 1 },
    { text: 'How do you create a layout in Flutter?', options: ['Using XML layouts', 'Composing widgets together', 'Writing HTML templates', 'Using Interface Builder'], correctIndex: 1 },
    { text: 'What is the build method?', options: ['A method that builds the widget UI', 'A method that compiles code', 'A deployment script', 'A testing function'], correctIndex: 0 },
  ],
  // ─── NEW: Machine Learning ───────────────────────────────────────
  'ml-basics': [
    { text: 'What is supervised learning?', options: ['Learning without labels', 'Training on labeled data', 'AI generating its own data', 'Unsupervised clustering'], correctIndex: 1 },
    { text: 'What is overfitting?', options: ['Model performing too well on training data but poorly on new data', 'Model training too fast', 'Model with too few parameters', 'Data preprocessing error'], correctIndex: 0 },
    { text: 'What is a neural network?', options: ['A computer network', 'Computing system inspired by biological neural networks', 'A database structure', 'A type of server'], correctIndex: 1 },
    { text: 'What is the purpose of a loss function?', options: ['To measure model prediction error', 'To delete unnecessary data', 'To optimize hardware', 'To compress models'], correctIndex: 0 },
    { text: 'What is feature engineering?', options: ['Building new hardware', 'Selecting and transforming variables for better model performance', 'Writing automated tests', 'Deploying models to production'], correctIndex: 1 },
  ],
  // ─── NEW: Docker ─────────────────────────────────────────────────
  'docker': [
    { text: 'What is a Docker container?', options: ['A virtual machine', 'A lightweight, standalone executable package', 'A database instance', 'A web server'], correctIndex: 1 },
    { text: 'What is a Dockerfile?', options: ['A file listing running containers', 'A script with instructions to build an image', 'A network configuration file', 'A log file'], correctIndex: 1 },
    { text: 'What does `docker-compose` do?', options: ['Compresses Docker images', 'Defines and runs multi-container applications', 'Monitors container health', 'Builds single containers'], correctIndex: 1 },
    { text: 'What is the difference between an image and a container?', options: ['They are the same thing', 'Image is a template, container is a running instance', 'Container creates images', 'Images run on containers'], correctIndex: 1 },
    { text: 'What command runs a container?', options: ['docker start', 'docker run', 'docker execute', 'docker launch'], correctIndex: 1 },
  ],
  // ─── NEW: Supabase ───────────────────────────────────────────────
  'supabase': [
    { text: 'What is Supabase?', options: ['A MySQL database', 'An open-source Firebase alternative', 'A CSS framework', 'A JavaScript library'], correctIndex: 1 },
    { text: 'What is Row Level Security (RLS)?', options: ['Database backup strategy', 'Policy-based access control on rows', 'A row counting algorithm', 'An indexing technique'], correctIndex: 1 },
    { text: 'How do you listen to realtime changes?', options: ['Using WebSockets with supabase.channel()', 'Polling every second', 'Using webhooks only', 'SSE streams'], correctIndex: 0 },
    { text: 'What is a Supabase Edge Function?', options: ['A database trigger', 'Server-side TypeScript function deployed globally', 'A SQL stored procedure', 'A client-side utility'], correctIndex: 1 },
    { text: 'What is the purpose of `select("*")` in Supabase?', options: ['To update rows', 'To select all columns from a table', 'To delete records', 'To count rows only'], correctIndex: 1 },
  ],
  // ─── NEW: Cybersecurity ──────────────────────────────────────────
  'cybersec': [
    { text: 'What is phishing?', options: ['A type of firewall', 'Social engineering attack via deceptive messages', 'Database injection technique', 'Network scanning tool'], correctIndex: 1 },
    { text: 'What is 2FA/MFA?', options: ['Single password login', 'Multi-factor authentication for extra security', 'File encryption format', 'Network protocol'], correctIndex: 1 },
    { text: 'What does XSS stand for?', options: ['XML Security Standard', 'Cross-Site Scripting', 'Xtra Secure System', 'Xen Server Software'], correctIndex: 1 },
    { text: 'What is a zero-day vulnerability?', options: ['A bug fixed within 24 hours', 'Unknown vulnerability with no patch available', 'A vulnerability on day zero of release', 'A minor security issue'], correctIndex: 1 },
    { text: 'What is encryption?', options: ['Deleting sensitive data', 'Converting data into a coded format to prevent unauthorized access', 'A data backup method', 'A password manager'], correctIndex: 1 },
  ],
};

function getQuestionsForTest(testId: string): Question[] {
  const bank = QUESTION_BANK[testId];
  if (bank && bank.length >= 3) return bank.slice(0, 5);
  // Fallback questions for any test
  return [
    { text: 'What concept is most relevant to this skill?', options: ['Best practices', 'Fundamentals', 'Advanced patterns', 'Tooling'], correctIndex: 1 },
    { text: 'How do you validate expertise in this area?', options: ['Practical experience', 'Certification', 'Project portfolio', 'All of the above'], correctIndex: 3 },
    { text: 'What is the primary benefit of mastering this skill?', options: ['Higher rates', 'More opportunities', 'Better quality work', 'All of the above'], correctIndex: 3 },
  ];
}

type TestPhase = 'intro' | 'taking' | 'grading' | 'complete' | 'blocked';

export function SkillTestPage() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [test, setTest] = useState<SkillTest | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [phase, setPhase] = useState<TestPhase>('intro');
  const [timeLeft, setTimeLeft] = useState(0);
  const [score, setScore] = useState(0);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eligibilityLoaded, setEligibilityLoaded] = useState(false);
  const [eligibilityAllowed, setEligibilityAllowed] = useState(true);
  const [blockedMsg, setBlockedMsg] = useState<string | null>(null);
  const [violationCount, setViolationCount] = useState(0);
  const [showViolationWarning, setShowViolationWarning] = useState(false);
  const [cooldownNotice, setCooldownNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!testId) return;
    const found = AVAILABLE_SKILL_TESTS.find((t) => t.id === testId);
    if (found) {
      setTest(found);
      const qs = getQuestionsForTest(testId);
      setQuestions(qs);
      setTimeLeft(found.time_limit_minutes * 60);
      setAnswers(new Array(qs.length).fill(-1));
    } else {
      setError('Test not found');
    }
  }, [testId]);

  // Anti-cheat: enforce eligibility (24h retry after fail, 7d ban on cheating,
  // permanent ban on repeated cheating) before the user can start.
  useEffect(() => {
    if (!test || !user || !testId) return;
    (async () => {
      const res = await skillTestAttemptService.getEligibility(user.id, testId);
      setEligibilityLoaded(true);
      setEligibilityAllowed(res.allowed);
      setViolationCount(res.attempt?.violations ?? 0);
      if (!res.allowed && res.message) setBlockedMsg(res.message);
    })();
  }, [test, user, testId]);

  // Anti-cheat: while the test is live, block copy/paste and detect tab-switch
  // or window blur. Every violation is recorded server-side; after 3 strikes
  // the attempt is banned for 7 days.
  useEffect(() => {
    if (phase !== 'taking') return;
    let lastViolationAt = 0;
    const record = async (_source: 'copy' | 'paste' | 'cut' | 'tab-switch' | 'blur') => {
      const now = Date.now();
      if (now - lastViolationAt < 4000) return; // debounce rapid-fire events
      lastViolationAt = now;
      if (!user || !testId) return;
      const res = await skillTestAttemptService.recordViolation(user.id, testId);
      setViolationCount(res.violations);
      if (res.banned) {
        setBlockedMsg(
          res.permanent
            ? 'Test auto-submitted: repeated policy violations (copy-paste / tab-switching) across multiple attempts. This test is now PERMANENTLY locked for your account.'
            : `Test auto-submitted: ${MAX_VIOLATIONS_BEFORE_BAN} policy violations detected (copy-paste / tab-switching). You are banned from this test for 7 days.`
        );
        setPhase('blocked');
      } else {
        setShowViolationWarning(true);
      }
    };
    const onCopy = (e: ClipboardEvent) => { e.preventDefault(); void record('copy'); };
    const onCut = (e: ClipboardEvent) => { e.preventDefault(); void record('cut'); };
    const onPaste = (e: ClipboardEvent) => { e.preventDefault(); void record('paste'); };
    // Only visibilitychange (true tab-switch) counts as a violation — window blur
    // would false-positive on DevTools / OS notifications.
    const onVisibility = () => { if (document.hidden) void record('tab-switch'); };
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [phase, user, testId]);

  // Timer countdown
  useEffect(() => {
    if (phase !== 'taking' || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleSubmitRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, timeLeft]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleStart = async () => {
    if (!user || !testId) return;
    await skillTestAttemptService.startAttempt(user.id, testId);
    setViolationCount(0);
    setShowViolationWarning(false);
    setPhase('taking');
  };

  const handleAnswer = (index: number) => {
    const newAnswers = [...answers];
    newAnswers[currentQuestion] = index;
    setAnswers(newAnswers);
  };

  const handleNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    }
  };

  const handlePrev = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const handleSubmitRef = useRef<() => Promise<void>>(null!);

const handleSubmit = async () => {
    setPhase('grading');
    // Calculate score
    let correct = 0;
    questions.forEach((q, i) => {
      if (answers[i] === q.correctIndex) correct++;
    });
    const finalScore = Math.round((correct / questions.length) * 100);
    setScore(finalScore);
    setPhase('complete');

    // Anti-cheat: register the attempt outcome (fail → 24h cooldown)
    if (test && user && testId) {
      await skillTestAttemptService.completeAttempt(user.id, testId, finalScore >= test.passing_score);
      if (finalScore < test.passing_score) {
        setCooldownNotice('You can retry this test after 24 hours.');
      }
    }

    // Record result if passed
    if (test && user && finalScore >= test.passing_score) {
      setRecording(true);
      const result = await skillCertificationService.recordResult(
        user.id,
        test.skill,
        test.difficulty as any,
        correct,
        questions.length
      );
      if (!result.success) {
        setError(result.error || 'Failed to save certification');
      }
      setRecording(false);
    }
  };

  handleSubmitRef.current = handleSubmit;

  if (error && !test) {
    return (
      <div className="max-w-2xl mx-auto mt-8 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">Test Not Found</h2>
        <p className="text-slate-500 mb-6">{error}</p>
        <button onClick={() => navigate('/dashboard/certifications')} className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700">
          Back to Certifications
        </button>
      </div>
    );
  }

  if (!test) {
    return <LoadingSkeleton variant="full-page" />;
  }

  const levelInfo = CERTIFICATION_LEVELS[test.difficulty];
  const passed = score >= test.passing_score;
  const answeredCount = answers.filter((a) => a >= 0).length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigate('/dashboard/certifications')}
        className="flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-600 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Certifications
      </button>

      {/* Blocked Phase (anti-cheat / cooldown) */}
      {phase === 'blocked' && (
        <div className="bg-white rounded-2xl border border-red-200 p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Test Blocked</h1>
          <p className="text-slate-600 mb-6 max-w-md mx-auto">
            {blockedMsg || 'You are not eligible to take this test right now.'}
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => navigate('/dashboard/certifications')}
              className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors"
            >
              Back to Certifications
            </button>
          </div>
        </div>
      )}

      {/* Intro Phase */}
      {phase === 'intro' && !eligibilityLoaded && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mx-auto" />
          <p className="text-slate-500 mt-4">Checking test eligibility…</p>
        </div>
      )}

      {/* Intro Phase — blocked by eligibility */}
      {phase === 'intro' && eligibilityLoaded && !eligibilityAllowed && (
        <div className="bg-white rounded-2xl border border-red-200 p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-6">
            <XCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Test Not Available</h1>
          <p className="text-slate-600 mb-6 max-w-md mx-auto">{blockedMsg}</p>
          <button
            onClick={() => navigate('/dashboard/certifications')}
            className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors"
          >
            Back to Certifications
          </button>
        </div>
      )}

      {/* Intro Phase */}
      {phase === 'intro' && eligibilityLoaded && eligibilityAllowed && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <div className={`w-16 h-16 rounded-2xl ${levelInfo.bgColor} flex items-center justify-center mx-auto mb-6`}>
            <Award className={`w-8 h-8 ${levelInfo.color}`} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{test.skill}</h1>
          <p className="text-slate-500 mb-6">{test.description}</p>
          <div className="grid grid-cols-3 gap-4 mb-8 max-w-sm mx-auto">
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="text-lg font-bold text-slate-900">{test.question_count}</p>
              <p className="text-xs text-slate-500">Questions</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="text-lg font-bold text-slate-900">{test.time_limit_minutes}</p>
              <p className="text-xs text-slate-500">Minutes</p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl">
              <p className="text-lg font-bold text-slate-900">{test.passing_score}%</p>
              <p className="text-xs text-slate-500">Passing</p>
            </div>
          </div>
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${levelInfo.bgColor} ${levelInfo.color} mb-6`}>
            {levelInfo.icon} {levelInfo.label}
          </div>

          {/* Anti-cheat policy notice */}
          <div className="max-w-md mx-auto mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-left">
            <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-1.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> Test Integrity Rules
            </p>
            <ul className="text-[11px] text-amber-700 space-y-1 leading-relaxed">
              <li>• Copy-paste and tab-switching are <b>prohibited</b>. This test is under observation.</li>
              <li>• {MAX_VIOLATIONS_BEFORE_BAN} violations → automatic fail + <b>7-day ban</b>.</li>
              <li>• Failed test → retry allowed after <b>24 hours</b>.</li>
              <li>• Repeated cheating → <b>permanent ban</b> from this test.</li>
            </ul>
          </div>

          <button onClick={handleStart} className="w-full max-w-xs py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors">
            Start Test
          </button>
        </div>
      )}

      {/* Taking Phase */}
      {phase === 'taking' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8">
          {/* Anti-cheat observation banner */}
          <div className={`mb-6 flex items-start gap-2.5 p-3 rounded-xl border ${showViolationWarning ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'} transition-colors`}>
            {showViolationWarning ? (
              <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            )}
            <div className="text-[11px] leading-relaxed">
              {showViolationWarning ? (
                <p className="text-red-700 font-semibold">
                  Violation recorded ({violationCount}/{MAX_VIOLATIONS_BEFORE_BAN}). Copy-paste & tab-switching are prohibited. {MAX_VIOLATIONS_BEFORE_BAN} violations = 7-day ban.
                </p>
              ) : (
                <p className="text-amber-700 font-medium">
                  🔒 Test under observation. Copy-paste & tab-switching are prohibited — {MAX_VIOLATIONS_BEFORE_BAN} violations will auto-fail this test and ban you for 7 days.
                </p>
              )}
            </div>
          </div>
          {/* Progress & Timer */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-500">Question {currentQuestion + 1} of {questions.length}</span>
              <span className="text-xs text-slate-400">({answeredCount}/{questions.length} answered)</span>
            </div>
            <div className={`flex items-center gap-2 text-sm font-medium ${timeLeft < 60 ? 'text-red-600' : 'text-slate-600'}`}>
              <Clock className="w-4 h-4" />
              {formatTime(timeLeft)}
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-slate-100 rounded-full h-2 mb-6">
            <div className="bg-emerald-600 h-2 rounded-full transition-all" style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
          </div>

          {/* Question */}
          <h2 className="text-lg font-semibold text-slate-900 mb-6">
            {questions[currentQuestion]?.text}
          </h2>

          {/* Options */}
          <div className="space-y-3 mb-8">
            {questions[currentQuestion]?.options.map((option, idx) => (
              <button
                key={idx}
                onClick={() => handleAnswer(idx)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  answers[currentQuestion] === idx
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    answers[currentQuestion] === idx
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {String.fromCharCode(65 + idx)}
                  </div>
                  <span className="text-slate-800">{option}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={handlePrev}
              disabled={currentQuestion === 0}
              className="px-6 py-2.5 border border-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            {currentQuestion < questions.length - 1 ? (
              <button
                onClick={handleNext}
                className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                className="px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors"
              >
                Submit Test
              </button>
            )}
          </div>
        </div>
      )}

      {/* Complete Phase */}
      {phase === 'complete' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
            passed ? 'bg-emerald-100' : 'bg-red-100'
          }`}>
            {recording ? (
              <Loader2 className="w-10 h-10 animate-spin text-emerald-600" />
            ) : passed ? (
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            ) : (
              <XCircle className="w-10 h-10 text-red-500" />
            )}
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">
            {passed ? 'Congratulations!' : 'Keep Practicing'}
          </h2>
          <p className="text-slate-500 mb-6">
            {passed
              ? `You passed the ${test.skill} assessment!`
              : `You scored ${score}%, but needed ${test.passing_score}% to pass.`}
          </p>
          {!passed && cooldownNotice && (
            <div className="max-w-sm mx-auto mb-6 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <p className="text-xs text-amber-700 font-medium flex items-center justify-center gap-1.5">
                <Clock className="w-4 h-4 flex-shrink-0" /> {cooldownNotice}
              </p>
            </div>
          )}
          <div className="flex items-center justify-center gap-2 mb-8">
            <span className="text-4xl font-bold text-slate-900">{score}%</span>
            <span className="text-slate-400">Score</span>
          </div>
          {passed && (
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${levelInfo.bgColor} ${levelInfo.color} mb-6`}>
              <Award className="w-5 h-5" />
              {levelInfo.icon} {test.skill} — {levelInfo.label}
            </div>
          )}
          <div className="flex justify-center gap-3">
            <button
              onClick={() => navigate('/dashboard/certifications')}
              className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors"
            >
              Back to Certifications
            </button>
            {!passed && !cooldownNotice && (
              <button
                onClick={() => {
                  setPhase('intro');
                  setCurrentQuestion(0);
                  setAnswers(new Array(questions.length).fill(-1));
                  setScore(0);
                  setTimeLeft(test.time_limit_minutes * 60);
                }}
                className="px-6 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
              >
                Retry Test
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}