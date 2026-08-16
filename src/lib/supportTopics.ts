// ═══════════════════════════════════════════════════════════════════════════
// AI SUPPORT — PRELOADED TOPICS (guided, role-aware)
//
// Support is DIFFERENT from the AI Assistant: no free-typing required — the
// user clicks a topic and follows a short guided flow. Each topic is a small
// decision tree; options either move to the next step, finish with a clear
// answer, or escalate to a human (disputes / money issues).
// ═══════════════════════════════════════════════════════════════════════════

export interface SupportOption {
  label: string;
  /** Index of the next step in the flow. */
  next?: number;
  /** Ends the flow with this final assistant message. */
  done?: string;
  /** Ends the flow by opening the human-escalation ticket flow. */
  escalate?: boolean;
}

export interface SupportStep {
  text: string;
  options: SupportOption[];
}

export interface SupportTopic {
  id: string;
  title: string;
  emoji: string;
  description: string;
  steps: SupportStep[];
}

const verifySteps: SupportStep[] = [
  {
    text: 'Identity verification is quick (usually under a minute) and unlocks payments, escrow funding and withdrawals. What do you need help with?',
    options: [
      { label: 'How do I verify?', next: 1 },
      { label: 'My verification is stuck / pending', next: 2 },
      { label: 'My verification was rejected', next: 2 },
    ],
  },
  {
    text: 'Great — go to **Verification** in your dashboard (or tap the shield icon). Upload a clear photo of a government ID (Aadhaar, PAN, Passport or Driver\u2019s License) and your details are checked instantly. Once verified, your badge goes live in real time.',
    options: [{ label: 'Open Verification page', next: 3 }, { label: 'Still stuck — get human help', escalate: true }],
  },
  {
    text: 'Verification usually completes in seconds. If it has been more than 15 minutes, tap below to get human help — our team will check it for you.',
    options: [{ label: 'Get human help', escalate: true }],
  },
  {
    text: 'You can open the verification page from your dashboard menu anytime.',
    options: [{ label: 'Done — thanks!', done: 'You\u2019re welcome! Your verified badge and full access unlock as soon as it goes live. 🎉' }],
  },
];

