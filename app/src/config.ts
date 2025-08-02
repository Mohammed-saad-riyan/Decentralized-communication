/**
 * DecentraVoice Configuration
 * 
 * This file contains all configurable parameters for the application.
 * Edit this file to customize your connection settings and preferences.
 */

export const config = {
  // WebRTC Configuration
  webrtc: {
    // ICE servers for NAT traversal (add more for better connectivity)
    iceServers: [
      // STUN servers
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      // TURN servers (essential for restricted networks in production)
      { urls: 'turn:numb.viagenie.ca', username: 'webrtc@live.com', credential: 'muazkh' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }
    ],
    // WebRTC connection configuration
    rtcConfig: {
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    },
    // Audio settings
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000,
      channelCount: 1
    }
  },
  
  // IPFS Configuration
  ipfs: {
    // Use native IPFS node in browser
    useNativeNode: true,
    // Configure swarm addresses for WebRTC signaling
    swarmAddresses: [
      '/dns4/wrtc-star1.par.dwebops.pub/tcp/443/wss/p2p-webrtc-star',
      '/dns4/wrtc-star2.sjc.dwebops.pub/tcp/443/wss/p2p-webrtc-star'
    ],
    // Bootstrap nodes (connect to IPFS network)
    bootstrapNodes: [
      '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
      '/ip4/104.131.131.82/tcp/4001/p2p/QmaCpDMGvV2BGHeYERUEnRQAwe3N8SzbUtfsmvsqQLuvuJ'
    ],
    // IPFS HTTP API endpoints (fallback)
    endpoints: [
      'http://localhost:5001',                    // Local IPFS node (development)
      'http://127.0.0.1:5001',                    // Local IPFS node alternative
      'https://ipfs.infura.io:5001',              // Infura IPFS (requires API key)
      'https://api.pinata.cloud/psa',             // Pinata (requires API key)
      'https://api.web3.storage/pins'             // Web3.Storage (requires token)
    ],
    // Connection timeout in milliseconds
    connectionTimeout: 5000,
    // Enable IPFS debug logs
    debug: false
  },
  
  // Global Signaling Configuration
  signaling: {
    // WebSocket endpoints for global signaling (in order of preference)
    wsEndpoints: [
      'wss://decentravoice-signaling-server-production.up.railway.app/', // Primary Railway server
      'wss://laced-faceted-calf.glitch.me',    // Backup Glitch server
      'wss://socketsbay.com/wss/v2/1/demo/',      // Free WebSocket test server (fallback)
    ],
    // WebSocket reconnection settings
    reconnect: {
      maxAttempts: 5,        // Reduced attempts for faster failover
      initialTimeout: 1000,  // 1 second initial retry
      backoffFactor: 1.5     // Moderate backoff
    },
    // Connection timeout settings
    connectionTimeout: 10000, // 10 seconds
    heartbeatInterval: 25000  // 25 seconds (just under Railway's 30s limit)
  },
  
  // Solana Configuration
  solana: {
    // Network to connect to
    network: 'devnet',  // 'devnet', 'testnet', or 'mainnet-beta'
    // RPC endpoints (in order of preference)
    rpcEndpoints: [
      'https://api.devnet.solana.com',
      'https://solana-devnet.g.alchemy.com/v2/your-api-key',  // Add your API key
      'https://api.testnet.solana.com'  // Fallback to testnet
    ],
    // Transaction commitment level
    commitment: 'confirmed',  // 'processed', 'confirmed', or 'finalized'
    // Program IDs
    programIds: {
      voiceChannels: 'DVoice1111111111111111111111111111111111111'
    }
  },
  
  // OrbitDB Configuration (Decentralized Storage)
  orbitdb: {
    // Database names
    databases: {
      channels: 'decentravoice-channels-v1',
      messages: 'decentravoice-messages-v1',
      profiles: 'decentravoice-profiles-v1'
    },
    // Replication settings
    replication: {
      // How many peers to replicate with
      maxPeers: 10,
      // Replication interval in ms
      interval: 10000
    }
  },
  
  // Application Settings
  app: {
    // Application name
    name: 'DecentraVoice',
    // Default channel ID (for testing)
    defaultChannel: 'CHAT-TEST',
    // App logging level: 'debug', 'info', 'warn', 'error'
    logLevel: 'info',
    // Global communication mode
    globalMode: true,
    // Maximum participants per channel (0 = unlimited)
    maxParticipants: 0,
    // Telemetry for monitoring connection success (no personal data)
    telemetry: {
      enabled: true, 
      endpoint: 'https://monitoring.decentravoice.io/log',
      anonymize: true
    },
    // Production deployment URLs
    deployment: {
      primary: 'https://voicevault-xi.vercel.app/',
      ipfs: 'ipfs://', // Will be filled during deployment
      backups: [
        'https://decentravoice.netlify.app/'
      ]
    }
  }
};

export default config; 