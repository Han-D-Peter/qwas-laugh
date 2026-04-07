import type { GameSocket } from '../network/socket.js';

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch('/api/turn-credentials');
    if (res.ok) {
      const data = await res.json();
      return data.iceServers;
    }
  } catch { /* fallback */ }
  return DEFAULT_ICE_SERVERS;
}

export interface PeerInfo {
  id: string;
  connection: RTCPeerConnection;
  remoteStream: MediaStream | null;
  audioLevel: number;
}

export class VoiceChatManager {
  private peers = new Map<string, PeerInfo>();
  private localStream: MediaStream | null = null;
  private socket: GameSocket;
  private muted = false;
  private onPeersChanged: () => void;
  private pendingPeers = new Set<string>();
  private iceServers: RTCIceServer[] = DEFAULT_ICE_SERVERS;

  constructor(socket: GameSocket, onPeersChanged: () => void) {
    this.socket = socket;
    this.onPeersChanged = onPeersChanged;
    this.setupSignaling();
  }

  private setupSignaling() {
    this.socket.rawSocket.on('voice:offer',
      async ({ fromId, offer }: { fromId: string; offer: RTCSessionDescriptionInit }) => {
        const peer = this.getOrCreatePeer(fromId);
        try {
          await peer.connection.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await peer.connection.createAnswer();
          await peer.connection.setLocalDescription(answer);
          this.socket.sendVoiceAnswer(fromId, answer);
        } catch (e) {
          console.warn('[voice] Failed to handle offer from', fromId, e);
        }
      }
    );

    this.socket.rawSocket.on('voice:answer',
      async ({ fromId, answer }: { fromId: string; answer: RTCSessionDescriptionInit }) => {
        const peer = this.peers.get(fromId);
        if (peer) {
          try {
            await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
          } catch (e) {
            console.warn('[voice] Failed to handle answer from', fromId, e);
          }
        }
      }
    );

    this.socket.rawSocket.on('voice:ice-candidate',
      async ({ fromId, candidate }: { fromId: string; candidate: RTCIceCandidateInit }) => {
        const peer = this.peers.get(fromId);
        if (peer && candidate) {
          try {
            await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.warn('[voice] Failed to add ICE candidate from', fromId, e);
          }
        }
      }
    );
  }

  /**
   * Start microphone capture and connect to all pending/existing peers.
   * @param existingPlayerIds - IDs of players already in the room
   */
  async start(existingPlayerIds: string[] = []): Promise<boolean> {
    // Fetch TURN credentials from server
    this.iceServers = await fetchIceServers();

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
    } catch {
      return false;
    }

    // Add existing players to pending list
    const myId = this.socket.id;
    for (const id of existingPlayerIds) {
      if (id !== myId) {
        this.pendingPeers.add(id);
      }
    }

    // Connect to all pending peers now that we have localStream
    for (const peerId of this.pendingPeers) {
      await this.initiateConnection(peerId);
    }
    this.pendingPeers.clear();

    return true;
  }

  /**
   * Queue a peer for connection. If localStream is ready, connect immediately.
   */
  async connectToPeer(peerId: string) {
    if (peerId === this.socket.id) return;

    if (!this.localStream) {
      // Queue for later when start() is called
      this.pendingPeers.add(peerId);
      return;
    }

    await this.initiateConnection(peerId);
  }

  private async initiateConnection(peerId: string) {
    const peer = this.getOrCreatePeer(peerId);

    // Add local tracks if not already added
    const senders = peer.connection.getSenders();
    if (this.localStream && senders.length === 0) {
      for (const track of this.localStream.getTracks()) {
        peer.connection.addTrack(track, this.localStream);
      }
    }

    try {
      const offer = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(offer);
      this.socket.sendVoiceOffer(peerId, offer);
    } catch (e) {
      console.warn('[voice] Failed to create offer for', peerId, e);
    }
  }

  private getOrCreatePeer(peerId: string): PeerInfo {
    let peer = this.peers.get(peerId);
    if (peer) return peer;

    const connection = new RTCPeerConnection({ iceServers: this.iceServers });

    peer = {
      id: peerId,
      connection,
      remoteStream: null,
      audioLevel: 0,
    };

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.sendVoiceIceCandidate(peerId, event.candidate.toJSON());
      }
    };

    connection.ontrack = (event) => {
      peer!.remoteStream = event.streams[0] || new MediaStream([event.track]);
      this.startAudioLevelMonitor(peer!);
      this.onPeersChanged();
    };

    // Add local tracks if available
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        connection.addTrack(track, this.localStream);
      }
    }

    this.peers.set(peerId, peer);
    this.onPeersChanged();
    return peer;
  }

  private startAudioLevelMonitor(peer: PeerInfo) {
    if (!peer.remoteStream) return;

    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(peer.remoteStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const monitor = () => {
        if (!this.peers.has(peer.id)) return;
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
        peer.audioLevel = avg / 255;
        requestAnimationFrame(monitor);
      };
      monitor();
    } catch {
      // AudioContext may not be available in all environments
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = !this.muted;
      }
    }
    return this.muted;
  }

  get isMuted() { return this.muted; }

  getPeers(): PeerInfo[] {
    return Array.from(this.peers.values());
  }

  getRemoteStream(peerId: string): MediaStream | null {
    return this.peers.get(peerId)?.remoteStream || null;
  }

  removePeer(peerId: string) {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.connection.close();
      this.peers.delete(peerId);
      this.onPeersChanged();
    }
  }

  destroy() {
    for (const peer of this.peers.values()) {
      peer.connection.close();
    }
    this.peers.clear();
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }
  }
}
