import { useState } from 'react';
import { Bot, Headphones } from 'lucide-react';
import { InfoTip } from '../../components/InfoTip';
import { AIChatSupport } from '../../components/AIChatSupport';
import { FREELANCER_SUPPORT_TOPICS } from '../../lib/supportTopics';

type Tab = 'assistant' | 'support';

export function AIAssistantPage() {
  const [tab, setTab] = useState<Tab>('assistant');

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Tabs — AI Assistant and AI Support are TWO different chats, always separate */}
      <div className="mb-3 flex items-center gap-3">
        <button
          onClick={() => setTab('assistant')}
          className={`inline-flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
            tab === 'assistant'
              ? 'bg-emerald-600 text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:border-emerald-300'
          }`}
        >
          <Bot className="w-4 h-4" />
          AI Assistant
        </button>
        <button
          onClick={() => setTab('support')}
          className={`inline-flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
            tab === 'support'
              ? 'bg-emerald-600 text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:border-emerald-300'
          }`}
        >
          <Headphones className="w-4 h-4" />
          AI Support
        </button>
      </div>

      {tab === 'support' && (
        <InfoTip title="Support vs. AI Assistant" text="This is Growlancer Support — for payments, escrow, verification, contracts, disputes and account issues. Pick a topic below and follow the guided flow; for anything else use the{' '} AI Assistant tab. The two chats stay completely separate." />
      )}

      <div className="flex-1 min-h-0">
        {tab === 'assistant' ? (
          <AIChatSupport context="freelancer" chatMode="assistant" title="Freelancer AI Assistant" />
        ) : (
          <AIChatSupport
            context="freelancer"
            chatMode="support"
            title="Freelancer AI Support"
            supportTopics={FREELANCER_SUPPORT_TOPICS}
          />
        )}
      </div>
    </div>
  );
}
