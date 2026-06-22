import { AIChatSupport } from '../components/AIChatSupport';

export function ClientAIAssistantPage() {
  return (
    <div className="h-[calc(100vh-8rem)]">
      <AIChatSupport context="client" title="Client AI Assistant" />
    </div>
  );
}
