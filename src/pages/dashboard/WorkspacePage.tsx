import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  Briefcase,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  Code,
  Columns,
  Delete,
  Download,
  FileCheck,
  FileText,
  Files,
  Images,
  Laptop,
  List,
  Loader2,
  Lock,
  MessageSquare,
  Paperclip,
  Play,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Target,
  Trash2,
  Type,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import { ConfirmModal } from '../../components/ConfirmModal';
import { supabase, realtimeChannels } from '../../lib/supabase';
import { fileUploadService, type ContractFile } from '../../lib/fileUpload';
import { normalizeEscrow } from '../../lib/contractMilestones';
import type { Tables } from '../../types/supabase';

type ContractWithDetails = Tables<'contracts'> & {
  project: Tables<'projects'>;
  client: Tables<'profiles'>;
  escrow?: { id: string; amount: number; status: string }[] | { id: string; amount: number; status: string } | null;
  freelancer_amount?: number;
};

type Message = Tables<'messages'> & {
  sender: Tables<'profiles'>;
};

interface SharedTask {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'completed';
  created_by: string;
  created_at: string;
}

export function WorkspacePage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const contractId = searchParams.get('contract');
  
  const [contracts, setContracts] = useState<ContractWithDetails[]>([]);
  const [selectedContract, setSelectedContract] = useState<ContractWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [milestones, setMilestones] = useState<Array<{ title: string; description?: string; amount: number; status: string; due_date?: string }>>([]);
  const [contractFiles, setContractFiles] = useState<ContractFile[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileDescription, setFileDescription] = useState('');
  const [deleteFileConfirm, setDeleteFileConfirm] = useState<string | null>(null);
  const toast = useToast();

  // Symmetrical Tab State
  const [activeTab, setActiveTab] = useState<'chat' | 'canvas' | 'milestones'>('chat');

  // Co-Working Canvas States
  const [taskInput, setTaskInput] = useState('');
  const [notesText, setNotesText] = useState('');
  const [isTypingNotes, setIsTypingNotes] = useState(false);
  const [notesSaveStatus, setNotesSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [sharedTasks, setSharedTasks] = useState<SharedTask[]>([]);

  const refreshContract = useCallback(async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          *,
          project:projects(*),
          client:profiles!contracts_client_id_fkey(*),
          escrow:escrow(id, amount, status)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      if (data) {
        const typedContract = data as unknown as ContractWithDetails;
        setSelectedContract(typedContract);
        setContracts(prev => prev.map(c => c.id === id ? typedContract : c));
        
        if (typedContract.milestones && Array.isArray(typedContract.milestones)) {
          setMilestones(typedContract.milestones as Array<{ title: string; description?: string; amount: number; status: string; due_date?: string }>);
        }
      }
    } catch (err) {
      console.error('Error refreshing contract:', err);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        // Fetch active contracts
        const { data: contractsData, error } = await supabase
          .from('contracts')
          .select(`
            *,
            project:projects(*),
            client:profiles!contracts_client_id_fkey(*),
            escrow:escrow(id, amount, status)
          `)
          .eq('freelancer_id', user.id)
          .in('status', ['active', 'in_progress', 'disputed'])
          .order('created_at', { ascending: false });

        if (error) throw error;

        if (contractsData) {
          const typedContracts = contractsData as unknown as ContractWithDetails[];
          setContracts(typedContracts);
          
          const targetContract = contractId 
            ? typedContracts.find(c => c.id === contractId)
            : typedContracts[0];
          
          if (targetContract) {
            setSelectedContract(targetContract);
            if (targetContract.milestones && Array.isArray(targetContract.milestones)) {
              setMilestones(targetContract.milestones as Array<{ title: string; description?: string; amount: number; status: string; due_date?: string }>);
            }
          }
        }

        setLoading(false);
      } catch (error) {
        console.error('Error fetching workspace data:', error);
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(() => {
      if (loading) {
        setLoading(false);
      }
    }, 3000);

    fetchData();

    return () => clearTimeout(timeoutId);
  }, [user, contractId, loading]);

  const fetchSharedTasks = useCallback(async () => {
    if (!selectedContract) return;
    try {
      const { data, error } = await supabase
        .from('workspace_tasks')
        .select('id, title, status, created_by, created_at')
        .eq('contract_id', selectedContract.id)
        .order('created_at', { ascending: true });
      if (!error && data) {
        setSharedTasks(data as SharedTask[]);
      }
    } catch (error) {
      console.error('Error fetching shared tasks:', error);
    }
  }, [selectedContract]);

  const fetchSharedNotes = useCallback(async () => {
    if (!selectedContract) return;
    try {
      const { data, error } = await supabase
        .from('workspace_notes')
        .select('content')
        .eq('contract_id', selectedContract.id)
        .maybeSingle();
      if (!error && data) {
        setNotesText(data.content || '');
      } else {
        setNotesText('');
      }
    } catch (error) {
      console.error('Error fetching shared notes:', error);
      setNotesText('');
    }
  }, [selectedContract]);

  useEffect(() => {
    if (!selectedContract) return;
    void fetchSharedTasks();
    void fetchSharedNotes();
  }, [selectedContract, fetchSharedNotes, fetchSharedTasks]);

  // Subscribe to workspace_tasks and workspace_notes realtime changes
  useEffect(() => {
    if (!selectedContract) return;

    const tasksChannel = supabase
      .channel(`workspace-tasks-${selectedContract.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'workspace_tasks',
          filter: `contract_id=eq.${selectedContract.id}`,
        },
        () => {
          void fetchSharedTasks();
        }
      )
      .subscribe();

    const notesChannel = supabase
      .channel(`workspace-notes-${selectedContract.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'workspace_notes',
          filter: `contract_id=eq.${selectedContract.id}`,
        },
        () => {
          void fetchSharedNotes();
        }
      )
      .subscribe();

    return () => {
      void tasksChannel.unsubscribe();
      void notesChannel.unsubscribe();
    };
  }, [selectedContract, fetchSharedTasks, fetchSharedNotes]);

  // Fetch messages and setup subscriptions
  useEffect(() => {
    if (!selectedContract) return;

    const fetchMessages = async () => {
      try {
        const { data, error } = await supabase
          .from('messages')
          .select(`
            *,
            sender:profiles(id, name, avatar)
          `)
          .eq('contract_id', selectedContract.id)
          .order('created_at', { ascending: true });

        if (error) throw error;

        if (data) {
          setMessages(data as unknown as Message[]);
        }
      } catch (error) {
        console.error('Error fetching messages:', error);
      }
    };

    fetchMessages();

    // Subscribe to messages
    const channel = realtimeChannels.messages(`workspace-${selectedContract.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `contract_id=eq.${selectedContract.id}`,
        },
        async (payload) => {
          const { data: newMessage } = await supabase
            .from('messages')
            .select(`
              *,
              sender:profiles(id, name, avatar)
            `)
            .eq('id', payload.new.id)
            .single();

          if (newMessage) {
            setMessages(prev => [...prev, newMessage as unknown as Message]);
          }
        }
      )
      .subscribe();

    // Subscribe to contract changes
    const contractSub = realtimeChannels.contracts(`workspace-contract-sub-${selectedContract.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'contracts',
          filter: `id=eq.${selectedContract.id}`,
        },
        () => {
          void refreshContract(selectedContract.id);
        }
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
      void contractSub.unsubscribe();
    };
  }, [selectedContract, refreshContract]);

  // Fetch contract files
  useEffect(() => {
    if (!selectedContract) return;

    const fetchFiles = async () => {
      const files = await fileUploadService.getContractFiles(selectedContract.id);
      setContractFiles(files);
    };

    fetchFiles();

    // Subscribe to file updates
    const fileChannel = fileUploadService.subscribeToContractFiles(selectedContract.id, () => {
      void fetchFiles();
    });

    return () => {
      void fileChannel.unsubscribe();
    };
  }, [selectedContract]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedContract || !user) return;

    setSendingMessage(true);
    
    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          contract_id: selectedContract.id,
          sender_id: user.id,
          content: newMessage,
          message_type: 'text',
        });

      if (error) throw error;

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Failed to send message. Please try again.');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !selectedContract) return;

    setUploadingFile(true);

    try {
      const result = await fileUploadService.uploadFile(selectedFile, selectedContract.id, fileDescription);

      if (result.success) {
        setShowUploadModal(false);
        setSelectedFile(null);
        setFileDescription('');
        const updatedFiles = await fileUploadService.getContractFiles(selectedContract.id);
        setContractFiles(updatedFiles);
        toast.success('File uploaded successfully');
      } else {
        toast.error(result.error || 'Failed to upload file');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload file. Please try again.');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    const result = await fileUploadService.deleteFile(fileId);
    if (result.success) {
      setContractFiles(prev => prev.filter(f => f.id !== fileId));
      toast.success('File deleted');
    } else {
      toast.error(result.error || 'Failed to delete file');
    }
    setDeleteFileConfirm(null);
  };

  const handleMilestoneStatusChange = async (index: number, newStatus: string) => {
    if (!selectedContract) return;
    if (selectedContract.status === 'disputed') {
      toast.warning('Milestone actions are frozen while this contract is in dispute.');
      return;
    }
    
    const updatedMilestones = [...milestones];
    updatedMilestones[index] = { ...updatedMilestones[index], status: newStatus };
    setMilestones(updatedMilestones);

    await supabase
      .from('contracts')
      .update({ milestones: updatedMilestones })
      .eq('id', selectedContract.id);
  };

  // Live Task Board Handlers
  const getTasks = (): SharedTask[] => sharedTasks;

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskInput.trim() || !selectedContract || !user) return;

    try {
      const { error } = await supabase
        .from('workspace_tasks')
        .insert({
          contract_id: selectedContract.id,
          title: taskInput.trim(),
          status: 'todo',
          created_by: user.id,
        } as any);
      if (!error) {
        setTaskInput('');
        void fetchSharedTasks();
      }
    } catch (err) {
      console.error('Error adding task:', err);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: 'todo' | 'in_progress' | 'completed') => {
    try {
      const { error } = await supabase
        .from('workspace_tasks')
        .update({ status: newStatus } as any)
        .eq('id', taskId);
      if (!error) void fetchSharedTasks();
    } catch (err) {
      console.error('Error updating task status:', err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('workspace_tasks')
        .delete()
        .eq('id', taskId);
      if (!error) void fetchSharedTasks();
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  };

  // Collaborative Scratchpad Handlers
  const notesUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleNoteChange = (text: string) => {
    setNotesText(text);
    setIsTypingNotes(true);
    setNotesSaveStatus('saving');
    debouncedUpdateNotes(text);
  };

  const debouncedUpdateNotes = useCallback(
    async (text: string) => {
      if (notesUpdateTimeoutRef.current) {
        clearTimeout(notesUpdateTimeoutRef.current);
      }
      notesUpdateTimeoutRef.current = setTimeout(async () => {
        if (selectedContract && user) {
          const { data: existing } = await supabase
            .from('workspace_notes')
            .select('id')
            .eq('contract_id', selectedContract.id)
            .maybeSingle();

          if (existing) {
            await supabase
              .from('workspace_notes')
              .update({ content: text, updated_at: new Date().toISOString() } as any)
              .eq('id', existing.id);
            setNotesSaveStatus('saved');
          } else {
            await supabase
              .from('workspace_notes')
              .insert({ contract_id: selectedContract.id, content: text, created_by: user.id } as any);
            setNotesSaveStatus('saved');
          }
          setTimeout(() => setNotesSaveStatus('idle'), 2000);
        }
        setIsTypingNotes(false);
      }, 1000);
    },
    [selectedContract, user]
  );

  // Chronological event timeline compiler
  const getTimelineEvents = () => {
    if (!selectedContract) return [];
    
    const events: Array<{
      id: string;
      title: string;
      description: string;
      timestamp: string;
      type: 'system' | 'milestone' | 'file' | 'dispute' | 'escrow';
      icon: any;
      color: string;
    }> = [];

    // 1. Contract Started
    events.push({
      id: 'contract-started',
      title: 'Contract Initialized',
      description: `Project kicked off with client ${selectedContract.client?.name || 'Client'}.`,
      timestamp: selectedContract.created_at,
      type: 'system',
      icon: Briefcase,
      color: 'bg-indigo-500 text-white shadow-indigo-100'
    });

    // 2. Milestones completed
    milestones.forEach((m, idx) => {
      if (m.status === 'completed') {
        events.push({
          id: `milestone-completed-${idx}`,
          title: `Milestone Completed`,
          description: `"${m.title}" marked as completed. Amount: ${formatCurrency(m.amount)}.`,
          timestamp: selectedContract.updated_at || selectedContract.created_at,
          type: 'milestone',
          icon: CheckCircle2,
          color: 'bg-emerald-500 text-white shadow-emerald-100'
        });
      }
    });

    // 3. File uploads
    contractFiles.forEach((file) => {
      const isFreelancer = file.uploaded_by === user?.id;
      events.push({
        id: `file-${file.id}`,
        title: `Deliverable Shared`,
        description: `${isFreelancer ? 'You' : 'Client'} uploaded "${file.file_name}" (${fileUploadService.formatFileSize(file.file_size)}). ${file.description || ''}`,
        timestamp: file.created_at,
        type: 'file',
        icon: FileText,
        color: 'bg-blue-500 text-white shadow-blue-100'
      });
    });

    // 4. Escrow status
    const escrowData = selectedContract as { escrow?: { id: string; amount: number; status: string }[] | { id: string; amount: number; status: string } | null };
    const escrow = escrowData.escrow;
    if (escrow) {
      const escrowRow = normalizeEscrow(escrow);
      if (escrowRow) {
        if (escrowRow.status === 'funded') {
          events.push({
            id: 'escrow-funded',
            title: 'Escrow protection active',
            description: `Client funded ${formatCurrency(escrowRow.amount)} in Growlancer Escrow protection.`,
            timestamp: selectedContract.updated_at || selectedContract.created_at,
            type: 'escrow',
            icon: ShieldCheck,
            color: 'bg-emerald-600 text-white shadow-emerald-100'
          });
        } else if (escrowRow.status === 'released') {
          events.push({
            id: 'escrow-released',
            title: 'Payment Released',
            description: `Growlancer Escrow released ${formatCurrency(escrowRow.amount)} to your Freelancer Wallet!`,
            timestamp: selectedContract.updated_at || selectedContract.created_at,
            type: 'escrow',
            icon: FileCheck,
            color: 'bg-indigo-600 text-white shadow-indigo-200'
          });
        }
      }
    }

    // 5. Dispute status
    if (selectedContract.status === 'disputed') {
      events.push({
        id: 'dispute-opened',
        title: 'Project In Dispute Resolution',
        description: 'Escrow assets locked. Support team is investigating files and chat transcripts.',
        timestamp: selectedContract.updated_at || selectedContract.created_at,
        type: 'dispute',
        icon: AlertCircle,
        color: 'bg-red-500 text-white animate-pulse shadow-red-100'
      });
    }

    return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return <LoadingSkeleton variant="full-page" />;
  }

  if (contracts.length === 0) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Laptop className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">Workspace</h1>
            <p className="text-slate-500">Manage your active projects</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-12 border border-slate-100 text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="font-display text-xl font-bold text-slate-900 mb-2">No active contracts</h3>
          <p className="text-slate-500 max-w-md mx-auto mb-6">
            You don't have any active contracts. Submit proposals to get hired and start working!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-6 md:py-8">
      {/* Top Banner / Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white/60 backdrop-blur-md border border-slate-100 p-5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 flex-shrink-0">
            <Laptop className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">Collaboration Workspace</h1>
            <p className="text-sm text-slate-500">
              Co-working with <span className="font-semibold text-slate-700">{selectedContract?.client?.name}</span>
            </p>
          </div>
        </div>

        {/* Dynamic Nav Tabs */}
        <div className="flex items-center bg-slate-100/80 p-1.5 rounded-xl border border-slate-200/50 self-start lg:self-center">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              activeTab === 'chat'
                ? 'bg-white text-emerald-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Chat & Assets</span>
          </button>
          
          <button
            onClick={() => setActiveTab('canvas')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              activeTab === 'canvas'
                ? 'bg-white text-emerald-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>Co-Working Canvas</span>
          </button>

          <button
            onClick={() => setActiveTab('milestones')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              activeTab === 'milestones'
                ? 'bg-white text-emerald-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Milestones & Escrow</span>
          </button>
        </div>

        {/* Contract Selector */}
        {contracts.length > 1 && (
          <select
            value={selectedContract?.id || ''}
            onChange={(e) => {
              const contract = contracts.find(c => c.id === e.target.value);
              if (contract) {
                setSelectedContract(contract);
                if (contract.milestones && Array.isArray(contract.milestones)) {
                  setMilestones(contract.milestones as Array<{ title: string; description?: string; amount: number; status: string; due_date?: string }>);
                }
              }
            }}
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm"
          >
            {contracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.project.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {selectedContract && (
        <div className="space-y-6">
          {/* Dispute Alert Banner */}
          {selectedContract.status === 'disputed' && (
            <div className="bg-red-50/90 border border-red-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-scale-in">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5 animate-workflow-pulse" />
                <div>
                  <h4 className="font-bold text-red-900">Contract Frozen Under Active Dispute</h4>
                  <p className="text-xs text-red-700 mt-1 leading-relaxed max-w-2xl">
                    A dispute has been raised regarding project deliverables. Escrow payouts are locked and milestone actions are frozen.
                    Please contact support to resolve this dispute.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: Chat & Assets Hub */}
          {activeTab === 'chat' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column - Chat Room */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm flex flex-col h-[600px]">
                {/* Chat Header */}
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-slate-900">Project Chat Room</h4>
                      <p className="text-xs text-slate-500">Secure real-time correspondence with {selectedContract.client?.name}</p>
                    </div>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${message.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className="max-w-[80%]">
                        {message.sender_id !== user?.id && (
                          <p className="text-xs text-slate-500 mb-1 ml-1">{message.sender?.name || 'Client'}</p>
                        )}
                        <div
                          className={`p-3 rounded-2xl ${
                            message.sender_id === user?.id
                              ? 'bg-emerald-600 text-white rounded-br-none'
                              : 'bg-slate-100 text-slate-900 rounded-bl-none'
                          }`}
                        >
                          <p className="text-sm">{message.content}</p>
                          <p className={`text-[10px] mt-1 text-right ${message.sender_id === user?.id ? 'text-emerald-200' : 'text-slate-400'}`}>
                            {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Message Input */}
                <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowUploadModal(true)}
                      className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-colors"
                      title="Upload deliverable files"
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      placeholder="Type a secure message..."
                      className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={!newMessage.trim() || sendingMessage}
                      className="w-10 h-10 bg-emerald-600 text-white rounded-full flex items-center justify-center hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendingMessage ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Send className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Right Column - Deliverables & Assets Locker */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-5 h-[600px] flex flex-col">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="font-semibold text-slate-900">Shared Asset Locker</h3>
                    <p className="text-xs text-slate-500">Contracts, code, and mockups</p>
                  </div>
                  {selectedContract.status !== 'disputed' ? (
                    <button
                      onClick={() => setShowUploadModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-all font-medium rounded-lg"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Upload</span>
                    </button>
                  ) : (
                    <span className="text-[10px] text-red-500 font-semibold px-2 py-1 bg-red-50 border border-red-100 rounded-lg flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Locked
                    </span>
                  )}
                </div>

                {/* Uploaded Files List */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {contractFiles.length > 0 ? (
                    contractFiles.map((file) => (
                      <div key={file.id} className="flex items-center gap-3 p-3 bg-slate-50/80 border border-slate-100 rounded-xl hover:border-slate-200 transition-all shadow-sm">
                        <div className="w-10 h-10 bg-white border border-slate-100 rounded-lg flex items-center justify-center text-xl flex-shrink-0 shadow-sm">
                          {fileUploadService.getFileIcon(file.file_type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-900 truncate">{file.file_name}</p>
                          <p className="text-[10px] text-slate-500">
                            {fileUploadService.formatFileSize(file.file_size)} • {file.uploaded_by === user?.id ? 'You' : 'Client'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <a
                            href={file.public_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors border border-slate-200 bg-white"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                          {file.uploaded_by === user?.id && selectedContract.status !== 'disputed' && (
                             <button
                               onClick={() => setDeleteFileConfirm(file.id)}
                               className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-slate-200 bg-white"
                             >
                               <Trash2 className="w-3.5 h-3.5" />
                             </button>
                           )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-12 text-slate-400">
                      <FileText className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                      <p className="text-xs">No files shared yet.</p>
                      <p className="text-[10px] text-slate-400 max-w-[200px] mx-auto mt-1">Upload code, templates, or assets for real-time client verification.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Real-Time Shared Canvas */}
          {activeTab === 'canvas' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Shared Live Task Board */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4 flex flex-col h-[600px]">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                      <ClipboardList className="w-5 h-5 text-emerald-600" />
                      <span>Live Task Board</span>
                    </h3>
                    <p className="text-xs text-slate-500">Shared checklist synced in real-time</p>
                  </div>
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                    {getTasks().filter(t => t.status === 'completed').length}/{getTasks().length} Done
                  </span>
                </div>

                {/* Add Task Input Form */}
                <form onSubmit={handleAddTask} className="flex gap-2">
                  <input
                    type="text"
                    value={taskInput}
                    onChange={(e) => setTaskInput(e.target.value)}
                    placeholder="Add a co-working task..."
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none bg-slate-50/50"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-medium flex items-center gap-1 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </form>

                {/* Shared Task Columns / Lists */}
                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                  {/* Todo List */}
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                      <span>To Do ({getTasks().filter(t => t.status === 'todo').length})</span>
                    </h4>
                    <div className="space-y-1.5">
                      {getTasks().filter(t => t.status === 'todo').map((task) => (
                        <div key={task.id} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-lg hover:border-slate-200 transition-all text-xs group">
                          <span className="text-slate-700 font-medium">{task.title}</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleUpdateTaskStatus(task.id, 'in_progress')}
                              className="p-1 text-indigo-600 hover:bg-indigo-50 border border-indigo-100 rounded bg-white"
                              title="Start work"
                            >
                              <Play className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-200 rounded bg-white opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {getTasks().filter(t => t.status === 'todo').length === 0 && (
                        <p className="text-[10px] text-slate-400 italic py-1 pl-3">No tasks in queue.</p>
                      )}
                    </div>
                  </div>

                  {/* In Progress List */}
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                      <span>In Progress ({getTasks().filter(t => t.status === 'in_progress').length})</span>
                    </h4>
                    <div className="space-y-1.5">
                      {getTasks().filter(t => t.status === 'in_progress').map((task) => (
                        <div key={task.id} className="flex items-center justify-between p-2.5 bg-blue-50/20 border border-blue-100 rounded-lg hover:border-blue-200 transition-all text-xs group">
                          <span className="text-blue-900 font-medium">{task.title}</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleUpdateTaskStatus(task.id, 'completed')}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 border border-emerald-100 rounded bg-white"
                              title="Mark complete"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleUpdateTaskStatus(task.id, 'todo')}
                              className="p-1 text-slate-500 hover:bg-slate-100 border border-slate-200 rounded bg-white"
                              title="Put back in queue"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {getTasks().filter(t => t.status === 'in_progress').length === 0 && (
                        <p className="text-[10px] text-slate-400 italic py-1 pl-3">No tasks currently active.</p>
                      )}
                    </div>
                  </div>

                  {/* Completed List */}
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                      <span>Completed ({getTasks().filter(t => t.status === 'completed').length})</span>
                    </h4>
                    <div className="space-y-1.5">
                      {getTasks().filter(t => t.status === 'completed').map((task) => (
                        <div key={task.id} className="flex items-center justify-between p-2.5 bg-emerald-50/10 border border-emerald-100/50 rounded-lg text-xs group line-through text-slate-400">
                          <span>{task.title}</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleUpdateTaskStatus(task.id, 'in_progress')}
                              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 rounded bg-white line-normal"
                              title="Re-open task"
                            >
                              <Play className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-200 rounded bg-white opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {getTasks().filter(t => t.status === 'completed').length === 0 && (
                        <p className="text-[10px] text-slate-400 italic py-1 pl-3">No tasks completed yet.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Collaborative Scratchpad / Notes */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4 flex flex-col h-[600px]">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-emerald-600" />
                      <span>Co-Working Scratchpad</span>
                    </h3>
                    <p className="text-xs text-slate-500">Shared collaborative project pad</p>
                  </div>
                  
                  {/* Save Indicator */}
                  <div className="text-[10px] flex items-center gap-1.5 font-medium px-2 py-0.5 rounded-md border border-slate-200/60 shadow-sm bg-slate-50">
                    {notesSaveStatus === 'saving' && (
                      <span className="text-indigo-600 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                      </span>
                    )}
                    {notesSaveStatus === 'saved' && (
                      <span className="text-emerald-600 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Synced
                      </span>
                    )}
                    {notesSaveStatus === 'idle' && (
                      <span className="text-slate-500 flex items-center gap-1">
                        <Save className="w-3 h-3" /> Safe
                      </span>
                    )}
                  </div>
                </div>

                <textarea
                  value={notesText}
                  onChange={(e) => handleNoteChange(e.target.value)}
                  placeholder="Collaborate on project outlines, tech stack details, credentials, or custom deadlines. Synced instantly on both sides..."
                  className="flex-1 w-full p-4 bg-slate-50/50 border border-slate-200 rounded-2xl text-xs leading-relaxed focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 focus:outline-none resize-none font-mono"
                />
                
                <p className="text-[10px] text-slate-400 leading-normal flex items-start gap-1">
                  <AlertCircle className="w-3 h-3 text-slate-400 mt-0.5 flex-shrink-0" />
                  <span>Use this board for persistent notes. Keeps credentials, staging servers, and APIs synced without scrolling the chat room.</span>
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: Milestones & Escrow Timeline */}
          {activeTab === 'milestones' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
              {/* Financial Dashboard details (Left 2 spans) */}
              <div className="lg:col-span-2 space-y-6">
                {/* Project Milestone Card */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
                  <div className="flex items-start justify-between mb-4 pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="font-semibold text-slate-900 text-lg">
                        {selectedContract.project.title}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">Budget protected in Growlancer Escrow protection</p>
                    </div>
                    <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 uppercase">
                      {selectedContract.status === 'disputed' ? 'Locked (Dispute)' : 'In Progress'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                      <p className="text-[10px] text-slate-500 mb-1">Contract Budget</p>
                      <p className="text-lg font-bold text-slate-950">{formatCurrency(selectedContract.amount)}</p>
                    </div>
                    <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                      <p className="text-[10px] text-emerald-600 mb-1">Escrow Secured</p>
                      <p className="text-lg font-bold text-emerald-800">
                        {selectedContract.status === 'disputed' ? 'Locked' : formatCurrency(selectedContract.freelancer_amount)}
                      </p>
                    </div>
                    <div className="p-4 bg-orange-50/50 border border-orange-100 rounded-xl">
                      <p className="text-[10px] text-orange-600 mb-1">Target End Date</p>
                      <p className="text-base font-bold text-orange-800">
                        {selectedContract.end_date 
                          ? new Date(selectedContract.end_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'Not Set'}
                      </p>
                    </div>
                  </div>

                  {/* Escrow Details Banner */}
                  {(selectedContract as any).escrow && (
                    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 flex items-center justify-between text-xs mb-4">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-emerald-600" />
                        <div>
                          <p className="font-semibold text-slate-900">Escrow Security active</p>
                          <p className="text-[10px] text-slate-500">Funds are held by Growlancer until you finish mockups and deliverables.</p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-800 text-[10px] font-semibold uppercase tracking-wider">
                        Funded
                      </span>
                    </div>
                  )}
                </div>

                {/* Milestones list */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-slate-900">Contract Milestones</h3>
                    <span className="text-xs text-slate-500">
                      {milestones.filter(m => m.status === 'completed').length} of {milestones.length} Completed
                    </span>
                  </div>

                  {milestones.length > 0 ? (
                    <div className="space-y-3">
                      {milestones.map((milestone, idx) => (
                        <div
                          key={idx}
                          className={`p-3.5 rounded-xl border transition-all text-xs ${
                            milestone.status === 'completed'
                              ? 'bg-emerald-50/20 border-emerald-100/50 text-slate-600'
                              : milestone.status === 'in_progress'
                              ? 'bg-blue-50/20 border-blue-100/50'
                              : 'bg-slate-50/50 border-slate-100'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <button
                              onClick={() => handleMilestoneStatusChange(idx, milestone.status === 'completed' ? 'pending' : 'completed')}
                              disabled={selectedContract.status === 'disputed'}
                              className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all border ${
                                selectedContract.status === 'disputed'
                                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                                  : milestone.status === 'completed'
                                  ? 'bg-emerald-500 border-emerald-600 text-white'
                                  : 'bg-white border-slate-300 hover:border-emerald-500'
                              }`}
                            >
                              {milestone.status === 'completed' && <Check className="w-3 h-3" />}
                            </button>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-0.5">
                                <h4 className={`font-semibold text-xs ${milestone.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                                  {milestone.title}
                                </h4>
                                <span className="font-bold text-slate-900">{formatCurrency(milestone.amount)}</span>
                              </div>
                              {milestone.description && (
                                <p className="text-[10px] text-slate-500 leading-relaxed mb-2">{milestone.description}</p>
                              )}
                              <div className="flex items-center gap-3 text-[10px]">
                                <span className={`px-2 py-0.5 rounded-md border font-medium uppercase tracking-wider ${
                                  milestone.status === 'completed'
                                    ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                    : milestone.status === 'in_progress'
                                    ? 'bg-blue-50 border-blue-100 text-blue-700'
                                    : 'bg-slate-100 border-slate-200 text-slate-600'
                                }`}>
                                  {milestone.status === 'completed' ? 'Completed' : milestone.status === 'in_progress' ? 'In Progress' : 'Pending'}
                                </span>
                                {milestone.due_date && (
                                  <span className="flex items-center gap-1 text-slate-400">
                                    <Calendar className="w-3.5 h-3.5" />
                                    Due {new Date(milestone.due_date).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl">
                      <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs text-slate-500">No milestones defined for this contract</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Chronological Project Timeline (Right Column) */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm space-y-4 flex flex-col h-[600px]">
                <div className="pb-3 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-emerald-600" />
                    <span>Project Event Timeline</span>
                  </h3>
                  <p className="text-xs text-slate-500">Co-working log feed</p>
                </div>

                <div className="flex-1 overflow-y-auto pr-1 relative pl-4 space-y-5">
                  {/* Timeline central wire */}
                  <div className="absolute left-6 top-3 bottom-3 w-0.5 bg-slate-100" />
                  
                  {getTimelineEvents().length > 0 ? (
                    getTimelineEvents().map(event => (
                      <div key={event.id} className="relative flex items-start gap-4 animate-scale-in">
                        {/* Timeline event icon */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 shadow-md ${event.color}`}>
                          <event.icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0 bg-slate-50/60 border border-slate-100 rounded-xl p-3 hover:bg-slate-50 hover:border-slate-200 transition-all shadow-sm">
                          <span className="text-[9px] text-slate-400 font-semibold block mb-0.5 uppercase tracking-wider">
                            {new Date(event.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <h4 className="text-xs font-semibold text-slate-900 leading-normal">{event.title}</h4>
                          <p className="text-[10px] text-slate-500 mt-1 leading-normal">{event.description}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-400 text-center py-12">Timeline compilation idle.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* File Upload Modal */}
      <ConfirmModal
        isOpen={!!deleteFileConfirm}
        onClose={() => setDeleteFileConfirm(null)}
        onConfirm={() => deleteFileConfirm ? handleDeleteFile(deleteFileConfirm) : Promise.resolve()}
        title="Delete File"
        message="Are you sure you want to delete this file? This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
      />

      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl animate-scale-in border border-slate-100">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-lg font-bold text-slate-900">Upload Project Deliverable</h3>
              <button 
                onClick={() => setShowUploadModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors border border-slate-200"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleFileUpload} className="space-y-4">
              <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6 hover:border-emerald-500 hover:bg-emerald-50/20 transition-all cursor-pointer">
                <input
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="hidden"
                  id="file-input-freelancer"
                />
                <label htmlFor="file-input-freelancer" className="block text-center cursor-pointer">
                  <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">
                    {selectedFile ? selectedFile.name : 'Select or drag contract deliverable'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">Supported: Code, Images, PDFs, Zip (Max 50MB)</p>
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Description / Client Note</label>
                <textarea
                  value={fileDescription}
                  onChange={(e) => setFileDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-xs resize-none"
                  placeholder="Explain this release or deliverable (e.g. Mockups v1, DB schema)..."
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="flex-1 py-2.5 px-4 border border-slate-200 text-slate-700 text-xs font-medium rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedFile || uploadingFile}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 text-white text-xs font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/10"
                >
                  {uploadingFile ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    'Upload Deliverable'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}