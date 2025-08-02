import { EventEmitter } from 'events'
import { config } from '../config'

export interface ProductionSignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'peer-joined' | 'peer-left' | 'channel-state' | 'subscribe'
  from: string
  to?: string
  data?: any
  timestamp: number
  channelId: string
  signalMethod?: 'websocket' | 'ipfs' | 'gun' | 'torrent' | 'local'
}

export interface ConnectionQuality {
  bitrate: number
  packetsLost: number
  jitter: number
  roundTripTime: number
  quality: 'excellent' | 'good' | 'fair' | 'poor'
}

export interface Participant {
  id: string
  address: string
  isMuted: boolean
  isActive: boolean
  signalMethod?: string
  connectionQuality?: ConnectionQuality
}

// Signaling Method Interface
interface SignalingMethod {
  getName(): string
  initialize(): Promise<void>
  test(): Promise<boolean>
  subscribe(channelId: string, onMessage: (message: ProductionSignalingMessage) => void): Promise<void>
  publish(message: ProductionSignalingMessage): Promise<void>
  unsubscribe(): Promise<void>
  disconnect(): void
}

export class ProductionWebRTCService extends EventEmitter {
  private localStream: MediaStream | null = null
  private peers: Map<string, RTCPeerConnection> = new Map()
  private connectionQuality: Map<string, ConnectionQuality> = new Map()
  private currentChannelId: string | null = null
  private myPeerId: string
  private participants: Map<string, Participant> = new Map()
  
  // Signaling methods in priority order
  private signalingMethods: SignalingMethod[] = []
  private activeSignaling: SignalingMethod | null = null
  
  // Enhanced RTC configuration
  private rtcConfig: RTCConfiguration = {
    iceServers: [
      // Free STUN servers
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'stun:stun.services.mozilla.com' },
      { urls: 'stun:stun.ekiga.net' },
      
      // Free TURN servers
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
  }

  private processedMessages: Set<string> = new Set()
  private _messageCleanupInterval: NodeJS.Timeout | null = null
  private _qualityMonitoringIntervals: Map<string, NodeJS.Timeout> = new Map()

  constructor() {
    super()
    this.setMaxListeners(20)
    this.myPeerId = this.generatePeerId()
    this.initializeSignalingMethods()
    
    // Clean up old message IDs every 30 seconds
    this._messageCleanupInterval = setInterval(() => {
      this.processedMessages.clear()
    }, 30000)
  }

