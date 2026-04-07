import type { GameSocket } from '../network/socket.js';

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const serverUrl = (import.meta as any).env?.VITE_SERVER_URL || '';
    const res = await fetch(`${serverUrl}/api/turn-credentials`);
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
  private myId: string = '';

  constructor(socket: GameSocket, onPeersChanged: () => void) {
    this.socket = socket;
    this.onPeersChanged = onPeersChanged;
    this.setupSignaling();
  }

  private setupSignaling() {
    // ─── Receive offer ───
    this.socket.rawSocket.on('voice:offer',
      async ({ fromId, offer }: { fromId: string; offer: RTCSessionDescriptionInit }) => {
        const isPolite = this.myId < fromId;

        let peer = this.peers.get(fromId);
        if (peer) {
          const state = peer.connection.signalingState;
          if (state === 'have-local-offer') {
            if (!isPolite) {
              // Impolite: ignore their offer
              return;
            }
            // Polite: rollback ours
            await peer.connection.setLocalDescription({ type: 'rollback' });
          }
        }

        // Create or get peer, ensure tracks are added
        peer = this.getOrCreatePeer(fromId);
        this.ensureTracksAdded(peer);

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

    // ─── Receive answer ───
    this.socket.rawSocket.on('voice:answer',
      async ({ fromId, answer }: { fromId: string; answer: RTCSessionDescriptionInit }) => {
        const peer = this.peers.get(fromId);
        if (!peer) return;
        if (peer.connection.signalingState !== 'have-local-offer') return;
        try {
          await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (e) {
          console.warn('[voice] Failed to handle answer from', fromId, e);
        }
      }
    );

    // ─── Receive ICE candidate ───
    this.socket.rawSocket.on('voice:ice-candidate',
      async ({ fromId, candidate }: { fromId: string; candidate: RTCIceCandidateInit }) => {
        const peer = this.peers.get(fromId);
        if (peer && candidate) {
          try {
            await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
          } catch { /* may fail before remote desc set — safe to ignore */ }
        }
      }
    );
  }

  async start(existingPlayerIds: string[] = []): Promise<boolean> {
    this.iceServers = await fetchIceServers();
    this.myId = this.socket.id || '';

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
    } catch {
      return false;
    }

    // Add tracks to any existing peer connections that were created
    // before we had localStream (e.g. we answered an offer without tracks)
    for (const peer of this.peers.values()) {
      const added = this.ensureTracksAdded(peer);
      if (added) {
        // Renegotiate: we need to send a new offer with our tracks
        await this.renegotiate(peer);
      }
    }

    // Connect to pending peers
    for (const id of existingPlayerIds) {
      if (id !== this.myId) {
        this.pendingPeers.add(id);
      }
    }

    for (const peerId of this.pendingPeers) {
      // Only initiate if we don't already have an active connection
      const existing = this.peers.get(peerId);
      if (existing && existing.connection.connectionState === 'connected') {
        // Already connected but may need renegotiation (handled above)
        continue;
      }
      await this.initiateConnection(peerId);
    }
    this.pendingPeers.clear();

    return true;
  }

  async connectToPeer(peerId: string) {
    if (peerId === this.myId) return;
    if (!this.localStream) {
      this.pendingPeers.add(peerId);
      return;
    }
    await this.initiateConnection(peerId);
  }

  /**
   * Ensure local audio tracks are added to the peer connection.
   * Returns true if tracks were newly added.
   */
  private ensureTracksAdded(peer: PeerInfo): boolean {
    if (!this.localStream) return false;

    const senders = peer.connection.getSenders();
    const hasAudioSender = senders.some(s => s.track?.kind === 'audio');
    if (hasAudioSender) return false;

    for (const track of this.localStream.getTracks()) {
      peer.connection.addTrack(track, this.localStream);
    }
    return true;
  }

  /**
   * Renegotiate an existing connection (e.g. after adding tracks).
   */
  private async renegotiate(peer: PeerInfo) {
    if (peer.connection.signalingState !== 'stable') return;

    try {
      const offer = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(offer);
      this.socket.sendVoiceOffer(peer.id, offer);
    } catch (e) {
      console.warn('[voice] Renegotiation failed for', peer.id, e);
    }
  }

  private async initiateConnection(peerId: string) {
    const peer = this.getOrCreatePeer(peerId);
    this.ensureTracksAdded(peer);

    const state = peer.connection.signalingState;
    if (state !== 'stable') return;

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

    // Handle renegotiation needed (e.g. when tracks added after connection)
    connection.onnegotiationneeded = async () => {
      if (connection.signalingState !== 'stable') return;
      try {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        this.socket.sendVoiceOffer(peerId, offer);
      } catch (e) {
        console.warn('[voice] Auto-negotiation failed for', peerId, e);
      }
    };

    connection.onconnectionstatechange = () => {
      const s = connection.connectionState;
      console.log(`[voice] Peer ${peerId}: ${s}`);
      if (s === 'failed') {
        this.removePeer(peerId);
        if (this.localStream) {
          setTimeout(() => this.initiateConnection(peerId), 2000);
        }
      }
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
        peer.audioLevel = data.reduce((sum, v) => sum + v, 0) / data.length / 255;
        requestAnimationFrame(monitor);
      };
      monitor();
    } catch { /* AudioContext not available */ }
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