export const FREELANCER_SUPPORT_TOPICS: SupportTopic[] = [
  {
    id: 'payments-withdrawals',
    title: 'Payments & Withdrawals',
    emoji: '💰',
    description: 'Wallet balance, payout fees, withdrawal time',
    steps: [
      {
        text: 'What would you like to know about payments?',
        options: [
          { label: 'When can I withdraw?', next: 1 },
          { label: 'What is the 2% payout fee?', next: 2 },
          { label: 'My payment is missing', next: 3 },
        ],
      },
      {
        text: 'Withdrawals are available from your **Wallet** once escrow payments are released to you. Funds appear in your wallet the moment a milestone is approved/released — then you can withdraw to your saved payout method (bank/UPI). Withdrawals typically arrive within 1–2 business days.',
        options: [{ label: 'Got it — thanks!', done: 'Anytime! Your wallet updates in real time — keep earning. 💪' }, { label: 'Still need help', escalate: true }],
      },
      {
        text: 'The **2% payout processing fee** is charged by the payment processor (Razorpay/PayPal) when you withdraw — it\u2019s their actual transfer cost, not a Growlancer fee, and it\u2019s shown separately before you confirm. The 5% platform commission is paid by the client, never from your earnings.',
        options: [{ label: 'Clear — thanks!', done: 'You keep 100% of every project amount — only the processor\u2019s 2% applies when you withdraw. 🎉' }, { label: 'Escalate to human', escalate: true }],
      },
      {
        text: 'If a released payment is not showing in your wallet, check your transaction history first — releases post in real time. If it\u2019s still missing after a few minutes, tap below and our team will investigate immediately.',
        options: [{ label: 'Investigate now', escalate: true }],
      },
    ],
  },
  {
    id: 'contracts-escrow',
    title: 'Contracts & Escrow',
    emoji: '📋',
    description: 'Milestones, funding, auto-release',
    steps: [
      {
        text: 'What would you like to know about your contracts?',
        options: [
          { label: 'How does escrow + auto-release work?', next: 1 },
          { label: 'Client hasn\u2019t funded escrow yet', next: 2 },
          { label: 'How do milestones release?', next: 1 },
        ],
      },
      {
        text: 'When a client funds a contract, the full amount sits in **Growlancer Escrow** — protected for both sides. Once you deliver, the client gets a review window (default 72h). If they don\u2019t respond in time, the escrow **auto-releases** to your wallet — a client can never hold your payment hostage. You can never be paid before delivering, and the client can never be charged for work not done.',
        options: [{ label: 'Perfect — thanks!', done: 'That\u2019s the Growlancer guarantee — safe for you, safe for the client. 🛡️' }, { label: 'I need human help', escalate: true }],
      },
      {
        text: 'The freelancer only starts after escrow is funded — that\u2019s by design. Politely remind the client in the workspace chat, or if the contract has been stuck unfunded for a while, tap below and our team can nudge things along.',
        options: [{ label: 'Get human help', escalate: true }],
      },
    ],
  },
  {
    id: 'disputes',
    title: 'Disputes & Refunds',
    emoji: '⚖️',
    description: 'Raise or track a dispute',
    steps: [
      {
        text: 'Disputes are always reviewed by a human — never decided by AI. Before we go further: disputes freeze the remaining escrow so nothing moves while it\u2019s reviewed. What\u2019s happening?',
        options: [
          { label: 'I want to raise a dispute', escalate: true },
          { label: 'My dispute is in review — when?', next: 1 },
        ],
      },
      {
        text: 'Dispute reviews are handled by our team and typically take 1–3 business days. You\u2019ll see live status updates in the dispute panel. If you\u2019ve been waiting longer, tap below and we\u2019ll prioritise it.',
        options: [{ label: 'Check my dispute now', escalate: true }],
      },
    ],
  },
  {
    id: 'verification',
    title: 'Identity Verification',
    emoji: '🛡️',
    description: 'KYC, verified badge, unlocks',
    steps: verifySteps,
  },
  {
    id: 'premium',
    title: 'Freelancer Premium',
    emoji: '👑',
    description: '₹299/month plan, AI tools, cancel anytime',
    steps: [
      {
        text: 'Freelancer Premium is **₹299/month, flat** — optional, cancel anytime. It unlocks unlimited AI writing, the AI assistant, profile optimization and advanced analytics. It never affects your packages, ranking or visibility — everything stays merit-based.',
        options: [
          { label: 'How do I subscribe?', next: 1 },
          { label: 'How do I cancel?', next: 1 },
          { label: 'Billing problem', escalate: true },
        ],
      },
      {
        text: 'You can manage everything from the **Premium** page in your dashboard — subscribe or cancel in a couple of clicks, billing is handled right there in real time (wallet balance or Razorpay).',
        options: [{ label: 'Open Premium page', next: 2 }, { label: 'Need help with billing', escalate: true }],
      },
      {
        text: 'Open **Premium** from your dashboard menu (Crown icon) — you\u2019ll see your plan status and the manage button right there.',
        options: [{ label: 'Done — thanks!', done: 'Anytime! Premium is your choice, always. 👑' }],
      },
    ],
  },
  {
    id: 'account-security',
    title: 'Account & Security',
    emoji: '🔐',
    description: 'Login, email verification, security',
    steps: [
      {
        text: 'What\u2019s going on with your account?',
        options: [
          { label: 'I can\u2019t log in / forgot password', next: 1 },
          { label: 'Email verification issues', next: 1 },
          { label: 'Something else', escalate: true },
        ],
      },
      {
        text: 'Use **Forgot password** on the login screen to reset your password instantly. For email verification, tap the resend link in the app — if it still doesn\u2019t arrive, check spam. Still stuck? Our team can help.',
        options: [{ label: 'Get human help', escalate: true }],
      },
    ],
  },
];