  private generatePeerId(): string {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 8)
    return `peer-${timestamp}-${random}`
  }

  private async initializeSignalingMethods(): Promise<void> {
    // Initialize signaling methods (focus on WebSocket only for now)
    this.signalingMethods = [
      new WebSocketSignaling(config.signaling?.wsEndpoints || ['https://laced-faceted-calf.glitch.me']),
      // Skip Gun.js for now since all relay servers are down
      // new GunSignaling(),
      new LocalStorageSignaling() // Fallback for local testing
    ]
  }

  async initialize(): Promise<void> {
    console.log('🚀 Initializing Production WebRTC Service')
    console.log(`🆔 Peer ID: ${this.myPeerId}`)
    
    // Try WebSocket first with more persistence
    const wsMethod = this.signalingMethods[0] // WebSocket is first
    if (wsMethod.getName() === 'WebSocket') {
      try {
        console.log('🔍 Testing WebSocket with priority...')
        await wsMethod.initialize()
        
        // Give WebSocket more time and multiple attempts
        let wsWorking = false
        for (let i = 0; i < 3; i++) {
          await new Promise(resolve => setTimeout(resolve, 200 * (i + 1)))
          wsWorking = await wsMethod.test()
          console.log(`🧪 WebSocket attempt ${i + 1}: ${wsWorking}`)
          if (wsWorking) break
        }
        
        if (wsWorking) {
          this.activeSignaling = wsMethod
          console.log(`✅ Using WebSocket for signaling`)
          this.emit('signaling-connected', 'WebSocket')
          return
        }
      } catch (error) {
        console.log(`❌ WebSocket failed:`, error)
      }
    }
    
    // Try other methods if WebSocket fails
    for (const method of this.signalingMethods.slice(1)) {
      try {
        console.log(`🔍 Testing ${method.getName()}...`)
        await method.initialize()
        if (await method.test()) {
          this.activeSignaling = method
          console.log(`✅ Using ${method.getName()} for signaling`)
          this.emit('signaling-connected', method.getName())
          return
        }
      } catch (error) {
        console.log(`❌ ${method.getName()} failed:`, error)
      }
    }
    
    // Fallback to localStorage if all else fails
    this.activeSignaling = this.signalingMethods[this.signalingMethods.length - 1]
    console.log('⚠️ Using localStorage fallback (local only)')
    this.emit('signaling-connected', 'localStorage (local only)')
  }

  async joinChannel(channelId: string): Promise<void> {
    console.log(`🚪 Joining channel: ${channelId}`)
    this.currentChannelId = channelId
    
    try {
      // Get user media with enhanced audio settings
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
          sampleSize: 16
        }
      })
      
      console.log('🎤 Microphone ready with enhanced audio')
      this.emit('microphone-ready')
      
      // Subscribe to signaling
      if (this.activeSignaling) {
        await this.activeSignaling.subscribe(channelId, (message) => {
          this.handleSignalingMessage(message)
        })
      }
      
      // Announce presence with retry logic
      this.announcePresence(channelId)
      
    } catch (error) {
      console.error('❌ Error joining channel:', error)
      this.emit('error', error)
      throw error
    }
  }

  private async announcePresence(channelId: string, retries = 3): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        await this.publishMessage({
          type: 'peer-joined',
          from: this.myPeerId,
          channelId,
          data: {
            peerId: this.myPeerId,
            signalMethod: this.activeSignaling?.getName(),
            capabilities: {
              audio: true,
              video: false,
              screenShare: false
            }
          },
          timestamp: Date.now()
        })
        
        console.log('✅ Presence announced')
        return
      } catch (error) {
        console.log(`⚠️ Announce presence attempt ${i + 1} failed`)
        await this.delay(1000 * (i + 1))
      }
    }
  }

  private async handleSignalingMessage(message: ProductionSignalingMessage): Promise<void> {
    // Enhanced message deduplication with safe data handling
    const dataString = message.data ? JSON.stringify(message.data).substring(0, 50) : 'no-data'
    const messageKey = `${message.from}-${message.type}-${message.timestamp}-${dataString}`
    
    if (this.processedMessages.has(messageKey)) {
      console.log(`⏭️ Skipping duplicate message: ${message.type} from ${message.from}`)
      return
    }
    
    this.processedMessages.add(messageKey)
    
    // Validate message structure
    if (!message.type || !message.from || !message.channelId) {
      console.warn('⚠️ Invalid message structure:', message)
      return
    }
    
    // Only process messages for our current channel
    if (message.channelId !== this.currentChannelId) {
      console.log(`⏭️ Ignoring message for different channel: ${message.channelId}`)
      return
    }
    
    // Don't process our own messages
    if (message.from === this.myPeerId) {
      return
    }
    
    console.log(`📥 Processing ${message.type} from ${message.from}`)
    
    try {
      switch (message.type) {
        case 'peer-joined':
          await this.handlePeerJoined(message.from, message.data)
          break
        case 'offer':
          if (message.to === this.myPeerId) {
            await this.handleOffer(message.from, message.data)
          }
          break
        case 'answer':
          if (message.to === this.myPeerId) {
            await this.handleAnswer(message.from, message.data)
          }
          break
        case 'ice-candidate':
          if (message.to === this.myPeerId) {
            await this.handleIceCandidate(message.from, message.data)
          }
          break
        case 'peer-left':
          await this.handlePeerLeft(message.from)
          break
        case 'subscribe':
          // Handle subscribe messages (someone joined the channel)
          console.log(`📡 ${message.from} subscribed to channel`)
          break
        default:
          console.log(`⚠️ Unknown message type: ${message.type}`)
      }
    } catch (error) {
      console.error(`❌ Error handling ${message.type} from ${message.from}:`, error)
    }
  }

  private async handlePeerJoined(remotePeerId: string, data: any): Promise<void> {
    console.log(`👋 Peer joined: ${remotePeerId}`)
    
    // Add to participants
    this.participants.set(remotePeerId, {
      id: remotePeerId,
      address: remotePeerId.substring(5, 13),
      isMuted: false,
      isActive: true,
      signalMethod: data?.signalMethod
    })
    
    this.emit('participant-update', Array.from(this.participants.values()))
    
    // Only initiate connection if we have lower ID (prevents duplicate offers)
    if (this.myPeerId < remotePeerId && !this.peers.has(remotePeerId)) {
      console.log(`🤝 Initiating connection to ${remotePeerId}`)
      setTimeout(() => this.createOfferFor(remotePeerId), 1000)
    }
  }

  private async createOfferFor(remotePeerId: string): Promise<void> {
    try {
      const pc = await this.createPeerConnection(remotePeerId)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      
      await this.publishMessage({
        type: 'offer',
        from: this.myPeerId,
        to: remotePeerId,
        data: offer,
        channelId: this.currentChannelId!,
        timestamp: Date.now()
      })
    } catch (error) {
      console.error(`❌ Error creating offer for ${remotePeerId}:`, error)
    }
  }

  private async handleOffer(fromPeerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    try {
      console.log(`📨 Handling offer from ${fromPeerId}`)
      
      const pc = await this.createPeerConnection(fromPeerId)
      await pc.setRemoteDescription(offer)
      
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      
      await this.publishMessage({
        type: 'answer',
        from: this.myPeerId,
        to: fromPeerId,
        data: answer,
        channelId: this.currentChannelId!,
        timestamp: Date.now()
      })
    } catch (error) {
      console.error(`❌ Error handling offer from ${fromPeerId}:`, error)
    }
  }

  private async handleAnswer(fromPeerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    try {
      const pc = this.peers.get(fromPeerId)
      if (pc && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(answer)
        console.log(`✅ Answer processed from ${fromPeerId}`)
      } else {
        console.log(`⚠️ Skipping answer from ${fromPeerId} - wrong state: ${pc?.signalingState}`)
      }
    } catch (error) {
      console.error(`❌ Error handling answer from ${fromPeerId}:`, error)
    }
  }

  private async handleIceCandidate(fromPeerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    try {
      const pc = this.peers.get(fromPeerId)
      if (pc) {
        await pc.addIceCandidate(candidate)
        console.log(`🧊 ICE candidate added from ${fromPeerId}`)
      }
    } catch (error) {
      console.error(`❌ Error handling ICE candidate from ${fromPeerId}:`, error)
    }
  }

  private async handlePeerLeft(peerId: string): Promise<void> {
    console.log(`👋 Peer left: ${peerId}`)
    
    // Close and remove peer connection
    const pc = this.peers.get(peerId)
    if (pc) {
      pc.close()
      this.peers.delete(peerId)
    }
    
    // Clean up quality monitoring
    const qualityInterval = this._qualityMonitoringIntervals.get(peerId)
    if (qualityInterval) {
      clearInterval(qualityInterval)
      this._qualityMonitoringIntervals.delete(peerId)
    }
    
    // Remove connection quality data
    this.connectionQuality.delete(peerId)
    
    // Remove from participants
    this.participants.delete(peerId)
    this.emit('participant-update', Array.from(this.participants.values()))
    
    // Remove audio element
    const audioElement = document.getElementById(`audio-${peerId}`)
    if (audioElement) {
      audioElement.remove()
    }
  }

  private async createPeerConnection(remotePeerId: string): Promise<RTCPeerConnection> {
    console.log(`🔧 Creating peer connection for ${remotePeerId}`)
    
    const pc = new RTCPeerConnection(this.rtcConfig)
    
    // Add local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!)
      })
    }
    
    // Handle remote stream
    pc.ontrack = (event) => {
      console.log(`🎵 Received remote audio from ${remotePeerId}`)
      if (event.streams?.[0]) {
        this.playRemoteStream(event.streams[0], remotePeerId)
        this.emit('peer-connected', remotePeerId)
      }
    }
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && this.currentChannelId) {
        this.publishMessage({
          type: 'ice-candidate',
          from: this.myPeerId,
          to: remotePeerId,
          data: event.candidate,
          channelId: this.currentChannelId,
          timestamp: Date.now()
        })
      }
    }
    
    // Monitor connection state
    pc.onconnectionstatechange = () => {
      console.log(`📊 Connection state for ${remotePeerId}: ${pc.connectionState}`)
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.handleConnectionFailure(remotePeerId)
      }
    }
    
    // Monitor connection quality
    this.startQualityMonitoring(pc, remotePeerId)
    
    this.peers.set(remotePeerId, pc)
    return pc
  }

  private playRemoteStream(stream: MediaStream, peerId: string): void {
    console.log(`🔊 Playing audio from ${peerId}`)
    
    // Remove existing audio element if any
    const existingAudio = document.getElementById(`audio-${peerId}`)
    if (existingAudio) {
      existingAudio.remove()
    }
    
    const audio = document.createElement('audio')
    audio.id = `audio-${peerId}`
    audio.srcObject = stream
    audio.autoplay = true
    audio.volume = 1.0
    audio.style.display = 'none' // Hide the audio element
    
    // Try to play with fallback
    const playAudio = async () => {
      try {
        await audio.play()
        console.log(`✅ Audio playing for ${peerId}`)
        this.emit('audio-started', peerId)
      } catch (error) {
        console.warn(`⚠️ Autoplay blocked, user interaction required`)
        this.emit('autoplay-blocked')
        
        const enableAudio = async () => {
          try {
            await audio.play()
            this.emit('audio-started', peerId)
            console.log(`✅ Audio enabled after user interaction for ${peerId}`)
          } catch (e) {
            console.error('Failed to play audio:', e)
            this.emit('audio-failed', { peerId, error: e })
          }
          document.removeEventListener('click', enableAudio)
          document.removeEventListener('touchstart', enableAudio)
        }
        
        // Add multiple event types for better mobile support
        document.addEventListener('click', enableAudio, { once: true })
        document.addEventListener('touchstart', enableAudio, { once: true })
      }
    }
    
    // Handle stream events
    audio.onloadedmetadata = playAudio
    audio.onerror = (error) => {
      console.error(`Audio error for ${peerId}:`, error)
      this.emit('audio-failed', { peerId, error })
    }
    
    // Append to a dedicated container or body
    const audioContainer = document.getElementById('webrtc-audio-container') || document.body
    audioContainer.appendChild(audio)
  }

  private async handleConnectionFailure(remotePeerId: string): Promise<void> {
    console.log(`⚠️ Connection failed for ${remotePeerId}, attempting recovery...`)
    
    // Clean up failed connection
    const pc = this.peers.get(remotePeerId)
    if (pc) {
      pc.close()
      this.peers.delete(remotePeerId)
    }
    
    // Clean up quality monitoring
    const qualityInterval = this._qualityMonitoringIntervals.get(remotePeerId)
    if (qualityInterval) {
      clearInterval(qualityInterval)
      this._qualityMonitoringIntervals.delete(remotePeerId)
    }
    
    // Clean up audio element
    const audioElement = document.getElementById(`audio-${remotePeerId}`)
    if (audioElement) {
      audioElement.remove()
    }
    
    // Update participant status
    const participant = this.participants.get(remotePeerId)
    if (participant) {
      participant.isActive = false
      this.emit('participant-update', Array.from(this.participants.values()))
    }
    
    // Attempt reconnection with exponential backoff
    const retryDelay = Math.min(3000 * Math.pow(1.5, this.peers.size), 30000) // Max 30s delay
    
    setTimeout(() => {
      // Only retry if we're still in the channel and signaling is active
      if (this.currentChannelId && this.participants.has(remotePeerId) && this.activeSignaling) {
        console.log(`🔄 Retrying connection to ${remotePeerId}...`)
        this.createOfferFor(remotePeerId)
      }
    }, retryDelay)
  }

  private startQualityMonitoring(pc: RTCPeerConnection, peerId: string): void {
    // Clear existing interval if any
    const existingInterval = this._qualityMonitoringIntervals.get(peerId)
    if (existingInterval) {
      clearInterval(existingInterval)
    }
    
    const interval = setInterval(async () => {
      if (pc.connectionState !== 'connected') {
        clearInterval(interval)
        this._qualityMonitoringIntervals.delete(peerId)
        return
      }
      
      const stats = await pc.getStats()
      let quality: ConnectionQuality = {
        bitrate: 0,
        packetsLost: 0,
        jitter: 0,
        roundTripTime: 0,
        quality: 'good'
      }
      
      stats.forEach(report => {
        if (report.type === 'inbound-rtp' && report.mediaType === 'audio') {
          quality.bitrate = report.bytesReceived || 0
          quality.packetsLost = report.packetsLost || 0
          quality.jitter = report.jitter || 0
        }
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          quality.roundTripTime = report.currentRoundTripTime || 0
        }
      })
      
      // Determine quality rating
      if (quality.roundTripTime > 500 || quality.packetsLost > 10) {
        quality.quality = 'poor'
      } else if (quality.roundTripTime > 200 || quality.packetsLost > 5) {
        quality.quality = 'fair'
      } else if (quality.roundTripTime > 100 || quality.packetsLost > 2) {
        quality.quality = 'good'
      } else {
        quality.quality = 'excellent'
      }
      
      this.connectionQuality.set(peerId, quality)
      
      // Update participant quality
      const participant = this.participants.get(peerId)
      if (participant) {
        participant.connectionQuality = quality
      }
      
      this.emit('quality-update', { peerId, quality })
    }, 5000)
    
    // Track the interval for cleanup
    this._qualityMonitoringIntervals.set(peerId, interval)
  }

  async leaveChannel(): Promise<void> {
    if (this.currentChannelId) {
      // Announce leaving
      await this.publishMessage({
        type: 'peer-left',
        from: this.myPeerId,
        channelId: this.currentChannelId,
        timestamp: Date.now()
      })
      
      // Clean up connections
      this.peers.forEach(pc => pc.close())
      this.peers.clear()
      this.participants.clear()
      
      // Stop local stream
      if (this.localStream) {
        this.localStream.getTracks().forEach(track => track.stop())
        this.localStream = null
      }
      
      // Unsubscribe from signaling
      if (this.activeSignaling) {
        await this.activeSignaling.unsubscribe()
      }
      
      this.currentChannelId = null
      this.emit('left-channel')
    }
  }

  toggleMute(): boolean {
    if (this.localStream) {
      const track = this.localStream.getAudioTracks()[0]
      if (track) {
        track.enabled = !track.enabled
        return !track.enabled
      }
    }
    return false
  }

  async switchSignalingMethod(methodName: string): Promise<void> {
    const method = this.signalingMethods.find(m => m.getName() === methodName)
    if (method && method !== this.activeSignaling) {
      // Unsubscribe from current method
      if (this.activeSignaling && this.currentChannelId) {
        await this.activeSignaling.unsubscribe()
      }
      
      // Try to initialize new method
      try {
        await method.initialize()
        if (await method.test()) {
          this.activeSignaling = method
          
          // Resubscribe if in a channel
          if (this.currentChannelId) {
            await this.activeSignaling.subscribe(this.currentChannelId, (message) => {
              this.handleSignalingMessage(message)
            })
          }
          
          this.emit('signaling-switched', method.getName())
        }
      } catch (error) {
        console.error(`Failed to switch to ${methodName}:`, error)
        throw error
      }
    }
  }

  private async publishMessage(message: ProductionSignalingMessage): Promise<void> {
    if (!this.activeSignaling) {
      throw new Error('No active signaling method')
    }
    
    message.signalMethod = this.activeSignaling.getName() as any
    await this.activeSignaling.publish(message)
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  // Public getters
  getPeerId(): string {
    return this.myPeerId
  }

  getParticipants(): Participant[] {
    return Array.from(this.participants.values())
  }

  getConnectionQuality(peerId: string): ConnectionQuality | undefined {
    return this.connectionQuality.get(peerId)
  }

  getCurrentSignalingMethod(): string {
    return this.activeSignaling?.getName() || 'none'
  }

  getAvailableSignalingMethods(): string[] {
    return this.signalingMethods.map(m => m.getName())
  }

  isConnected(): boolean {
    return this.currentChannelId !== null
  }

  // Compatibility methods for easy migration
  setParticipantUpdateCallback(callback: (participants: string[]) => void): void {
    this.on('participant-update', (participants: Participant[]) => {
      callback(participants.map(p => p.id))
    })
  }

  setStatusUpdateCallback(callback: (status: string) => void): void {
    this.on('signaling-connected', (method: string) => {
      callback(`Connected via ${method}`)
    })
    this.on('error', (error: Error) => {
      callback(`Error: ${error.message}`)
    })
  }

  getConnectedPeers(): string[] {
    return Array.from(this.peers.keys())
  }

  // Add destructor for proper cleanup
  destroy(): void {
    console.log('🧹 Destroying ProductionWebRTCService...')
    
    // Clear message cleanup interval
    if (this._messageCleanupInterval) {
      clearInterval(this._messageCleanupInterval)
      this._messageCleanupInterval = null
    }
    
    // Clear all quality monitoring intervals
    this._qualityMonitoringIntervals.forEach((interval) => {
      clearInterval(interval)
    })
    this._qualityMonitoringIntervals.clear()
    
    // Leave current channel and cleanup
    if (this.currentChannelId) {
      this.leaveChannel()
    }
    
    // Disconnect active signaling
    if (this.activeSignaling) {
      this.activeSignaling.disconnect()
    }
    
    // Remove all event listeners
    this.removeAllListeners()
  }
}

