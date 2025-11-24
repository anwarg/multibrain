import { useState, useEffect } from 'react'
import { Save, X, Key } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { Switch } from './ui/switch'
import { useToast } from '../hooks/use-toast'
import { API_URL, getAuthHeaders } from '../utils/api'

interface ProviderSettings {
  api_key: string | null
  model: string | null
  enabled: boolean
}

interface DistillationSettings {
  mode: string
  model: string
}

interface Settings {
  openai: ProviderSettings
  perplexity: ProviderSettings
  anthropic: ProviderSettings
  gemini: ProviderSettings
  distillation: DistillationSettings
}

interface SettingsPageProps {
  onClose: () => void
}

const modelOptions = {
  openai: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-4o'],
  perplexity: ['sonar', 'sonar-pro'],
  anthropic: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
  gemini: ['gemini-pro', 'gemini-1.5-pro', 'gemini-1.5-flash']
}

export default function SettingsPage({ onClose }: SettingsPageProps) {
  const { toast } = useToast()
  const [settings, setSettings] = useState<Settings>({
    openai: { api_key: null, model: 'gpt-4', enabled: true },
    perplexity: { api_key: null, model: 'sonar', enabled: true },
    anthropic: { api_key: null, model: 'claude-3-sonnet-20240229', enabled: true },
    gemini: { api_key: null, model: 'gemini-pro', enabled: true },
    distillation: { mode: 'single', model: 'gemini' }
  })
  const [loading, setLoading] = useState(true)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch(`${API_URL}/api/settings`, {
        headers: getAuthHeaders()
      })
      const data = await response.json()
      setSettings(data)
      setLoading(false)
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load settings',
        variant: 'destructive'
      })
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      const response = await fetch(`${API_URL}/api/settings`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(settings)
      })

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Settings saved successfully'
        })
        onClose()
      } else {
        throw new Error('Failed to save settings')
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save settings',
        variant: 'destructive'
      })
    }
  }

  const updateProviderSetting = (
    provider: keyof Settings,
    field: keyof ProviderSettings,
    value: string | boolean | null
  ) => {
    setSettings(prev => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        [field]: value
      }
    }))
  }

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        title: 'Error',
        description: 'Please fill in all password fields',
        variant: 'destructive'
      })
      return
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Error',
        description: 'New passwords do not match',
        variant: 'destructive'
      })
      return
    }

    if (newPassword.length < 6) {
      toast({
        title: 'Error',
        description: 'New password must be at least 6 characters long',
        variant: 'destructive'
      })
      return
    }

    setChangingPassword(true)

    try {
      const response = await fetch(`${API_URL}/api/change-password`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      })

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Password changed successfully'
        })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        const data = await response.json()
        throw new Error(data.detail || 'Failed to change password')
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to change password',
        variant: 'destructive'
      })
    } finally {
      setChangingPassword(false)
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading settings...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">Settings</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Update your login password</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={changingPassword}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Enter new password (min 6 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={changingPassword}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={changingPassword}
              />
            </div>
            <Button
              onClick={handleChangePassword}
              disabled={changingPassword}
              variant="secondary"
            >
              <Key className="w-4 h-4 mr-2" />
              {changingPassword ? 'Changing Password...' : 'Change Password'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>OpenAI</CardTitle>
                <CardDescription>Configure ChatGPT API settings</CardDescription>
              </div>
              <Switch
                checked={settings.openai.enabled}
                onCheckedChange={(checked) => updateProviderSetting('openai', 'enabled', checked)}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="openai-key">API Key</Label>
              <Input
                id="openai-key"
                type="password"
                placeholder="sk-..."
                value={settings.openai.api_key || ''}
                onChange={(e) => updateProviderSetting('openai', 'api_key', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="openai-model">Model</Label>
              <Select
                value={settings.openai.model || 'gpt-4'}
                onValueChange={(value) => updateProviderSetting('openai', 'model', value)}
              >
                <SelectTrigger id="openai-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.openai.map(model => (
                    <SelectItem key={model} value={model}>{model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Perplexity</CardTitle>
                <CardDescription>Configure Perplexity API settings</CardDescription>
              </div>
              <Switch
                checked={settings.perplexity.enabled}
                onCheckedChange={(checked) => updateProviderSetting('perplexity', 'enabled', checked)}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="perplexity-key">API Key</Label>
              <Input
                id="perplexity-key"
                type="password"
                placeholder="pplx-..."
                value={settings.perplexity.api_key || ''}
                onChange={(e) => updateProviderSetting('perplexity', 'api_key', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="perplexity-model">Model</Label>
              <Select
                value={settings.perplexity.model || 'sonar'}
                onValueChange={(value) => updateProviderSetting('perplexity', 'model', value)}
              >
                <SelectTrigger id="perplexity-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.perplexity.map(model => (
                    <SelectItem key={model} value={model}>{model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Anthropic</CardTitle>
                <CardDescription>Configure Claude API settings</CardDescription>
              </div>
              <Switch
                checked={settings.anthropic.enabled}
                onCheckedChange={(checked) => updateProviderSetting('anthropic', 'enabled', checked)}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="anthropic-key">API Key</Label>
              <Input
                id="anthropic-key"
                type="password"
                placeholder="sk-ant-..."
                value={settings.anthropic.api_key || ''}
                onChange={(e) => updateProviderSetting('anthropic', 'api_key', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="anthropic-model">Model</Label>
              <Select
                value={settings.anthropic.model || 'claude-3-sonnet-20240229'}
                onValueChange={(value) => updateProviderSetting('anthropic', 'model', value)}
              >
                <SelectTrigger id="anthropic-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.anthropic.map(model => (
                    <SelectItem key={model} value={model}>{model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Gemini</CardTitle>
                <CardDescription>Configure Google Gemini API settings</CardDescription>
              </div>
              <Switch
                checked={settings.gemini.enabled}
                onCheckedChange={(checked) => updateProviderSetting('gemini', 'enabled', checked)}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gemini-key">API Key</Label>
              <Input
                id="gemini-key"
                type="password"
                placeholder="AIza..."
                value={settings.gemini.api_key || ''}
                onChange={(e) => updateProviderSetting('gemini', 'api_key', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gemini-model">Model</Label>
              <Select
                value={settings.gemini.model || 'gemini-pro'}
                onValueChange={(value) => updateProviderSetting('gemini', 'model', value)}
              >
                <SelectTrigger id="gemini-model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.gemini.map(model => (
                    <SelectItem key={model} value={model}>{model}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversation Distillation</CardTitle>
            <CardDescription>Configure how conversation context is preserved in multi-turn conversations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="distillation-mode">Distillation Mode</Label>
              <Select
                value={settings.distillation.mode}
                onValueChange={(value) => setSettings(prev => ({
                  ...prev,
                  distillation: { ...prev.distillation, mode: value }
                }))}
              >
                <SelectTrigger id="distillation-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single Model (use one model for all distillation)</SelectItem>
                  <SelectItem value="per-model">Per-Model (each model distills its own turns)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {settings.distillation.mode === 'single' && (
              <div className="space-y-2">
                <Label htmlFor="distillation-model">Distillation Model</Label>
                <Select
                  value={settings.distillation.model}
                  onValueChange={(value) => setSettings(prev => ({
                    ...prev,
                    distillation: { ...prev.distillation, model: value }
                  }))}
                >
                  <SelectTrigger id="distillation-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">Gemini (recommended)</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                    <SelectItem value="anthropic">Anthropic</SelectItem>
                    <SelectItem value="perplexity">Perplexity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave}>
          <Save className="w-4 h-4 mr-2" />
          Save Settings
        </Button>
      </div>
    </div>
  )
}
