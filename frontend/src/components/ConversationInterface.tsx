import { useState, useEffect } from 'react'
import { MessageSquare, Plus, Send, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { useToast } from '../hooks/use-toast'
import { API_URL, getAuthHeaders } from '../utils/api'

interface Conversation {
  id: string
  title: string
  created_at: string
  updated_at: string
  fidelity?: string
  distillation_model?: string
  distillation_mode?: string
  summary?: string
  per_model_summaries?: Record<string, string>
}

interface Message {
  id: string
  role: string
  content: string
  provider_responses?: {
    responses: Array<{
      provider: string
      model: string
      response: string | null
      error: string | null
      success: boolean
    }>
  }
  timestamp: string
}

export default function ConversationInterface() {
  const { toast } = useToast()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [newConversationTitle, setNewConversationTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [showNewConversation, setShowNewConversation] = useState(false)
  const [expandedProviders, setExpandedProviders] = useState<{ [key: string]: boolean }>({})
  const [conversationFidelity, setConversationFidelity] = useState<string>('standard')
  const [conversationDistillationModel, setConversationDistillationModel] = useState<string>('gemini')
  const [conversationDistillationMode, setConversationDistillationMode] = useState<string>('single')
  const [showDistilledContent, setShowDistilledContent] = useState<boolean>(false)
  const [distilledContent, setDistilledContent] = useState<{summary?: string, per_model_summaries?: Record<string, string>}>({})


  useEffect(() => {
    loadConversations()
  }, [])

  useEffect(() => {
    if (selectedConversation) {
      loadMessages()
    }
  }, [selectedConversation])

  const loadConversations = async () => {
    try {
      const response = await fetch(`${API_URL}/api/conversations`, {
        headers: getAuthHeaders()
      })
      if (response.ok) {
        const data = await response.json()
        setConversations(data)
      }
    } catch (error) {
      console.error('Failed to load conversations:', error)
    }
  }

  const loadMessages = async () => {
    if (!selectedConversation) return

    try {
      const response = await fetch(`${API_URL}/api/conversations/${selectedConversation}`, {
        headers: getAuthHeaders()
      })
      if (response.ok) {
        const data = await response.json()
        setMessages(data.messages || [])
        setConversationFidelity(data.fidelity || 'standard')
        setConversationDistillationModel(data.distillation_model || 'gemini')
        setConversationDistillationMode(data.distillation_mode || 'single')
        setDistilledContent({
          summary: data.summary,
          per_model_summaries: data.per_model_summaries
        })
      }
    } catch (error) {
      console.error('Failed to load messages:', error)
    }
  }

  const createConversation = async () => {
    if (!newConversationTitle.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a conversation title',
        variant: 'destructive'
      })
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/conversations`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ title: newConversationTitle })
      })

      if (response.ok) {
        const data = await response.json()
        setConversations([data, ...conversations])
        setSelectedConversation(data.id)
        setNewConversationTitle('')
        setShowNewConversation(false)
        toast({
          title: 'Success',
          description: 'Conversation created'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create conversation',
        variant: 'destructive'
      })
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return

    setLoading(true)
    const messageContent = newMessage
    setNewMessage('')

    try {
      const response = await fetch(`${API_URL}/api/conversations/${selectedConversation}/messages`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ content: messageContent })
      })

      if (response.ok) {
        const data = await response.json()
        setMessages([...messages, data.user_message, data.assistant_message])
        await loadConversations()
      } else {
        throw new Error('Failed to send message')
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send message',
        variant: 'destructive'
      })
      setNewMessage(messageContent)
    } finally {
      setLoading(false)
    }
  }

  const deleteConversation = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/conversations/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })

      if (response.ok) {
        setConversations(conversations.filter(c => c.id !== id))
        if (selectedConversation === id) {
          setSelectedConversation(null)
          setMessages([])
        }
        toast({
          title: 'Success',
          description: 'Conversation deleted'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete conversation',
        variant: 'destructive'
      })
    }
  }

  const toggleProviders = (messageId: string) => {
    setExpandedProviders(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }))
  }

  const updateFidelity = async (fidelity: string) => {
    if (!selectedConversation) return

    try {
      const response = await fetch(`${API_URL}/api/conversations/${selectedConversation}/fidelity`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ fidelity })
      })

      if (response.ok) {
        setConversationFidelity(fidelity)
        setConversations(conversations.map(c => 
          c.id === selectedConversation ? { ...c, fidelity } : c
        ))
        toast({
          title: 'Success',
          description: 'Context fidelity updated'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update fidelity',
        variant: 'destructive'
      })
    }
  }

  const updateDistillationModel = async (distillation_model: string) => {
    if (!selectedConversation) return

    try {
      const response = await fetch(`${API_URL}/api/conversations/${selectedConversation}/distillation-model`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ distillation_model })
      })

      if (response.ok) {
        setConversationDistillationModel(distillation_model)
        setConversations(conversations.map(c => 
          c.id === selectedConversation ? { ...c, distillation_model } : c
        ))
        toast({
          title: 'Success',
          description: 'Distillation model updated'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update distillation model',
        variant: 'destructive'
      })
    }
  }

  const updateDistillationMode = async (distillation_mode: string) => {
    if (!selectedConversation) return

    try {
      const response = await fetch(`${API_URL}/api/conversations/${selectedConversation}/distillation-mode`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ distillation_mode })
      })

      if (response.ok) {
        setConversationDistillationMode(distillation_mode)
        setConversations(conversations.map(c => 
          c.id === selectedConversation ? { ...c, distillation_mode } : c
        ))
        toast({
          title: 'Success',
          description: 'Distillation mode updated'
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update distillation mode',
        variant: 'destructive'
      })
    }
  }

  return (
    <div className="flex gap-4 h-full">
      <div className="w-64 flex-shrink-0">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="text-lg">Conversations</CardTitle>
            <Button
              size="sm"
              onClick={() => setShowNewConversation(!showNewConversation)}
              className="w-full mt-2"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Conversation
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {showNewConversation && (
              <div className="space-y-2 p-2 border rounded">
                <Input
                  placeholder="Conversation title"
                  value={newConversationTitle}
                  onChange={(e) => setNewConversationTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createConversation()}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={createConversation} className="flex-1">
                    Create
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowNewConversation(false)} className="flex-1">
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`flex items-center justify-between p-2 rounded cursor-pointer hover:bg-gray-100 ${
                    selectedConversation === conv.id ? 'bg-blue-50 border border-blue-200' : ''
                  }`}
                >
                  <div
                    className="flex-1 truncate"
                    onClick={() => setSelectedConversation(conv.id)}
                  >
                    <div className="font-medium text-sm truncate">{conv.title}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(conv.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteConversation(conv.id)
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1">
        <Card className="h-full flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {selectedConversation
                  ? conversations.find(c => c.id === selectedConversation)?.title || 'Conversation'
                  : 'Select a conversation'}
              </CardTitle>
              {selectedConversation && (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Fidelity:</span>
                    <Select value={conversationFidelity} onValueChange={updateFidelity}>
                      <SelectTrigger className="w-28 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="standard">Standard</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Distill Model:</span>
                    <Select value={conversationDistillationModel} onValueChange={updateDistillationModel}>
                      <SelectTrigger className="w-32 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="perplexity">Perplexity</SelectItem>
                        <SelectItem value="anthropic">Anthropic</SelectItem>
                        <SelectItem value="gemini">Gemini</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Distill Mode:</span>
                    <Select value={conversationDistillationMode} onValueChange={updateDistillationMode}>
                      <SelectTrigger className="w-32 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Single Model</SelectItem>
                        <SelectItem value="per-model">Per-Model</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDistilledContent(!showDistilledContent)}
                    className="h-8"
                  >
                    {showDistilledContent ? 'Hide' : 'View'} Distilled Content
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            {!selectedConversation ? (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <MessageSquare className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p>Select a conversation or create a new one to get started</p>
                </div>
              </div>
            ) : (
              <>
                {showDistilledContent && (
                  <div className="border-b bg-gray-50 p-4 mb-4">
                    <h3 className="font-semibold mb-2">Distilled Context</h3>
                    {conversationDistillationMode === 'single' ? (
                      <div className="bg-white p-3 rounded border text-sm">
                        <div className="font-medium text-gray-700 mb-1">
                          Single Model Summary ({conversationDistillationModel})
                        </div>
                        <div className="text-gray-600">
                          {distilledContent.summary || 'No summary yet'}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="font-medium text-gray-700 mb-1">Per-Model Summaries</div>
                        {distilledContent.per_model_summaries && Object.keys(distilledContent.per_model_summaries).length > 0 ? (
                          Object.entries(distilledContent.per_model_summaries).map(([provider, summary]) => (
                            <div key={provider} className="bg-white p-3 rounded border text-sm">
                              <div className="font-medium text-gray-700 mb-1 capitalize">{provider}</div>
                              <div className="text-gray-600">{summary}</div>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-500 text-sm">No per-model summaries yet</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                
                <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-4 rounded-lg ${
                        msg.role === 'user' ? 'bg-blue-50 ml-12' : 'bg-gray-50 mr-12'
                      }`}
                    >
                      <div className="font-semibold text-sm mb-2">
                        {msg.role === 'user' ? 'You' : 'MultiBrain'}
                      </div>
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                      
                      {msg.role === 'assistant' && msg.provider_responses && (
                        <div className="mt-3 border-t pt-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleProviders(msg.id)}
                            className="text-xs text-gray-600 hover:text-gray-900"
                          >
                            {expandedProviders[msg.id] ? (
                              <>
                                <ChevronUp className="w-3 h-3 mr-1" />
                                Hide provider details
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-3 h-3 mr-1" />
                                View provider details ({msg.provider_responses.responses.filter(r => r.success).length} sources)
                              </>
                            )}
                          </Button>
                          
                          {expandedProviders[msg.id] && (
                            <div className="mt-2 space-y-2">
                              {msg.provider_responses.responses.map((resp, idx) => (
                                <div key={idx} className="border rounded p-3 bg-white text-sm">
                                  <div className="font-semibold text-gray-700 mb-2">
                                    {resp.provider} <span className="text-gray-500 font-normal">({resp.model})</span>
                                  </div>
                                  {resp.success ? (
                                    <div className="text-gray-600 whitespace-pre-wrap">{resp.response}</div>
                                  ) : (
                                    <div className="text-red-600">Error: {resp.error}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="Type your message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    disabled={loading}
                  />
                  <Button onClick={sendMessage} disabled={loading || !newMessage.trim()}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