export const CLIENT_SUPPORT_TOPICS: SupportTopic[] = [
  {
    id: 'payments-refunds',
    title: 'Payments & Refunds',
    emoji: '💳',
    description: 'Fees, escrow funding, refunds',
    steps: [
      {
        text: 'What would you like to know about payments?',
        options: [
          { label: 'What are the fees?', next: 1 },
          { label: 'How do I request a refund?', next: 2 },
          { label: 'My payment failed / charged twice', next: 3 },
        ],
      },
      {
        text: 'Clients pay **the package price + a flat 5% platform fee** — that\u2019s the only platform charge, and it\u2019s shown clearly before you pay. The freelancer receives 100% of the package price. When you withdraw from your wallet later, the payment processor\u2019s 2% transfer fee applies separately — that\u2019s their cost, passed through at cost.',
        options: [{ label: 'Clear — thanks!', done: 'Simple and transparent — that\u2019s the Growlancer promise. 🎉' }, { label: 'Escalate to human', escalate: true }],
      },
      {
        text: 'Refunds are available for work **not yet delivered or approved** — just open the contract workspace and request a refund. Funded escrow is returned minus any platform fees already incurred. Once work is delivered and approved, payment is final unless there\u2019s verified fraud or a clear Terms violation (our dispute team handles that fairly).',
        options: [{ label: 'How do disputes work?', next: 3 }, { label: 'Open my contract', next: 3 }, { label: 'Need human help', escalate: true }],
      },
      {
        text: 'Disputes are reviewed by a **human team** (never AI) with full evidence — files, chat, and the audit trail. Raise it from the contract workspace; the decision is binding and fair.',
        options: [{ label: 'Got it — thanks!', done: 'You\u2019re protected at every step. 🛡️' }],
      },
    ],
  },
  {
    id: 'hiring-contracts',
    title: 'Hiring & Contracts',
    emoji: '📋',
    description: 'Packages, milestones, escrow funding',
    steps: [
      {
        text: 'What would you like to know about hiring?',
        options: [
          { label: 'How do packages & escrow work?', next: 1 },
          { label: 'I need to fund escrow', next: 2 },
          { label: 'Auto-release — what if I\u2019m late?', next: 1 },
        ],
      },
      {
        text: 'Freelancers offer **3 packages (Basic / Standard / Premium)** with add-ons. When you order, the price is locked into escrow from the freelancer\u2019s published listing. You fund escrow once, the freelancer works, you review the delivery — if you\u2019re happy (or don\u2019t respond within the review window, default 72h), the payment releases. Your money is never at risk for work not done.',
        options: [{ label: 'Perfect — thanks!', done: 'Safe for you, fair for the freelancer. 🎉' }, { label: 'More questions', escalate: true }],
      },
      {
        text: 'Open the contract workspace and tap **Fund Escrow** — the payment is protected until you approve the delivery. You can pay by UPI, card, net banking or wallet.',
        options: [{ label: 'Open workspace', next: 3 }, { label: 'Payment problem', escalate: true }],
      },
      {
        text: 'You can open the contract from your **Contracts** page — the Fund Escrow button is right there.',
        options: [{ label: 'Done — thanks!', done: 'Anytime! Happy hiring. 🚀' }],
      },
    ],
  },
  {
    id: 'disputes',
    title: 'Disputes',
    emoji: '⚖️',
    description: 'Raise or track a dispute',
    steps: [
      {
        text: 'Disputes are always reviewed by a **human** — never AI. Escrow freezes while it\u2019s reviewed so nothing moves unfairly. What\u2019s happening?',
        options: [
          { label: 'I want to raise a dispute', escalate: true },
          { label: 'My dispute is in review — when?', next: 1 },
        ],
      },
      {
        text: 'Reviews typically take 1–3 business days with live status updates in the dispute panel. If you\u2019ve waited longer, tap below and we\u2019ll prioritise it.',
        options: [{ label: 'Check my dispute now', escalate: true }],
      },
    ],
  },
  {
    id: 'verification',
    title: 'Identity Verification',
    emoji: '🛡️',
    description: 'KYC, verified badge, unlocks',
    steps: verifySteps,
  },
  {
    id: 'finding-talent',
    title: 'Finding Freelancers',
    emoji: '🔍',
    description: 'AI matching, invites, proposals',
    steps: [
      {
        text: 'What would you like to know about finding talent?',
        options: [
          { label: 'How does AI matching work?', next: 1 },
          { label: 'How do invites work?', next: 1 },
        ],
      },
      {
        text: 'AI matching scores freelancers purely on merit — category, skills, experience and availability (never paid boosts). You can also invite freelancers directly, and every proposal comes with a cover message you can compare side by side.',
        options: [{ label: 'Great — thanks!', done: 'Matching is always merit-based — the best freelancer for your project wins. 🎯' }, { label: 'I need human help', escalate: true }],
      },
    ],
  },
];