// WebSocket Signaling Implementation
class WebSocketSignaling implements SignalingMethod {
  private ws: WebSocket | null = null
  private endpoints: string[]
  private currentEndpointIndex = 0
  private messageHandler: ((message: ProductionSignalingMessage) => void) | null = null
  private currentChannelId: string | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private pingInterval: NodeJS.Timeout | null = null

  constructor(endpoints: string[]) {
    this.endpoints = endpoints
  }

  getName(): string {
    return 'WebSocket'
  }

  async initialize(): Promise<void> {
    console.log('🔌 Initializing WebSocket signaling...')
    await this.connect()
  }

  private async connect(): Promise<void> {
    const endpoint = this.endpoints[this.currentEndpointIndex]
    console.log(`🔌 Connecting to WebSocket: ${endpoint}`)
    
    return new Promise((resolve, reject) => {
      try {
        // Convert HTTPS/HTTP URLs to WSS/WS properly
        let wsUrl = endpoint
        if (endpoint.startsWith('https://')) {
          wsUrl = endpoint.replace('https://', 'wss://')
        } else if (endpoint.startsWith('http://')) {
          wsUrl = endpoint.replace('http://', 'ws://')
        } else if (!endpoint.startsWith('ws://') && !endpoint.startsWith('wss://')) {
          wsUrl = `wss://${endpoint}`
        }
        
        // Remove trailing slash if present
        wsUrl = wsUrl.replace(/\/$/, '')
        
        console.log(`🔗 Final WebSocket URL: ${wsUrl}`)
        
        this.ws = new WebSocket(wsUrl)
        
        const timeout = setTimeout(() => {
          this.ws?.close()
          reject(new Error(`WebSocket connection timeout after ${config.signaling?.connectionTimeout || 10000}ms`))
        }, config.signaling?.connectionTimeout || 10000)
        
        this.ws.onopen = () => {
          clearTimeout(timeout)
          console.log('✅ WebSocket connected')
          
          // Brief stabilization wait with multiple checks
          let stabilityChecks = 0
          const checkStability = () => {
            stabilityChecks++
            if (this.ws?.readyState === WebSocket.OPEN) {
              if (stabilityChecks >= 3) {
                // Connection is stable after multiple checks
                this.setupPingPong()
                resolve()
              } else {
                // Check again
                setTimeout(checkStability, 100)
              }
            } else {
              console.error('❌ WebSocket became unstable after opening')
              reject(new Error('WebSocket connection unstable'))
            }
          }
          
          // Start stability checks
          setTimeout(checkStability, 100)
        }
        
        this.ws.onerror = (error) => {
          clearTimeout(timeout)
          console.error('❌ WebSocket error:', error)
          reject(error)
        }
        
        this.ws.onclose = (event) => {
          console.log(`🔌 WebSocket disconnected: ${event.code} ${event.reason}`)
          this.cleanup()
          this.scheduleReconnect()
        }
        
        this.ws.onmessage = async (event) => {
          try {
            let messageText: string
            
            if (event.data instanceof Blob) {
              messageText = await event.data.text()
            } else {
              messageText = event.data
            }
            
            if (!messageText || messageText.trim() === '') {
              return
            }
            
            const message = JSON.parse(messageText)
            
            // Skip ping/pong, server messages, and non-signaling messages
            if (message.type === 'ping' || 
                message.type === 'pong' || 
                message.type === 'server-ready' ||
                message.type === 'error' ||
                !message.from ||
                !message.type) {
              return
            }
            
            console.log('📨 WebSocket received:', message.type)
            
            if (this.messageHandler) {
              this.messageHandler(message)
            }
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error)
          }
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  private setupPingPong(): void {
    // Clear any existing ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
    }
    
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }))
          console.log('🏓 Sent ping to keep connection alive')
        } catch (error) {
          console.error('Failed to send ping:', error)
          this.cleanup()
        }
      } else {
        console.warn('WebSocket not open, stopping ping')
        clearInterval(this.pingInterval!)
        this.pingInterval = null
      }
    }, config.signaling?.heartbeatInterval || 25000) // Use config value
  }

  private cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private scheduleReconnect(): void {
    if (this.currentChannelId && !this.reconnectTimer) {
      this.reconnectTimer = setTimeout(async () => {
        try {
          await this.connect()
          if (this.currentChannelId) {
            await this.subscribe(this.currentChannelId, this.messageHandler!)
          }
        } catch (error) {
          this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.endpoints.length
          this.scheduleReconnect()
        }
      }, 3000)
    }
  }

  async test(): Promise<boolean> {
    // Wait longer for Glitch to stabilize
    if (this.ws?.readyState === WebSocket.CONNECTING) {
      await new Promise(resolve => setTimeout(resolve, 1000)) // Increased wait
    }
    
    const isOpen = this.ws?.readyState === WebSocket.OPEN
    console.log(`🧪 WebSocket readyState: ${this.ws?.readyState} (expected: ${WebSocket.OPEN})`)
    console.log(`🧪 WebSocket test result: ${isOpen}`)
    
    return isOpen
  }

  async subscribe(channelId: string, onMessage: (message: ProductionSignalingMessage) => void): Promise<void> {
    this.currentChannelId = channelId
    this.messageHandler = onMessage
    
    if (this.ws?.readyState === WebSocket.OPEN) {
      const subscribeMsg = {
        type: 'subscribe',
        channelId,
        from: `peer-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        timestamp: Date.now()
      }
      
      console.log(`📡 Sending subscribe message:`, subscribeMsg)
      this.ws.send(JSON.stringify(subscribeMsg))
      console.log(`📡 Subscribed to WebSocket channel: ${channelId}`)
    } else {
      console.error(`❌ Cannot subscribe - WebSocket not open. State: ${this.ws?.readyState}`)
    }
  }

  async publish(message: ProductionSignalingMessage): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      throw new Error('WebSocket not connected')
    }
  }

  async unsubscribe(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN && this.currentChannelId) {
      this.ws.send(JSON.stringify({
        type: 'leave-channel',
        channelId: this.currentChannelId,
        timestamp: Date.now()
      }))
    }
    this.currentChannelId = null
  }

  disconnect(): void {
    this.cleanup()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}

// IPFS Signaling Implementation (commented out due to browser compatibility issues)
/*
class _IPFSSignaling implements SignalingMethod {
  private ipfs: any = null
  private _pubsub: any = null
  private messageHandler: ((message: ProductionSignalingMessage) => void) | null = null
  private currentChannelId: string | null = null

  constructor(private _config: any) {}

  getName(): string {
    return 'IPFS'
  }

  async initialize(): Promise<void> {
    console.log('🌐 Initializing IPFS signaling...')
    
    try {
      // Use IPFS with pubsub for simpler implementation
      const IPFS = await import('ipfs-core')
      
      this.ipfs = await IPFS.create({
        repo: 'decentravoice-' + Math.random().toString(36).substr(2, 9),
        config: {
          Addresses: {
            Swarm: [
              '/dns4/wrtc-star1.par.dwebops.pub/tcp/443/wss/p2p-webrtc-star/',
              '/dns4/wrtc-star2.sjc.dwebops.pub/tcp/443/wss/p2p-webrtc-star/'
            ]
          }
        }
      })
      
      console.log('✅ IPFS initialized with ID:', (await this.ipfs.id()).id)
    } catch (error) {
      console.error('❌ IPFS initialization failed:', error)
      throw error
    }
  }

  async test(): Promise<boolean> {
    try {
      const id = await this.ipfs?.id()
      return !!id
    } catch {
      return false
    }
  }

  async subscribe(channelId: string, onMessage: (message: ProductionSignalingMessage) => void): Promise<void> {
    this.currentChannelId = channelId
    this.messageHandler = onMessage
    const topic = `decentravoice-${channelId}`
    
    // Subscribe to IPFS pubsub topic
    await this.ipfs.pubsub.subscribe(topic, (msg: any) => {
      try {
        const message = JSON.parse(new TextDecoder().decode(msg.data))
        if (this.messageHandler && message.timestamp && Date.now() - message.timestamp < 60000) {
          this.messageHandler(message)
        }
      } catch (error) {
        console.error('Failed to parse IPFS message:', error)
      }
    })
    
    console.log(`📡 Subscribed to IPFS topic: ${topic}`)
  }

  async publish(message: ProductionSignalingMessage): Promise<void> {
    if (!this.currentChannelId) {
      throw new Error('Not subscribed to any channel')
    }
    
    const topic = `decentravoice-${this.currentChannelId}`
    const data = new TextEncoder().encode(JSON.stringify(message))
    await this.ipfs.pubsub.publish(topic, data)
  }

  async unsubscribe(): Promise<void> {
    if (this.currentChannelId) {
      const topic = `decentravoice-${this.currentChannelId}`
      await this.ipfs.pubsub.unsubscribe(topic)
      this.currentChannelId = null
    }
  }

  disconnect(): void {
    this.unsubscribe()
    if (this.ipfs) {
      this.ipfs.stop()
      this.ipfs = null
    }
  }
}
*/

// Gun.js Signaling Implementation (commented out due to unreliable public relays)
/*
class _GunSignaling implements SignalingMethod {
  private gun: any = null
  private channelRef: any = null
  private messageHandler: ((message: ProductionSignalingMessage) => void) | null = null
  private subscription: any = null

  getName(): string {
    return 'Gun'
  }

  async initialize(): Promise<void> {
    console.log('🔫 Initializing Gun signaling...')
    
    try {
      const Gun = (await import('gun/gun')).default
      await import('gun/sea')
      
      this.gun = Gun({
        peers: [
          'https://relay.peer.ec/gun',           // More reliable relay
          'https://gun-us.deno.dev/gun',         // Deno-based relay
          'https://gun-matrix.herokuapp.com/gun', // Alternative Heroku
          'https://gundb.herokuapp.com/gun'      // Another backup
        ],
        localStorage: false,  // Disable localStorage to avoid conflicts
        radisk: false        // Disable disk storage in browser
      })
      
      console.log('✅ Gun initialized')
    } catch (error) {
      console.error('❌ Gun initialization failed:', error)
      throw error
    }
  }

  async test(): Promise<boolean> {
    return !!this.gun
  }

  async subscribe(channelId: string, onMessage: (message: ProductionSignalingMessage) => void): Promise<void> {
    this.messageHandler = onMessage
    this.channelRef = this.gun.get(`decentravoice-channel-${channelId}`)
    
    // Subscribe to messages
    this.subscription = this.channelRef.map().on((data: any, _key: string) => {
      if (data && typeof data === 'object' && data.type) {
        // Only process recent messages
        const now = Date.now()
        if (data.timestamp && now - data.timestamp < 60000) {
          if (this.messageHandler) {
            this.messageHandler(data as ProductionSignalingMessage)
          }
        }
      }
    })
  }

  async publish(message: ProductionSignalingMessage): Promise<void> {
    if (!this.channelRef) {
      throw new Error('Not subscribed to any channel')
    }
    
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    this.channelRef.get(messageId).put(message)
  }

  async unsubscribe(): Promise<void> {
    if (this.subscription) {
      this.subscription.off()
      this.subscription = null
    }
    this.channelRef = null
  }

  disconnect(): void {
    this.unsubscribe()
    this.gun = null
  }
}
*/

// LocalStorage Signaling Implementation (fallback for same-device testing)
class LocalStorageSignaling implements SignalingMethod {
  private channelId: string | null = null
  private messageHandler: ((message: ProductionSignalingMessage) => void) | null = null
  private pollInterval: NodeJS.Timeout | null = null
  private lastCheck = 0

  getName(): string {
    return 'LocalStorage'
  }

  async initialize(): Promise<void> {
    console.log('💾 Initializing LocalStorage signaling...')
  }

  async test(): Promise<boolean> {
    try {
      const testKey = 'decentravoice-test'
      localStorage.setItem(testKey, 'test')
      localStorage.removeItem(testKey)
      return true
    } catch {
      return false
    }
  }

  async subscribe(channelId: string, onMessage: (message: ProductionSignalingMessage) => void): Promise<void> {
    this.channelId = channelId
    this.messageHandler = onMessage
    this.lastCheck = Date.now()
    
    // Poll for messages
    this.pollInterval = setInterval(() => {
      const messages = this.getMessages()
      const now = Date.now()
      
      messages.forEach(msg => {
        if (msg.timestamp > this.lastCheck && msg.timestamp < now) {
          if (this.messageHandler) {
            this.messageHandler(msg)
          }
        }
      })
      
      this.lastCheck = now
      
      // Clean old messages
      this.cleanOldMessages()
    }, 100)
  }

  async publish(message: ProductionSignalingMessage): Promise<void> {
    const messages = this.getMessages()
    messages.push(message)
    localStorage.setItem(`decentravoice-${this.channelId}`, JSON.stringify(messages))
  }

  async unsubscribe(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
    this.channelId = null
  }

  disconnect(): void {
    this.unsubscribe()
  }

  private getMessages(): ProductionSignalingMessage[] {
    if (!this.channelId) return []
    
    try {
      const data = localStorage.getItem(`decentravoice-${this.channelId}`)
      return data ? JSON.parse(data) : []
    } catch {
      return []
    }
  }

  private cleanOldMessages(): void {
    if (!this.channelId) return
    
    const messages = this.getMessages()
    const now = Date.now()
    const recentMessages = messages.filter(msg => now - msg.timestamp < 60000)
    
    if (recentMessages.length !== messages.length) {
      localStorage.setItem(`decentravoice-${this.channelId}`, JSON.stringify(recentMessages))
    }
  }
}

export const productionWebRTCService = new ProductionWebRTCService()