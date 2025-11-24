import { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Alert, AlertDescription } from './ui/alert'
import { useToast } from '../hooks/use-toast'
import { API_URL, getAuthHeaders } from '../utils/api'

interface ProviderResponse {
  provider: string
  model: string
  response: string | null
  error: string | null
  success: boolean
}

interface AggregatedResponse {
  responses: ProviderResponse[]
  synthesis: string | null
}

export default function PromptInterface() {
  const { toast } = useToast()
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AggregatedResponse | null>(null)

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a prompt',
        variant: 'destructive'
      })
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const response = await fetch(`${API_URL}/api/prompt`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ prompt })
      })

      if (!response.ok) {
        throw new Error('Failed to send prompt')
      }

      const data = await response.json()
      setResult(data)
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send prompt to providers',
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Enter Your Prompt</CardTitle>
          <CardDescription>
            Your prompt will be sent to all configured AI providers simultaneously
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Enter your question or prompt here..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            className="resize-none"
          />
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send to All Providers
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
          {result.synthesis && (
            <Card className="border-2 border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="text-blue-900">Synthesized Report</CardTitle>
                <CardDescription>
                  Unified analysis from all providers using Gemini Thinking Mode
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap text-gray-800">
                    {result.synthesis}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-4">
            <h3 className="text-xl font-semibold">Individual Provider Responses</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {result.responses.map((response, index) => (
                <Card key={index} className={response.success ? '' : 'border-red-200 bg-red-50'}>
                  <CardHeader>
                    <CardTitle className="text-lg">{response.provider}</CardTitle>
                    <CardDescription>{response.model}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {response.success && response.response ? (
                      <div className="whitespace-pre-wrap text-sm text-gray-700">
                        {response.response}
                      </div>
                    ) : (
                      <Alert variant="destructive">
                        <AlertDescription>
                          {response.error || 'Failed to get response'}
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
