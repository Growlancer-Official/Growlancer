import { AIChatSupport } from '../components/AIChatSupport';

export function ClientAIAssistantPage() {
  return (
    <div className="h-[calc(100vh-8rem)]">
      <AIChatSupport context="client" chatMode="assistant" title="Client AI Assistant" />
    </div>
  );
}
