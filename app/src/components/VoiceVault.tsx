import React, { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import {
  Mic,
  MicOff,
  PhoneOff,
  Users,
  Copy,
  ChevronDown,
  ChevronRight,
  Crown,
  UserCheck,
  Volume2,
  CheckCircle,
  AlertCircle,
  XCircle,
  Plus,
  LogIn,
  Sun,
  Moon,
  Lock,
  Hash,
  Settings,
  Home,
} from "lucide-react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Badge } from "./ui/badge"
import { productionWebRTCService } from '../services/production-webrtc'
import { solanaService } from '../services/solana'

// Theme Context
const ThemeContext = createContext<{
  theme: "light" | "dark"
  toggleTheme: () => void
}>({
  theme: "dark",
  toggleTheme: () => {},
})

// Types
interface ConnectionStatus {
  solana: "connected" | "disconnected" | "connecting"
  ipfs: "connected" | "p2p-fallback" | "disconnected"
  voice: "active" | "inactive" | "connecting"
}

interface Channel {
  id: string
  name: string
  isOwner: boolean
  participants: number
  status: "active" | "inactive"
  createdAt: string
}

interface Participant {
  id: string
  address: string
  isMuted: boolean
  isActive: boolean
}

interface VoiceSession {
  channelId: string
  channelName: string
  participants: Participant[]
  isConnected: boolean
  isMuted: boolean
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("dark")

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"))
  }

  // Apply theme to document
  useEffect(() => {
    document.documentElement.className = theme
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div className={theme}>{children}</div>
    </ThemeContext.Provider>
  )
}

function useTheme() {
  return useContext(ThemeContext)
}

// Persistent channel storage
const STORAGE_KEYS = {
  CREATED_CHANNELS: 'decentravoice_created_channels',
  JOINED_CHANNELS: 'decentravoice_joined_channels'
}

const saveChannelToStorage = (channel: Channel, type: 'created' | 'joined') => {
  const key = type === 'created' ? STORAGE_KEYS.CREATED_CHANNELS : STORAGE_KEYS.JOINED_CHANNELS
  const existing = JSON.parse(localStorage.getItem(key) || '[]')
  const updated = [...existing.filter((c: Channel) => c.id !== channel.id), channel]
  localStorage.setItem(key, JSON.stringify(updated))
}

const getChannelsFromStorage = (type: 'created' | 'joined'): Channel[] => {
  const key = type === 'created' ? STORAGE_KEYS.CREATED_CHANNELS : STORAGE_KEYS.JOINED_CHANNELS
  return JSON.parse(localStorage.getItem(key) || '[]')
}

function VoiceVaultApp() {
  const { theme, toggleTheme } = useTheme()
  const wallet = useWallet()

  // State management
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    solana: "disconnected",
    ipfs: "disconnected",
    voice: "inactive",
  })
  const [decentralizationLevel, setDecentralizationLevel] = useState<"full" | "partial" | "local">("local")
  const [channelsExpanded, setChannelsExpanded] = useState(true)
  const [createChannelName, setCreateChannelName] = useState("")
  const [joinChannelId, setJoinChannelId] = useState("")
  const [isCreatingChannel, setIsCreatingChannel] = useState(false)
  const [isJoiningChannel, setIsJoiningChannel] = useState(false)
  const [activeVoiceSession, setActiveVoiceSession] = useState<VoiceSession | null>(null)
  const [myChannels, setMyChannels] = useState<{ created: Channel[]; joined: Channel[] }>({
    created: [],
    joined: [],
  })
  const [notifications, setNotifications] = useState<
    Array<{ id: string; type: "success" | "error" | "info"; message: string }>
  >([])
  const [activeSection, setActiveSection] = useState<"home" | "channels" | "settings">("home")

  // Utility functions
  const addNotification = (type: "success" | "error" | "info", message: string) => {
    const id = Math.random().toString(36).substr(2, 9)
    setNotifications(prev => [...prev, { id, type, message }])
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 5000)
  }

  // Memoized event handlers to prevent re-initialization
  const handleSignalingConnected = useCallback((method: string) => {
    console.log(`🔗 Connected via ${method}`)
    addNotification("success", `Connected via ${method}`)
    
    setConnectionStatus(prev => ({
      ...prev,
      ipfs: method === 'IPFS' ? "connected" : 
            method === 'WebSocket' ? "p2p-fallback" : "disconnected"
    }))
  }, [])

  const handlePeerConnected = useCallback((peerId: string) => {
    console.log(`👥 Peer connected: ${peerId}`)
    addNotification("success", "Voice connection established")
  }, [])

  const handleError = useCallback((error: Error) => {
    console.error('Production WebRTC error:', error)
    addNotification("error", `Connection error: ${error.message}`)
  }, [])

  // Initialize services
  useEffect(() => {
    const initializeServices = async () => {
      try {
        // Initialize the new production service
        await productionWebRTCService.initialize()
        await solanaService.initialize(wallet)
        
        const solanaConnected = solanaService.isConnectedToSolana()
        
        // Check if production WebRTC is connected
        const webrtcMethod = productionWebRTCService.getCurrentSignalingMethod()
        const webrtcConnected = productionWebRTCService.isConnected()
        
        setConnectionStatus({
          solana: solanaConnected ? "connected" : "disconnected",
          ipfs: webrtcMethod === 'IPFS' ? "connected" : 
                webrtcMethod === 'WebSocket' ? "p2p-fallback" : "disconnected",
          voice: "inactive"
        })
        
        // Update decentralization level based on active signaling method
        if (webrtcMethod === 'IPFS' && solanaConnected) {
          setDecentralizationLevel("full")
        } else if (webrtcMethod === 'WebSocket' || solanaConnected) {
          setDecentralizationLevel("partial")
        } else {
          setDecentralizationLevel("local")
        }
        
        console.log('🚀 Services initialized:', { 
          solanaConnected, 
          webrtcMethod,
          webrtcConnected 
        })
        
      } catch (error) {
        console.error('Error initializing services:', error)
        addNotification("error", "Failed to initialize services")
      }
    }

    initializeServices()

    // Set up callbacks for the new production service
    productionWebRTCService.setParticipantUpdateCallback((participants: string[]) => {
      if (activeVoiceSession) {
        setActiveVoiceSession(prev => prev ? {
          ...prev,
          participants: participants.map(id => ({
            id,
            address: id.startsWith('peer-') ? id.substring(5, 13) : id.substring(0, 8),
            isMuted: false,
            isActive: true
          }))
        } : null)
      }
    })

    productionWebRTCService.setStatusUpdateCallback((statusMessage: string) => {
      addNotification("info", statusMessage)
    })

    productionWebRTCService.on('signaling-connected', handleSignalingConnected)
    productionWebRTCService.on('peer-connected', handlePeerConnected)
    productionWebRTCService.on('error', handleError)

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up VoiceVault component...')
      
      // Remove event listeners
      productionWebRTCService.off('signaling-connected', handleSignalingConnected)
      productionWebRTCService.off('peer-connected', handlePeerConnected)
      productionWebRTCService.off('error', handleError)
    }
  }, [wallet, handleSignalingConnected, handlePeerConnected, handleError])

  // Monitor wallet connection changes
  useEffect(() => {
    const updateConnectionStatus = async () => {
      if (wallet.connected && wallet.publicKey) {
        await solanaService.initialize(wallet)
        const solanaConnected = solanaService.isConnectedToSolana()
        
        setConnectionStatus(prev => ({
          ...prev,
          solana: solanaConnected ? "connected" : "disconnected"
        }))
        
        if (solanaConnected) {
          setDecentralizationLevel("full")
          addNotification("success", "Connected to Solana blockchain!")
          loadMyChannels()
        }
      } else {
        await solanaService.initialize(null)
        setConnectionStatus(prev => ({
          ...prev,
          solana: "disconnected"
        }))
        setDecentralizationLevel("local")
        setMyChannels({ created: [], joined: [] })
        addNotification("info", "Wallet disconnected. Using local mode.")
      }
    }

    updateConnectionStatus()
  }, [wallet.connected, wallet.publicKey])

  // Load user's channels
  const loadMyChannels = async () => {
    if (!wallet.connected) return
    
    try {
      const created = getChannelsFromStorage('created')
      const joined = getChannelsFromStorage('joined')
      setMyChannels({ created, joined })
    } catch (error) {
      console.error('Error loading channels:', error)
    }
  }

  // Utility functions
  const createChannel = async () => {
    if (!createChannelName.trim()) return
    setIsCreatingChannel(true)

    try {
      const channelId = `CHAT-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
      const newChannel: Channel = {
        id: channelId,
        name: createChannelName,
        isOwner: true,
        participants: 1,
        status: "active",
        createdAt: new Date().toISOString().split('T')[0],
      }

      // Save to storage
      saveChannelToStorage(newChannel, 'created')
      
      setMyChannels(prev => ({
        ...prev,
        created: [...prev.created, newChannel]
      }))
      
      setCreateChannelName("")
      addNotification("success", `Channel "${createChannelName}" created! ID: ${channelId}`)
      
      // Auto-join the created channel
      await joinChannelById(channelId)
      
    } catch (error) {
      console.error('Error creating channel:', error)
      addNotification("error", "Failed to create channel")
    } finally {
      setIsCreatingChannel(false)
    }
  }

  const joinChannel = async () => {
    if (!joinChannelId.trim()) return
    await joinChannelById(joinChannelId)
  }

  const joinChannelById = async (channelId: string) => {
    if (!channelId.trim()) return

    try {
      setIsJoiningChannel(true)
      addNotification("info", `Joining channel: ${channelId}`)

      // Use production WebRTC service
      await productionWebRTCService.joinChannel(channelId)

      const newSession: VoiceSession = {
        channelId,
        channelName: channelId,
        participants: [{
          id: productionWebRTCService.getPeerId(),
          address: wallet.publicKey?.toString().substring(0, 8) || 'Unknown',
          isMuted: false,
          isActive: true
        }],
        isConnected: true,
        isMuted: false
      }

      setActiveVoiceSession(newSession)
      setConnectionStatus(prev => ({ ...prev, voice: "active" }))

      // Save to joined channels
      const channel: Channel = {
        id: channelId,
        name: channelId,
        isOwner: false,
        participants: 1,
        status: "active",
        createdAt: new Date().toISOString()
      }
      saveChannelToStorage(channel, 'joined')
      setMyChannels(prev => ({
        ...prev,
        joined: [...prev.joined.filter(c => c.id !== channelId), channel]
      }))

      addNotification("success", `Joined channel: ${channelId}`)
    } catch (error) {
      console.error("Error joining channel:", error)
      addNotification("error", "Failed to join channel")
    } finally {
      setIsJoiningChannel(false)
    }
  }

  const leaveVoiceSession = () => {
    if (activeVoiceSession) {
      productionWebRTCService.leaveChannel()
      setActiveVoiceSession(null)
      setConnectionStatus(prev => ({ ...prev, voice: "inactive" }))
      addNotification("info", "Left voice channel")
    }
  }

  const toggleMute = () => {
    if (activeVoiceSession) {
      const isMuted = productionWebRTCService.toggleMute()
      setActiveVoiceSession(prev => prev ? { ...prev, isMuted } : null)
      addNotification("info", isMuted ? "Microphone muted" : "Microphone unmuted")
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    addNotification("success", "Copied to clipboard!")
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "connected":
      case "active":
        return "text-green-500"
      case "connecting":
        return "text-yellow-500"
      case "p2p-fallback":
        return "text-blue-500"
      default:
        return "text-red-500"
    }
  }

  const getStatusDot = (status: string) => {
    switch (status) {
      case "connected":
      case "active":
        return "🟢"
      case "connecting":
        return "🟡"
      case "p2p-fallback":
        return "🔵"
      default:
        return "🔴"
    }
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <div className="w-64 bg-card border-r border-border flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold text-card-foreground">VoiceVault</h1>
          </div>
          <p className="text-sm text-muted-foreground">Secure Voice Chat</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          <Button
            variant={activeSection === "home" ? "default" : "ghost"}
            className="w-full justify-start"
            onClick={() => setActiveSection("home")}
          >
            <Home className="h-4 w-4 mr-2" />
            Home
          </Button>
          
          <div>
            <Button
              variant="ghost"
              className="w-full justify-between"
              onClick={() => setChannelsExpanded(!channelsExpanded)}
            >
              <div className="flex items-center">
                <Hash className="h-4 w-4 mr-2" />
                Channels
              </div>
              {channelsExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            
            {channelsExpanded && (
              <div className="ml-4 mt-2 space-y-1">
                {myChannels.created.map((channel) => (
                  <Button
                    key={channel.id}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs"
                    onClick={() => joinChannelById(channel.id)}
                  >
                    <Crown className="h-3 w-3 mr-2" />
                    {channel.name}
                  </Button>
                ))}
                {myChannels.joined.map((channel) => (
                  <Button
                    key={channel.id}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs"
                    onClick={() => joinChannelById(channel.id)}
                  >
                    <UserCheck className="h-3 w-3 mr-2" />
                    {channel.name}
                  </Button>
                ))}
              </div>
            )}
          </div>

          <Button
            variant={activeSection === "settings" ? "default" : "ghost"}
            className="w-full justify-start"
            onClick={() => setActiveSection("settings")}
          >
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </nav>

        {/* Status Section */}
        <div className="p-4 border-t border-border">
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              STATUS
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm">Solana</span>
                <span className={`text-xs ${getStatusColor(connectionStatus.solana)}`}>
                  {getStatusDot(connectionStatus.solana)} {connectionStatus.solana}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">IPFS</span>
                <span className={`text-xs ${getStatusColor(connectionStatus.ipfs)}`}>
                  {getStatusDot(connectionStatus.ipfs)} {connectionStatus.ipfs}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Voice P2P</span>
                <span className={`text-xs ${getStatusColor(connectionStatus.voice)}`}>
                  {getStatusDot(connectionStatus.voice)} {connectionStatus.voice}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {wallet.connected ? "Connected" : "Not connected"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="border-b border-border p-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Welcome to VoiceVault</h2>
            <p className="text-muted-foreground">
              Secure, decentralized voice communication on the Solana blockchain.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant={decentralizationLevel === "full" ? "default" : "secondary"}>
              {decentralizationLevel === "full" ? "Fully Decentralized" : 
               decentralizationLevel === "partial" ? "Partially Decentralized" : "Local Mode"}
            </Badge>
            <WalletMultiButton />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-6">
          {activeSection === "home" && (
            <div className="max-w-4xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* Create Channel */}
                <div className="bg-card border border-border rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Plus className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold text-card-foreground">Create Channel</h3>
                  </div>
                  <div className="space-y-4">
                    <Input
                      placeholder="Channel name..."
                      value={createChannelName}
                      onChange={(e) => setCreateChannelName(e.target.value)}
                    />
                    <Button
                      onClick={createChannel}
                      disabled={isCreatingChannel || !createChannelName.trim()}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {isCreatingChannel ? "Creating..." : "Create Channel"}
                    </Button>
                  </div>
                </div>

                {/* Join Channel */}
                <div className="bg-card border border-border rounded-lg p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <LogIn className="h-5 w-5 text-green-600" />
                    <h3 className="text-lg font-semibold text-card-foreground">Join Channel</h3>
                  </div>
                  <div className="space-y-4">
                    <Input
                      placeholder="Channel ID..."
                      value={joinChannelId}
                      onChange={(e) => setJoinChannelId(e.target.value)}
                    />
                    <Button
                      onClick={joinChannel}
                      disabled={isJoiningChannel || !joinChannelId.trim()}
                      className="w-full"
                      variant="outline"
                    >
                      <LogIn className="h-4 w-4 mr-2" />
                      {isJoiningChannel ? "Joining..." : "Join Channel"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Active Voice Session */}
              {activeVoiceSession && (
                <div className="bg-card border border-border rounded-lg p-6 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-5 w-5 text-green-600" />
                      <h3 className="text-lg font-semibold text-card-foreground">Active Voice Session</h3>
                    </div>
                    <Badge variant="default">
                      <Users className="h-3 w-3 mr-1" />
                      {activeVoiceSession.participants.length + 1}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-card-foreground">{activeVoiceSession.channelName}</p>
                      <p className="text-sm text-muted-foreground">
                        Channel ID: {activeVoiceSession.channelId}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(activeVoiceSession.channelId)}
                          className="ml-2"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant={activeVoiceSession.isMuted ? "destructive" : "outline"}
                        size="sm"
                        onClick={toggleMute}
                      >
                        {activeVoiceSession.isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={leaveVoiceSession}
                      >
                        <PhoneOff className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Network Status */}
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4 text-card-foreground">Network Status</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-card-foreground">Solana</span>
                    <Badge variant={connectionStatus.solana === "connected" ? "default" : "destructive"}>
                      {getStatusDot(connectionStatus.solana)} {connectionStatus.solana}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-card-foreground">IPFS</span>
                    <Badge variant={connectionStatus.ipfs === "connected" ? "default" : "secondary"}>
                      {getStatusDot(connectionStatus.ipfs)} {connectionStatus.ipfs}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-card-foreground">Voice P2P</span>
                    <Badge variant={connectionStatus.voice === "active" ? "default" : "secondary"}>
                      {getStatusDot(connectionStatus.voice)} {connectionStatus.voice}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Notifications */}
      <div className="fixed top-4 right-4 space-y-2 z-50">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className={`p-3 rounded-md shadow-lg ${
              notification.type === "success" ? "bg-green-500 text-white" :
              notification.type === "error" ? "bg-red-500 text-white" :
              "bg-blue-500 text-white"
            }`}
          >
            <div className="flex items-center gap-2">
              {notification.type === "success" && <CheckCircle className="h-4 w-4" />}
              {notification.type === "error" && <XCircle className="h-4 w-4" />}
              {notification.type === "info" && <AlertCircle className="h-4 w-4" />}
              <span className="text-sm">{notification.message}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function VoiceVault() {
  return (
    <ThemeProvider>
      <VoiceVaultApp />
    </ThemeProvider>
  )
} 