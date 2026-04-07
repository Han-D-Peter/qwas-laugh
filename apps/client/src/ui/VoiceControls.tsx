import React, { useEffect, useRef, useState } from 'react';
import type { VoiceChatManager, PeerInfo } from '../voice/webrtc.js';

interface VoiceControlsProps {
  voiceManager: VoiceChatManager | null;
  playerNames: Map<string, string>;
  /** All player IDs currently in the room */
  playerIds?: string[];
}

export function VoiceControls({ voiceManager, playerNames, playerIds = [] }: VoiceControlsProps) {
  const [muted, setMuted] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [volumes, setVolumes] = useState<Map<string, number>>(new Map());
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const refreshInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!voiceManager) return;
    refreshInterval.current = setInterval(() => {
      setPeers([...voiceManager.getPeers()]);
    }, 150);
    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current);
    };
  }, [voiceManager]);

  const handleToggleVoice = async () => {
    if (!voiceManager) return;
    if (!enabled) {
      const ok = await voiceManager.start(playerIds);
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
      <div style={{ fontSize: 12, fontWeight: 700, color: '#4a3f6b', marginBottom: 6 }}>
        음성채팅
      </div>

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
              background: muted ? '#e07070' : '#6bc48a',
            }}
          >
            {muted ? '음소거 해제' : '음소거'}
          </button>

          {/* Participant list */}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: '#8b7bb5', marginBottom: 4 }}>
              참가자 ({peers.length}명)
            </div>
            {peers.length === 0 && (
              <div style={{ fontSize: 11, color: '#bbb', padding: '4px 0' }}>
                아직 연결된 참가자 없음
              </div>
            )}
            {peers.map(peer => {
              const isSpeaking = peer.audioLevel > 0.05;
              const name = playerNames.get(peer.id) || peer.id.slice(0, 6);
              return (
                <div key={peer.id} style={peerRowStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                    {/* Speaking indicator - animated ring */}
                    <div style={{
                      width: 12, height: 12, borderRadius: '50%',
                      background: isSpeaking ? '#6ce88c' : '#ddd',
                      border: isSpeaking ? '2px solid #4cca6c' : '2px solid #ccc',
                      transition: 'all 0.15s',
                      boxShadow: isSpeaking ? '0 0 6px rgba(108, 232, 140, 0.6)' : 'none',
                    }} />
                    <span style={{
                      fontSize: 13,
                      fontWeight: isSpeaking ? 700 : 500,
                      color: isSpeaking ? '#3a8c50' : '#4a3f6b',
                      transition: 'all 0.15s',
                    }}>
                      {name}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0} max={1} step={0.05}
                    value={volumes.get(peer.id) ?? 1}
                    onChange={e => handleVolumeChange(peer.id, parseFloat(e.target.value))}
                    style={{ width: 50, height: 4, accentColor: '#9b8ec4' }}
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  position: 'absolute',
  top: 60,
  right: 16,
  background: 'rgba(255,255,255,0.92)',
  borderRadius: 16,
  padding: '12px 14px',
  boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
  backdropFilter: 'blur(8px)',
  minWidth: 140,
  maxWidth: 180,
  zIndex: 30,
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
  padding: '5px 0',
};
