import type { GameSocket } from '../network/socket.js';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

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

  constructor(socket: GameSocket, onPeersChanged: () => void) {
    this.socket = socket;
    this.onPeersChanged = onPeersChanged;
    this.setupSignaling();
  }

  private setupSignaling() {
    // Receive offer from another peer
    this.socket.rawSocket.on('voice:offer',
      async ({ fromId, offer }: { fromId: string; offer: RTCSessionDescriptionInit }) => {
        const peer = this.getOrCreatePeer(fromId);
        await peer.connection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peer.connection.createAnswer();
        await peer.connection.setLocalDescription(answer);
        this.socket.sendVoiceAnswer(fromId, answer);
      }
    );

    // Receive answer
    this.socket.rawSocket.on('voice:answer',
      async ({ fromId, answer }: { fromId: string; answer: RTCSessionDescriptionInit }) => {
        const peer = this.peers.get(fromId);
        if (peer) {
          await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
        }
      }
    );

    // Receive ICE candidate
    this.socket.rawSocket.on('voice:ice-candidate',
      async ({ fromId, candidate }: { fromId: string; candidate: RTCIceCandidateInit }) => {
        const peer = this.peers.get(fromId);
        if (peer && candidate) {
          await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
        }
      }
    );
  }

  async start(): Promise<boolean> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      return true;
    } catch {
      return false;
    }
  }

  async connectToPeer(peerId: string) {
    if (!this.localStream) return;

    const peer = this.getOrCreatePeer(peerId);

    // Add local tracks
    for (const track of this.localStream.getTracks()) {
      peer.connection.addTrack(track, this.localStream);
    }

    // Create and send offer
    const offer = await peer.connection.createOffer();
    await peer.connection.setLocalDescription(offer);
    this.socket.sendVoiceOffer(peerId, offer);
  }

  private getOrCreatePeer(peerId: string): PeerInfo {
    let peer = this.peers.get(peerId);
    if (peer) return peer;

    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

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

    // Receive remote stream
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

  setPeerVolume(peerId: string, volume: number) {
    const peer = this.peers.get(peerId);
    if (!peer?.remoteStream) return;
    // Volume is applied via the audio element in the UI
  }

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
