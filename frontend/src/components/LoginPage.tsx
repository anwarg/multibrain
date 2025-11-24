import { useState } from 'react'
import { LogIn, UserPlus } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { useToast } from '../hooks/use-toast'

interface LoginPageProps {
  onLoginSuccess: (token: string) => void
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const { toast } = useToast()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [isRegistering, setIsRegistering] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!username || !password) {
      toast({
        title: 'Error',
        description: 'Please enter both username and password',
        variant: 'destructive'
      })
      return
    }

    if (isRegistering && password.length < 6) {
      toast({
        title: 'Error',
        description: 'Password must be at least 6 characters long',
        variant: 'destructive'
      })
      return
    }

    setLoading(true)

    try {
      const endpoint = isRegistering ? '/api/register' : '/api/login'
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Request failed')
      }

      const data = await response.json()
      localStorage.setItem('auth_token', data.access_token)
      onLoginSuccess(data.access_token)
      
      toast({
        title: 'Success',
        description: isRegistering ? 'Account created successfully' : 'Logged in successfully'
      })
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || (isRegistering ? 'Registration failed' : 'Invalid username or password'),
        variant: 'destructive'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">MultiBrain</CardTitle>
          <CardDescription className="text-center">
            {isRegistering ? 'Create a new account' : 'Sign in to access your conversations'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder={isRegistering ? "At least 6 characters" : "Enter password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                isRegistering ? 'Creating account...' : 'Signing in...'
              ) : (
                <>
                  {isRegistering ? (
                    <>
                      <UserPlus className="w-4 h-4 mr-2" />
                      Create Account
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4 mr-2" />
                      Sign In
                    </>
                  )}
                </>
              )}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <Button
              variant="link"
              onClick={() => {
                setIsRegistering(!isRegistering)
                setUsername('')
                setPassword('')
              }}
              disabled={loading}
              className="text-sm"
            >
              {isRegistering ? 'Already have an account? Sign in' : 'Need an account? Create one'}
            </Button>
          </div>
          {!isRegistering && (
            <div className="mt-2 text-sm text-gray-500 text-center">
              Default credentials: admin / admin123
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
