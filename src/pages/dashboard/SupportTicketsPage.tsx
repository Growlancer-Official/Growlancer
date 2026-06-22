import { AIChatSupport } from '../../components/AIChatSupport';

export function SupportTicketsPage() {
  return (
    <div className="h-[calc(100vh-8rem)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">AI Support</h1>
        <p className="text-sm text-slate-500">Ask any question and get instant AI-powered help</p>
      </div>
      <AIChatSupport 
        context="freelancer" 
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
