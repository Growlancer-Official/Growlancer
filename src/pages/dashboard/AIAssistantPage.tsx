import { AIChatSupport } from '../../components/AIChatSupport';

export function AIAssistantPage() {
  return (
    <div className="h-[calc(100vh-8rem)]">
      <AIChatSupport context="freelancer" chatMode="assistant" title="Freelancer AI Assistant" />
    </div>
  );
}
