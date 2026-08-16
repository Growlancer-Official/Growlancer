import { useState } from 'react';
import { Bot, Headphones } from 'lucide-react';
import { AIChatSupport } from '../../components/AIChatSupport';
import { TipNote } from '../../components/TipNote';
import { FREELANCER_SUPPORT_TOPICS } from '../../lib/supportTopics';

type Tab = 'assistant' | 'support';

export function AIAssistantPage() {
  const [tab, setTab] = useState<Tab>('assistant');

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Tabs — AI Assistant and AI Support are TWO different chats, always separate */}
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => setTab('assistant')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
            tab === 'assistant'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
              : 'bg-white text-slate-600 border border-slate-200 hover:border-emerald-300'
          }`}
        >
          <Bot className="w-4 h-4" />
          AI Assistant
        </button>
        <button
          onClick={() => setTab('support')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
            tab === 'support'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
              : 'bg-white text-slate-600 border border-slate-200 hover:border-emerald-300'
          }`}
        >
          <Headphones className="w-4 h-4" />
          AI Support
        </button>
      </div>

      {tab === 'support' && (
        <TipNote tone="info" title="Support vs. AI Assistant" compact className="mb-3">
          This is <strong>Growlancer Support</strong> — for payments, escrow, verification, contracts, disputes and
          account issues. Pick a topic below and follow the guided flow; for anything else use the{' '}
          <strong>AI Assistant</strong> tab. The two chats stay completely separate.
        </TipNote>
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
            ticketContext={{
              category: 'general',
              priority: 'normal',
              subject: 'Support Request',
              description: 'User is seeking help from AI support',
            }}
          />
        )}
      </div>
    </div>
  );
}
