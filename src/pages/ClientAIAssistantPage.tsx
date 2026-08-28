import { useState } from 'react';
import { Bot, Headphones } from 'lucide-react';
import { AIChatSupport } from '../components/AIChatSupport';
import { TipNote } from '../components/TipNote';
import { CLIENT_SUPPORT_TOPICS } from '../lib/supportTopics';

type Tab = 'assistant' | 'support';

export function ClientAIAssistantPage() {
  const [tab, setTab] = useState<Tab>('assistant');

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Tabs — AI Assistant and AI Support are TWO different chats, always separate */}
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => setTab('assistant')}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
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
          className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
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
        <TipNote tone="info" title="Support vs. AI Assistant" compact className="mb-3">
          This is <strong>Growlancer Support</strong> — for payments, refunds, escrow, verification, disputes and
          hiring issues. Pick a topic below and follow the guided flow; for anything else use the{' '}
          <strong>AI Assistant</strong> tab. The two chats stay completely separate.
        </TipNote>
      )}

      <div className="flex-1 min-h-0">
        {tab === 'assistant' ? (
          <AIChatSupport context="client" chatMode="assistant" title="Client AI Assistant" />
        ) : (
          <AIChatSupport
            context="client"
            chatMode="support"
            title="Client AI Support"
            supportTopics={CLIENT_SUPPORT_TOPICS}
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
