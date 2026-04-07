import React, { useEffect, useRef, useState } from 'react';
import type { VoiceChatManager, PeerInfo } from '../voice/webrtc.js';

interface VoiceControlsProps {
  voiceManager: VoiceChatManager | null;
  playerNames: Map<string, string>;
}

export function VoiceControls({ voiceManager, playerNames }: VoiceControlsProps) {
  const [muted, setMuted] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [volumes, setVolumes] = useState<Map<string, number>>(new Map());
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!voiceManager) return;

    // Refresh peer list periodically for audio level updates
    refreshInterval.current = setInterval(() => {
      setPeers([...voiceManager.getPeers()]);
    }, 200);

    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current);
    };
  }, [voiceManager]);

  const handleToggleVoice = async () => {
    if (!voiceManager) return;
    if (!enabled) {
      const ok = await voiceManager.start();
      if (ok) setEnabled(true);
    }
  };

  const handleToggleMute = () => {
    if (!voiceManager) return;
    const isMuted = voiceManager.toggleMute();
    setMuted(isMuted);
  };

  const handleVolumeChange = (peerId: string, vol: number) => {
    setVolumes(prev => new Map(prev).set(peerId, vol));
    const audio = audioRefs.current.get(peerId);
    if (audio) audio.volume = vol;
  };

  // Attach remote streams to audio elements
  useEffect(() => {
    for (const peer of peers) {
      if (peer.remoteStream) {
        let audio = audioRefs.current.get(peer.id);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audioRefs.current.set(peer.id, audio);
        }
        if (audio.srcObject !== peer.remoteStream) {
          audio.srcObject = peer.remoteStream;
        }
        audio.volume = volumes.get(peer.id) ?? 1;
      }
    }
  }, [peers, volumes]);

  if (!voiceManager) return null;

  return (
    <div style={containerStyle}>
      {/* Toggle button */}
      {!enabled ? (
        <button onClick={handleToggleVoice} style={voiceBtnStyle}>
          음성채팅 켜기
        </button>
      ) : (
        <>
          <button
            onClick={handleToggleMute}
            style={{
              ...voiceBtnStyle,
              background: muted ? '#e88' : '#8bc8a4',
            }}
          >
            {muted ? '음소거 해제' : '음소거'}
          </button>

          {/* Peer list with volume controls */}
          {peers.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {peers.map(peer => (
                <div key={peer.id} style={peerRowStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Talking indicator */}
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: peer.audioLevel > 0.05 ? '#6ce88c' : '#ccc',
                      transition: 'background 0.15s',
                    }} />
                    <span style={{ fontSize: 12, color: '#4a3f6b' }}>
                      {playerNames.get(peer.id) || peer.id.slice(0, 6)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0} max={1} step={0.05}
                    value={volumes.get(peer.id) ?? 1}
                    onChange={e => handleVolumeChange(peer.id, parseFloat(e.target.value))}
                    style={{ width: 60, height: 4 }}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 50,
  right: 16,
  background: 'rgba(255,255,255,0.9)',
  borderRadius: 14,
  padding: '10px 14px',
  boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
  minWidth: 140,
};

const voiceBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 14px',
  borderRadius: 10,
  border: 'none',
  background: '#9b8ec4',
  color: '#fff',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

const peerRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '4px 0',
};
