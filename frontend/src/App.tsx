import { useState, useEffect } from 'react'
import { Settings, LogOut, MessageSquare } from 'lucide-react'
import LoginPage from './components/LoginPage'
import SettingsPage from './components/SettingsPage'
import ConversationInterface from './components/ConversationInterface'
import PromptInterface from './components/PromptInterface'
import { Button } from './components/ui/button'
import { isAuthenticated, logout } from './utils/api'

function App() {
  const [showSettings, setShowSettings] = useState(false)
  const [showQuickPrompt, setShowQuickPrompt] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    setIsLoggedIn(isAuthenticated())
  }, [])

  const handleLoginSuccess = () => {
    setIsLoggedIn(true)
  }

  const handleLogout = () => {
    logout()
    setIsLoggedIn(false)
  }

  if (!isLoggedIn) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">MultiBrain</h1>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowQuickPrompt(!showQuickPrompt)
                setShowSettings(false)
              }}
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              {showQuickPrompt ? 'Conversations' : 'Quick Prompt'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowSettings(!showSettings)
                setShowQuickPrompt(false)
              }}
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {showSettings ? (
          <SettingsPage onClose={() => setShowSettings(false)} />
        ) : showQuickPrompt ? (
          <PromptInterface />
        ) : (
          <ConversationInterface />
        )}
      </main>
    </div>
  )
}

export default App
