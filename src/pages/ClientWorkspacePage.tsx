import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase, dbFunctions } from '../lib/supabase'
import { messagesService } from '../lib/messages'
import { fileUploadService } from '../lib/fileUpload'
import { EscrowPayPalPayment } from '../components/EscrowPayPalPayment'
import {
  getMilestoneProgress,
  MilestoneItem,
} from '../lib/contractMilestones'
import {
  AlertCircle,
  Briefcase,
  Check,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Download,
  FileText,
  Laptop,
  Loader2,
  Lock,
  MessageSquare,
  Paperclip,
  Play,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

interface Contract {
  id: string
  client_id: string
  freelancer_id: string
  project_id: string
  status: string
  escrow_amount: number
  escrow_funded: boolean
  created_at: string
  updated_at: string
  escrow_released: boolean
  escrow_refunded: boolean
  is_disputed: boolean
  dispute_reason: string | null
  dispute_description: string | null
  dispute_initiated_by: string | null
  dispute_escalated: boolean
  dispute_resolved: boolean
  freelancer?: {
    id: string
    full_name: string
    avatar_url: string | null
  }
  project?: {
    id: string
    title: string
  }
}

interface Message {
  id: string
  contract_id: string
  sender_id: string
  content: string
  created_at: string
  sender?: {
    id: string
    full_name: string
    avatar_url: string | null
  }
}

interface SharedTask {
  id: string
  contract_id: string
  title: string
  status: string
  created_by: string
  created_at: string
}

type NotesSaveStatus = 'saved' | 'unsaved' | 'saving'
type ActiveTab = 'chat' | 'canvas' | 'milestones'

export function ClientWorkspacePage() {
  const { user } = useAuth()
  const { contractId: routeContractId } = useParams<{ contractId: string }>()
  const [searchParams] = useSearchParams()
  const contractId = searchParams.get('contract') || searchParams.get('contractId') || routeContractId || undefined
  const [contracts, setContracts] = useState<Contract[]>([])
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [contractFiles, setContractFiles] = useState<any[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileDescription, setFileDescription] = useState('')
  const [showDisputeModal, setShowDisputeModal] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const [disputeDescription, setDisputeDescription] = useState('')
  const [submittingDispute, setSubmittingDispute] = useState(false)
  const [showFundEscrow, setShowFundEscrow] = useState(false)
  const [releasingEscrow, setReleasingEscrow] = useState(false)
  const [activeTab, setActiveTab] = useState<ActiveTab>('chat')
  const [taskInput, setTaskInput] = useState('')
  const [notesText, setNotesText] = useState('')
  const [isTypingNotes, setIsTypingNotes] = useState(false)
  const [notesSaveStatus, setNotesSaveStatus] = useState<NotesSaveStatus>('saved')

  const chatMessagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const refreshContract = useCallback(async (contractId: string) => {
    const { data, error } = await supabase
      .from('contracts')
      .select('*, freelancer:freelancer_id(id, full_name, avatar_url), project:project_id(id, title)')
      .eq('id', contractId)
      .single()
    if (!error && data) {
      setSelectedContract(prev => prev?.id === contractId ? data as unknown as Contract : prev)
    }
  }, [])

  useEffect(() => {
    if (!user) return

    const fetchContracts = async () => {
      const { data: contractsData, error: contractsError } = await supabase
        .from('contracts')
        .select('*, freelancer:freelancer_id(id, full_name, avatar_url), project:project_id(id, title)')
        .eq('client_id', user.id)
        .in('status', ['pending', 'active', 'in_progress', 'disputed'])
        .order('created_at', { ascending: false })

      if (!contractsError && contractsData) {
        setContracts(contractsData as unknown as Contract[])
        if (contractId) {
          const found = contractsData.find((c: any) => c.id === contractId)
          if (found) setSelectedContract(found as unknown as Contract)
        } else if (contractsData.length > 0) {
          setSelectedContract(contractsData[0] as unknown as Contract)
          if (contractsData[0]?.id !== contractId) {
            window.history.replaceState(null, '', `/client/workspace/${contractsData[0].id}`)
          }
        }
      }
      setLoading(false)
    }
    void fetchContracts()
  }, [user, contractId])

  const fetchMessages = useCallback(async () => {
    if (!selectedContract || !user) return
    const { data, error } = await supabase
      .from('messages')
      .select('*, sender:sender_id(id, full_name, avatar_url)')
      .eq('contract_id', selectedContract.id)
      .order('created_at', { ascending: true })
    if (!error && data) {
      setMessages(data as unknown as Message[])
      await messagesService.markContractAsRead(selectedContract.id, user.id)
    }
  }, [selectedContract, user])

  useEffect(() => {
    if (!selectedContract) return
    void fetchMessages()
  }, [selectedContract, fetchMessages])

  useEffect(() => {
    if (!selectedContract || !user) return

    const channel = supabase
      .channel(`client-workspace-${selectedContract.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `contract_id=eq.${selectedContract.id}`,
        },
        () => { void fetchMessages() }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contracts',
          filter: `id=eq.${selectedContract.id}`,
        },
        () => { void refreshContract(selectedContract.id) }
      )
      .subscribe()

    const escrowChannel = supabase
      .channel(`escrow-${selectedContract.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'escrow', filter: `contract_id=eq.${selectedContract.id}` }, () => {
        void refreshContract(selectedContract.id)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(escrowChannel)
    }
  }, [selectedContract, user, fetchMessages, refreshContract])

  const fetchFiles = useCallback(async () => {
    if (!selectedContract) return
    try {
      const files = await fileUploadService.getContractFiles(selectedContract.id)
      setContractFiles(files)
    } catch { /* handled silently */ }
  }, [selectedContract])

  useEffect(() => {
    if (!selectedContract) return
    void fetchFiles()

    const subChannel = fileUploadService.subscribeToContractFiles(selectedContract.id, () => {
      void fetchFiles()
    })
    return () => {
      supabase.removeChannel(subChannel)
    }
  }, [selectedContract, fetchFiles])

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedContract || !user) return
    setSendingMessage(true)
    const { error } = await supabase.from('messages').insert({
      contract_id: selectedContract.id,
      sender_id: user.id,
      content: newMessage.trim(),
    })
    if (!error) setNewMessage('')
    setSendingMessage(false)
  }

  const handleFileUpload = async () => {
    if (!selectedFile || !selectedContract || !user) return
    setUploadingFile(true)
    try {
      const result = await fileUploadService.uploadFile(
        selectedFile,
        selectedContract.id,
        fileDescription || undefined
      )
      if (result.success) {
        setSelectedFile(null)
        setFileDescription('')
        setShowUploadModal(false)
        void fetchFiles()
      }
    } catch { /* handled silently */ }
    setUploadingFile(false)
  }

  const handleDeleteFile = async (fileId: string) => {
    if (!selectedContract) return
    try {
      const result = await fileUploadService.deleteFile(fileId)
      if (result.success) void fetchFiles()
    } catch { /* handled silently */ }
  }

  const handleRaiseDispute = async () => {
    if (!selectedContract || !user || !disputeReason.trim()) return
    setSubmittingDispute(true)
    const { error } = await supabase.rpc('raise_contract_dispute' as any, {
      p_contract_id: selectedContract.id,
      p_reason: disputeReason.trim(),
      p_description: disputeDescription.trim() || null,
    })
    if (!error) {
      setShowDisputeModal(false)
      setDisputeReason('')
      setDisputeDescription('')
      void refreshContract(selectedContract.id)
    }
    setSubmittingDispute(false)
  }

  const handleReleaseEscrow = async () => {
    if (!selectedContract || !user) return
    setReleasingEscrow(true)
    const result = await dbFunctions.releaseEscrow(selectedContract.id, user.id)
    if (result) void refreshContract(selectedContract.id)
    setReleasingEscrow(false)
  }

  const getTasks = useCallback(async (): Promise<SharedTask[]> => {
    if (!selectedContract) return []
    const { data, error } = await supabase
      .from('workspace_tasks')
      .select('*')
      .eq('contract_id', selectedContract.id)
      .order('created_at', { ascending: true })
    if (!error && data) return data as unknown as SharedTask[]
    return []
  }, [selectedContract])

  const handleAddTask = async () => {
    if (!taskInput.trim() || !selectedContract || !user) return
    const { error } = await supabase.from('workspace_tasks').insert({
      contract_id: selectedContract.id,
      title: taskInput.trim(),
      status: 'todo',
      created_by: user.id,
    })
    if (!error) setTaskInput('')
  }

  const handleUpdateTaskStatus = async (taskId: string, newStatus: string) => {
    await supabase.from('workspace_tasks').update({ status: newStatus }).eq('id', taskId)
  }

  const handleDeleteTask = async (taskId: string) => {
    await supabase.from('workspace_tasks').delete().eq('id', taskId)
  }

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNotesText(e.target.value)
    setIsTypingNotes(true)
    setNotesSaveStatus('unsaved')
  }

  const notesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debouncedUpdateNotes = useCallback(
    async (contractId: string, content: string) => {
      if (notesTimeoutRef.current) clearTimeout(notesTimeoutRef.current)
      notesTimeoutRef.current = setTimeout(async () => {
        setNotesSaveStatus('saving')
        try {
          const { data: existing } = await supabase
            .from('workspace_notes')
            .select('id')
            .eq('contract_id', contractId)
            .maybeSingle()

          if (existing) {
            await supabase.from('workspace_notes').update({ content, updated_at: new Date().toISOString() }).eq('id', existing.id)
          } else {
            await supabase.from('workspace_notes').insert({ contract_id: contractId, content, created_by: user?.id || '' })
          }
          setNotesSaveStatus('saved')
        } catch { setNotesSaveStatus('saved') }
        setIsTypingNotes(false)
      }, 1500)
    },
    [user]
  )

  useEffect(() => {
    if (!selectedContract) return
    const fetchNotes = async () => {
      const { data } = await supabase
        .from('workspace_notes')
        .select('content')
        .eq('contract_id', selectedContract.id)
        .maybeSingle()
      if (data) setNotesText((data as unknown as { content: string }).content || '')
    }
    void fetchNotes()

    const channel = supabase
      .channel(`notes-${selectedContract.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_notes', filter: `contract_id=eq.${selectedContract.id}` }, (payload: any) => {
        if (payload.new && !isTypingNotes) setNotesText(payload.new.content || '')
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [selectedContract, isTypingNotes])

  useEffect(() => {
    if (!selectedContract || !isTypingNotes) return
    void debouncedUpdateNotes(selectedContract.id, notesText)
  }, [notesText, selectedContract, isTypingNotes, debouncedUpdateNotes])

  const getTimelineEvents = () => {
    if (!selectedContract) return []
    const events: { date: string; title: string; description: string; icon: string; status: 'completed' | 'current' | 'pending' }[] = []

    events.push({
      date: new Date(selectedContract.created_at).toLocaleDateString(),
      title: 'Contract Created',
      description: 'Work agreement established',
      icon: 'file',
      status: 'completed',
    })

    if (selectedContract.escrow_funded) {
      events.push({
        date: '',
        title: 'Escrow Funded',
        description: `Payment of ${formatCurrency(selectedContract.escrow_amount)} secured in escrow`,
        icon: 'dollar',
        status: 'completed',
      })
    } else {
      events.push({
        date: '',
        title: 'Fund Escrow',
        description: 'Client needs to fund the escrow to begin work',
        icon: 'dollar',
        status: 'current',
      })
    }

    if (selectedContract.escrow_released) {
      events.push({
        date: '',
        title: 'Payment Released',
        description: 'Funds released to freelancer',
        icon: 'check',
        status: 'completed',
      })
    } else if (selectedContract.escrow_funded) {
      events.push({
        date: '',
        title: 'Release Payment',
        description: 'Release escrow funds upon completion',
        icon: 'check',
        status: 'current',
      })
    } else {
      events.push({
        date: '',
        title: 'Release Payment',
        description: 'Funds will be released upon completion',
        icon: 'check',
        status: 'pending',
      })
    }

    if (selectedContract.is_disputed) {
      events.push({
        date: '',
        title: 'Dispute Active',
        description: selectedContract.dispute_reason || 'Issue reported',
        icon: 'alert',
        status: 'current',
      })
    }

    return events
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const milestoneProgress = selectedContract ? getMilestoneProgress((selectedContract as any).milestones) : { completed: 0, total: 0, percent: 0, milestones: [] }
  const milestones: MilestoneItem[] = Array.isArray((selectedContract as any)?.milestones)
    ? (selectedContract as any).milestones
    : typeof (selectedContract as any)?.milestones === 'string'
    ? (() => { try { return JSON.parse((selectedContract as any).milestones) } catch { return [] } })()
    : []
  const needsFunding = selectedContract && !selectedContract.escrow_funded && !selectedContract.escrow_released

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <Loader2 className="animate-spin h-8 w-8 text-emerald-600" />
      </div>
    )
  }

  if (!selectedContract && contracts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] text-slate-500">
        <Briefcase className="h-16 w-16 mb-4 text-slate-300" />
        <h2 className="text-2xl font-semibold mb-2">No Active Contracts</h2>
        <p>You don't have any active contracts yet.</p>
      </div>
    )
  }

  if (!selectedContract && contracts.length > 0) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <Loader2 className="animate-spin h-8 w-8 text-emerald-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Contract Sidebar */}
      <div className="lg:grid lg:grid-cols-4 gap-0">
        <div className="lg:col-span-1 bg-white border-r border-slate-200 lg:min-h-screen">
          <div className="p-4 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">Contracts</h2>
            <p className="text-sm text-slate-500 mt-1">
              {contracts.length} active contract{contracts.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="overflow-y-auto max-h-[calc(100vh-8rem)]">
            {contracts.map(contract => (
              <button
                key={contract.id}
                onClick={() => {
                  setSelectedContract(contract)
                  window.history.pushState(null, '', `/client/workspace/${contract.id}`)
                }}
                className={`w-full text-left p-4 border-b border-slate-200 hover:bg-slate-50 transition-colors ${
                  selectedContract?.id === contract.id
                    ? 'bg-emerald-50 border-l-4 border-l-emerald-500'
                    : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-slate-900 truncate">
                    {contract.project?.title || 'Untitled Project'}
                  </p>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    contract.status === 'active' || contract.status === 'in_progress'
                      ? 'bg-green-100 text-green-800'
                      : contract.status === 'disputed'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {contract.status}
                  </span>
                </div>
                <div className="flex items-center mt-2 text-sm text-slate-500">
                  <span className="truncate">
                    {contract.freelancer?.full_name || 'Unknown Freelancer'}
                  </span>
                  <span className="mx-2">•</span>
                  <span>{formatCurrency(contract.escrow_amount)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          {selectedContract && (
            <>
              {/* Header */}
              <div className="bg-white border-b border-slate-200 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-xl font-bold text-slate-900">
                      {selectedContract.project?.title || 'Workspace'}
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                      Working with{' '}
                      <span className="font-medium text-slate-700">
                        {selectedContract.freelancer?.full_name || 'Freelancer'}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {needsFunding && (
                      <button
                        onClick={() => setShowFundEscrow(true)}
                        className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
                      >
                        <DollarSign className="h-4 w-4 mr-1.5" />
                        Fund Escrow via PayPal
                      </button>
                    )}
                    {selectedContract.is_disputed && (
                      <div className="inline-flex items-center px-3 py-1.5 bg-red-50 text-red-700 rounded-lg text-sm">
                        <AlertCircle className="h-4 w-4 mr-1.5" />
                        Dispute Active
                      </div>
                    )}
                  </div>
                </div>

                {/* Tab Navigation */}
                <div className="flex items-center gap-1 mt-4 border-b border-slate-200">
                  {([
                    { id: 'chat', label: 'Chat & Assets', icon: MessageSquare },
                    { id: 'canvas', label: 'Co-Working Canvas', icon: Laptop },
                    { id: 'milestones', label: 'Milestones & Escrow', icon: ClipboardList },
                  ] as const).map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === tab.id
                          ? 'border-emerald-500 text-emerald-600'
                          : 'border-transparent text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <tab.icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat & Assets Tab */}
              {activeTab === 'chat' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
                  {/* Messages */}
                  <div className="lg:col-span-2 bg-white">
                    <div className="h-[calc(100vh-16rem)] flex flex-col">
                      <div className="flex-1 overflow-y-auto p-4 space-y-4">
                        {messages.length === 0 && (
                          <div className="flex flex-col items-center justify-center h-full text-slate-400">
                            <MessageSquare className="h-12 w-12 mb-3 opacity-50" />
                            <p>No messages yet. Start the conversation!</p>
                          </div>
                        )}
                        {messages.map(msg => (
                          <div
                            key={msg.id}
                            className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                                msg.sender_id === user?.id
                                  ? 'bg-emerald-600 text-white rounded-br-md'
                                  : 'bg-slate-100 text-slate-900 rounded-bl-md'
                              }`}
                            >
                              {msg.sender_id !== user?.id && (
                                <p className="text-xs font-medium text-slate-500 mb-1">
                                  {msg.sender?.full_name || 'Unknown'}
                                </p>
                              )}
                              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                              <p className={`text-xs mt-1 ${
                                msg.sender_id === user?.id ? 'text-emerald-200' : 'text-slate-400'
                              }`}>
                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        ))}
                        <div ref={chatMessagesEndRef} />
                      </div>

                      {/* Message Input */}
                      <div className="border-t border-slate-200 p-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setShowUploadModal(true)}
                            className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                            title="Attach file"
                          >
                            <Paperclip className="h-5 w-5" />
                          </button>
                          <input
                            type="text"
                            value={newMessage}
                            onChange={e => setNewMessage(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                void handleSendMessage()
                              }
                            }}
                            placeholder="Type your message..."
                            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                          />
                          <button
                            onClick={() => void handleSendMessage()}
                            disabled={!newMessage.trim() || sendingMessage}
                            className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {sendingMessage ? (
                              <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                              <Send className="h-5 w-5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Shared Assets */}
                  <div className="bg-slate-50 border-l border-slate-200">
                    <div className="p-4 border-b border-slate-200">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Shared Assets
                        </h3>
                        <button
                          onClick={() => setShowUploadModal(true)}
                          className="text-sm text-emerald-600 hover:text-emerald-700"
                        >
                          + Upload
                        </button>
                      </div>
                    </div>
                    <div className="overflow-y-auto max-h-[calc(100vh-20rem)]">
                      {contractFiles.length === 0 ? (
                        <div className="p-4 text-center text-slate-500 text-sm">
                          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50 text-slate-400" />
                          <p>No files shared yet</p>
                        </div>
                      ) : (
                        contractFiles.map((file: any) => (
                          <div
                            key={file.id}
                            className="p-4 border-b border-slate-200 hover:bg-slate-100 transition-colors"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-900 truncate">
                                  {file.file_name || file.name}
                                </p>
                                {file.description && (
                                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                                    {file.description}
                                  </p>
                                )}
                                <p className="text-xs text-slate-400 mt-1">
                                  {file.file_size
                                    ? `${(file.file_size / 1024).toFixed(1)} KB`
                                    : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 ml-2">
                                <a
                                  href={file.public_url || file.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 text-slate-400 hover:text-emerald-600 transition-colors"
                                  title="Download"
                                >
                                  <Download className="h-4 w-4" />
                                </a>
                                {file.uploaded_by === user?.id && (
                                  <button
                                    onClick={() => void handleDeleteFile(file.id)}
                                    className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Co-Working Canvas Tab */}
              {activeTab === 'canvas' && (
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
                  {/* Live Task Board */}
                  <div className="lg:col-span-3 bg-white border-r border-slate-200">
                    <div className="p-4 border-b border-slate-200">
                      <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" />
                        Live Task Board
                      </h3>
                    </div>
                    <div className="p-4 h-[calc(100vh-20rem)] overflow-y-auto">
                      <TasksSection
                        contractId={selectedContract.id}
                        getTasks={getTasks}
                        handleAddTask={handleAddTask}
                        handleUpdateTaskStatus={handleUpdateTaskStatus}
                        handleDeleteTask={handleDeleteTask}
                        taskInput={taskInput}
                        setTaskInput={setTaskInput}
                      />
                    </div>
                  </div>

                  {/* Collaborative Scratchpad */}
                  <div className="lg:col-span-2 bg-slate-50">
                    <div className="p-4 border-b border-slate-200">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Collaborative Scratchpad
                        </h3>
                        <span className={`text-xs flex items-center gap-1 ${
                          notesSaveStatus === 'saved'
                            ? 'text-green-600'
                            : notesSaveStatus === 'saving'
                            ? 'text-yellow-600'
                            : 'text-slate-400'
                        }`}>
                          {notesSaveStatus === 'saved' && <><Check className="h-3 w-3" /> Saved</>}
                          {notesSaveStatus === 'saving' && <><Loader2 className="h-3 w-3 animate-spin" /> Saving...</>}
                          {notesSaveStatus === 'unsaved' && 'Unsaved'}
                        </span>
                      </div>
                    </div>
                    <div className="p-4">
                      <textarea
                        value={notesText}
                        onChange={handleNoteChange}
                        placeholder="Share notes, ideas, or requirements with your freelancer..."
                        className="w-full h-[calc(100vh-24rem)] p-4 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none text-slate-900"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Milestones & Escrow Tab */}
              {activeTab === 'milestones' && (
                <div className="p-6">
                  {/* Timeline */}
                  <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">
                      Contract Timeline
                    </h3>
                    <div className="relative">
                      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />
                      {getTimelineEvents().map((event, idx) => (
                        <div key={idx} className="relative flex items-start gap-4 pb-6 last:pb-0">
                          <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center ${
                            event.status === 'completed'
                              ? 'bg-green-100'
                              : event.status === 'current'
                              ? 'bg-amber-100'
                              : 'bg-slate-100'
                          }`}>
                            {event.icon === 'file' && <FileText className={`h-4 w-4 ${event.status === 'completed' ? 'text-green-600' : 'text-slate-400'}`} />}
                            {event.icon === 'dollar' && <DollarSign className={`h-4 w-4 ${event.status === 'completed' ? 'text-green-600' : event.status === 'current' ? 'text-amber-600' : 'text-slate-400'}`} />}
                            {event.icon === 'check' && <CheckCircle2 className={`h-4 w-4 ${event.status === 'completed' ? 'text-green-600' : event.status === 'current' ? 'text-amber-600' : 'text-slate-400'}`} />}
                            {event.icon === 'alert' && <AlertCircle className="h-4 w-4 text-red-500" />}
                          </div>
                          <div className="flex-1 pt-1">
                            <h4 className={`text-sm font-semibold ${
                              event.status === 'completed'
                                ? 'text-green-700'
                                : event.status === 'current'
                                ? 'text-amber-700'
                                : 'text-slate-500'
                            }`}>
                              {event.title}
                            </h4>
                            <p className="text-sm text-slate-500 mt-0.5">{event.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Milestones */}
                  <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-slate-900">
                        Milestones
                      </h3>
                      <span className="text-sm text-slate-500">
                        {milestoneProgress.completed} of {milestoneProgress.total} completed
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2.5 mb-4">
                      <div
                        className="bg-emerald-600 h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${milestoneProgress.percent}%` }}
                      />
                    </div>
                    <div className="space-y-3">
                      {milestones.map((milestone, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                              milestone.status === 'completed'
                                ? 'border-green-500 bg-green-50'
                                : milestone.status === 'in_progress'
                                ? 'border-amber-500 bg-amber-50'
                                : 'border-slate-300'
                            }`}>
                              {milestone.status === 'completed' && <Check className="h-3 w-3 text-green-600" />}
                              {milestone.status === 'in_progress' && <Play className="h-3 w-3 text-amber-600" />}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-slate-900">
                                {milestone.title}
                              </p>
                              {milestone.description && (
                                <p className="text-xs text-slate-500 mt-0.5">
                                  {milestone.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-slate-900">
                              {formatCurrency(milestone.amount)}
                            </p>
                            <p className="text-xs text-slate-500 capitalize">
                              {milestone.status === 'in_progress' ? 'In Progress' : milestone.status}
                            </p>
                          </div>
                        </div>
                      ))}
                      {milestones.length === 0 && (
                        <p className="text-sm text-slate-500 text-center py-4">
                          No milestones defined for this contract.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Escrow Actions */}
                  <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">
                      Escrow & Payment
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 bg-slate-50 rounded-lg">
                        <p className="text-sm text-slate-500 mb-1">Total Amount</p>
                        <p className="text-2xl font-bold text-slate-900">
                          {formatCurrency(selectedContract.escrow_amount)}
                        </p>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-lg">
                        <p className="text-sm text-slate-500 mb-1">Status</p>
                        <div className="flex items-center gap-2 mt-1">
                          {selectedContract.escrow_funded ? (
                            <ShieldCheck className="h-5 w-5 text-green-500" />
                          ) : (
                            <Lock className="h-5 w-5 text-slate-400" />
                          )}
                          <p className="text-lg font-semibold text-slate-900">
                            {selectedContract.escrow_funded ? 'Funded' : 'Awaiting Funding'}
                          </p>
                        </div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-lg">
                        <p className="text-sm text-slate-500 mb-1">Contract Status</p>
                        <p className="text-lg font-semibold text-slate-900 capitalize">
                          {selectedContract.status.replace('_', ' ')}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 mt-6">
                      {needsFunding && (
                        <button
                          onClick={() => setShowFundEscrow(true)}
                          className="inline-flex items-center px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-medium"
                        >
                          <DollarSign className="h-5 w-5 mr-2" />
                          Fund Escrow via PayPal
                        </button>
                      )}
                      {selectedContract.escrow_funded && !selectedContract.escrow_released && !selectedContract.is_disputed && (
                        <button
                          onClick={() => void handleReleaseEscrow()}
                          disabled={releasingEscrow}
                          className="inline-flex items-center px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors font-medium"
                        >
                          {releasingEscrow ? (
                            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-5 w-5 mr-2" />
                          )}
                          Release Escrow
                        </button>
                      )}
                      {!selectedContract.is_disputed && selectedContract.escrow_funded && (
                        <button
                          onClick={() => setShowDisputeModal(true)}
                          className="inline-flex items-center px-6 py-3 bg-red-50 text-red-700 rounded-xl hover:bg-red-100 transition-colors font-medium"
                        >
                          <AlertCircle className="h-5 w-5 mr-2" />
                          Raise Dispute
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* File Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Upload File</h3>
              <button
                onClick={() => {
                  setShowUploadModal(false)
                  setSelectedFile(null)
                  setFileDescription('')
                }}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  File
                </label>
                <input
                  type="file"
                  onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={fileDescription}
                  onChange={e => setFileDescription(e.target.value)}
                  placeholder="Brief description of the file..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200">
              <button
                onClick={() => {
                  setShowUploadModal(false)
                  setSelectedFile(null)
                  setFileDescription('')
                }}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleFileUpload()}
                disabled={!selectedFile || uploadingFile}
                className="inline-flex items-center px-4 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors text-sm font-medium"
              >
                {uploadingFile ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-1.5" />
                )}
                Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Raise Dispute Modal */}
      {showDisputeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Raise a Dispute</h3>
              <button
                onClick={() => {
                  setShowDisputeModal(false)
                  setDisputeReason('')
                  setDisputeDescription('')
                }}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Reason <span className="text-red-500">*</span>
                </label>
                <select
                  value={disputeReason}
                  onChange={e => setDisputeReason(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
                >
                  <option value="">Select a reason...</option>
                  <option value="incomplete_work">Incomplete Work</option>
                  <option value="poor_quality">Poor Quality</option>
                  <option value="missed_deadline">Missed Deadline</option>
                  <option value="no_show">No Show / Unresponsive</option>
                  <option value="scope_disagreement">Scope Disagreement</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  value={disputeDescription}
                  onChange={e => setDisputeDescription(e.target.value)}
                  placeholder="Provide details about the issue..."
                  rows={4}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none text-slate-900"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200">
              <button
                onClick={() => {
                  setShowDisputeModal(false)
                  setDisputeReason('')
                  setDisputeDescription('')
                }}
                className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleRaiseDispute()}
                disabled={!disputeReason.trim() || submittingDispute}
                className="inline-flex items-center px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors text-sm font-medium"
              >
                {submittingDispute ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <AlertCircle className="h-4 w-4 mr-1.5" />
                )}
                Submit Dispute
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fund Escrow Modal */}
      {showFundEscrow && selectedContract && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Fund Escrow</h3>
              <button
                onClick={() => setShowFundEscrow(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-500 mb-4">
                Fund the escrow account for{' '}
                <span className="font-semibold text-slate-900">
                  {formatCurrency(selectedContract.escrow_amount)}
                </span>{' '}
                to begin working with{' '}
                <span className="font-semibold text-slate-900">
                  {selectedContract.freelancer?.full_name || 'the freelancer'}
                </span>
                . Funds are securely held and only released upon your approval.
              </p>
              <EscrowPayPalPayment
                contractId={selectedContract.id}
                amount={selectedContract.escrow_amount}
                freelancerName={selectedContract.freelancer?.full_name || 'the freelancer'}
                projectTitle={selectedContract.project?.title || 'Project'}
                onSuccess={() => {
                  setShowFundEscrow(false)
                  void refreshContract(selectedContract.id)
                }}
                onCancel={() => setShowFundEscrow(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Tasks Section Subcomponent ─── */

function TasksSection({
  contractId,
  getTasks,
  handleAddTask,
  handleUpdateTaskStatus,
  handleDeleteTask,
  taskInput,
  setTaskInput,
}: {
  contractId: string
  getTasks: () => Promise<SharedTask[]>
  handleAddTask: () => Promise<void>
  handleUpdateTaskStatus: (taskId: string, newStatus: string) => Promise<void>
  handleDeleteTask: (taskId: string) => Promise<void>
  taskInput: string
  setTaskInput: (val: string) => void
}) {
  const [tasks, setTasks] = useState<SharedTask[]>([])
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  useEffect(() => {
    void (async () => {
      const t = await getTasks()
      setTasks(t)
    })()
  }, [getTasks])

  useEffect(() => {
    const channel = supabase
      .channel(`tasks-${contractId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workspace_tasks', filter: `contract_id=eq.${contractId}` },
        async () => {
          const t = await getTasks()
          setTasks(t)
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [contractId, getTasks])

  const handleLocalAdd = async () => {
    await handleAddTask()
    const t = await getTasks()
    setTasks(t)
  }

  const handleLocalStatusChange = async (taskId: string, newStatus: string) => {
    await handleUpdateTaskStatus(taskId, newStatus)
    const t = await getTasks()
    setTasks(t)
  }

  const handleLocalDelete = async (taskId: string) => {
    await handleDeleteTask(taskId)
    const t = await getTasks()
    setTasks(t)
  }

  const handleDragStart = (idx: number) => setDragIndex(idx)
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === idx) return
    const reordered = [...tasks]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(idx, 0, moved)
    setTasks(reordered)
    setDragIndex(idx)
  }
  const handleDragEnd = () => {
    setDragIndex(null)
  }

  return (
    <div>
      {/* Add Task */}
      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={taskInput}
          onChange={e => setTaskInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void handleLocalAdd()
            }
          }}
          placeholder="Add a new task..."
          className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-900"
        />
        <button
          onClick={() => void handleLocalAdd()}
          disabled={!taskInput.trim()}
          className="p-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Task Columns */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {['todo', 'in_progress', 'completed'].map(status => (
          <div
            key={status}
            className="bg-slate-50 rounded-xl p-3"
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault()
              if (dragIndex === null) return
              const task = tasks[dragIndex]
              if (task && task.status !== status) {
                void handleLocalStatusChange(task.id, status)
              }
              setDragIndex(null)
            }}
          >
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              {status === 'todo' ? 'To Do' : status.replace('_', ' ')}
            </h4>
            <div className="space-y-2">
              {tasks
                .filter(t => t.status === status)
                .map(task => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => handleDragStart(tasks.indexOf(task))}
                    onDragOver={e => handleDragOver(e, tasks.indexOf(task))}
                    onDragEnd={handleDragEnd}
                    className={`bg-white rounded-lg p-3 shadow-sm border border-slate-200 cursor-grab active:cursor-grabbing ${
                      dragIndex === tasks.indexOf(task) ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-slate-900 flex-1">{task.title}</p>
                      <button
                        onClick={() => void handleLocalDelete(task.id)}
                        className="p-0.5 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1 mt-2">
                      {status !== 'todo' && (
                        <button
                          onClick={() => void handleLocalStatusChange(task.id, 'todo')}
                          className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                        >
                          ← To Do
                        </button>
                      )}
                      {status !== 'in_progress' && (
                        <button
                          onClick={() => void handleLocalStatusChange(task.id, 'in_progress')}
                          className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors"
                        >
                          In Progress →
                        </button>
                      )}
                      {status !== 'completed' && (
                        <button
                          onClick={() => void handleLocalStatusChange(task.id, 'completed')}
                          className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                        >
                          ✓ Done
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}