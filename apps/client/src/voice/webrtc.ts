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
  /** Used for "polite peer" pattern: lower ID is polite (yields on glare) */
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
        // "Polite peer" glare handling: if we already sent an offer
        // and we are the polite side (lower ID), rollback ours and accept theirs
        let peer = this.peers.get(fromId);
        const isPolite = this.myId < fromId;

        if (peer) {
          const state = peer.connection.signalingState;
          if (state === 'have-local-offer') {
            if (!isPolite) {
              // We are impolite: ignore their offer, they should accept ours
              console.log('[voice] Ignoring offer from', fromId, '(we are impolite)');
              return;
            }
            // We are polite: rollback our offer, accept theirs
            console.log('[voice] Rolling back our offer for', fromId, '(we are polite)');
            await peer.connection.setLocalDescription({ type: 'rollback' });
          }
        }

        peer = this.getOrCreatePeer(fromId);
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
        // Only set remote description if we're expecting an answer
        if (peer.connection.signalingState !== 'have-local-offer') {
          console.log('[voice] Ignoring answer from', fromId, 'state:', peer.connection.signalingState);
          return;
        }
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
          } catch (e) {
            // May fail if remote description not set yet — safe to ignore
          }
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

    // Add existing players to pending list
    for (const id of existingPlayerIds) {
      if (id !== this.myId) {
        this.pendingPeers.add(id);
      }
    }

    // Connect to all pending peers
    for (const peerId of this.pendingPeers) {
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

  private async initiateConnection(peerId: string) {
    const peer = this.getOrCreatePeer(peerId);

    // Don't send an offer if we already have an active/connecting state
    const state = peer.connection.signalingState;
    if (state !== 'stable' && state !== 'closed') {
      console.log('[voice] Skipping offer to', peerId, 'state:', state);
      return;
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

    // ICE candidate relay
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.sendVoiceIceCandidate(peerId, event.candidate.toJSON());
      }
    };

    // Receive remote tracks
    connection.ontrack = (event) => {
      peer!.remoteStream = event.streams[0] || new MediaStream([event.track]);
      this.startAudioLevelMonitor(peer!);
      this.onPeersChanged();
    };

    // Monitor connection state for auto-reconnect
    connection.onconnectionstatechange = () => {
      const s = connection.connectionState;
      console.log(`[voice] Peer ${peerId} connection: ${s}`);
      if (s === 'failed') {
        // Tear down and retry
        this.removePeer(peerId);
        if (this.localStream) {
          setTimeout(() => this.initiateConnection(peerId), 1000);
        }
      }
    };

    // Add local tracks
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
      // AudioContext may not be available
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
