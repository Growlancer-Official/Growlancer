import { AIChatSupport } from '../../components/AIChatSupport';
import { TipNote } from '../../components/TipNote';

export function SupportTicketsPage() {
  return (
    <div className="h-[calc(100vh-8rem)]">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">AI Support</h1>
        <p className="text-sm text-slate-500">Ask any question and get instant AI-powered help</p>
      </div>
      <TipNote tone="info" title="Support vs. AI Assistant" compact className="mb-3">
        This is <strong>Growlancer Support</strong> — for help with payments, escrow, verification, contracts and account issues. The <strong>AI Assistant</strong> (in your dashboard) is separate — it helps you with proposals, pricing and growing your freelance career. The two chats never mix.
      </TipNote>
      <AIChatSupport 
        context="freelancer" 
        chatMode="support"
        title="Freelancer AI Support"
        ticketContext={{
          category: 'general',
          priority: 'normal',
          subject: 'Support Request',
          description: 'User is seeking help from AI support'
        }}
      />
    </div>
  );
}
