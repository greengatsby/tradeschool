'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Room, RoomEvent, Track, RemoteTrack } from 'livekit-client';
import { useIsMobile } from '@/hooks/use-mobile';

type IncomingMessage =
  | { type: 'capture_screenshot'; question: string; requestId?: string }
  | { type: string;[key: string]: any };

export default function LiveKitPage() {
  const [room, setRoom] = useState<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [roomName, setRoomName] = useState<string>(() => `demo-${Date.now()}`);
  const [username, setUsername] = useState<string>(() => `web-${Math.random().toString(36).slice(2, 8)}`);
  const isMobile = useIsMobile();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const shutterAudioRef = useRef<HTMLAudioElement | null>(null);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => [msg, ...prev].slice(0, 200));
  }, []);

  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user');

  const startLocalCamera = useCallback(async (facing?: 'user' | 'environment') => {
    const element = videoRef.current;
    if (!element) return;
    try {
      if (!localStreamRef.current) {
        const desiredFacing = facing ?? cameraFacing;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: isMobile
            ? { facingMode: { ideal: desiredFacing }, width: { ideal: 640 }, height: { ideal: 480 } }
            : { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        localStreamRef.current = stream;
      }
      element.srcObject = localStreamRef.current;
      element.muted = true;
      element.playsInline = true;
      element.autoplay = true;
      await element.play().catch((err) => addLog(`video play error: ${err?.message || err}`));
      const track = localStreamRef.current?.getVideoTracks()[0];
      if (track) {
        const settings = track.getSettings();
        addLog(`local camera ready ${settings.width}x${settings.height} @${settings.frameRate || '?'}fps`);
      }
    } catch (e: any) {
      addLog(`startLocalCamera error: ${e.message || String(e)}`);
    }
  }, [addLog, isMobile, cameraFacing]);

  const flipCamera = useCallback(async () => {
    try {
      const nextFacing: 'user' | 'environment' = cameraFacing === 'user' ? 'environment' : 'user';
      setCameraFacing(nextFacing);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
      await startLocalCamera(nextFacing);
      addLog(`switched camera to ${nextFacing}`);
    } catch (e: any) {
      addLog(`switch camera error: ${e?.message || String(e)}`);
    }
  }, [cameraFacing, startLocalCamera, addLog]);

  const playShutterSound = useCallback(() => {
    try {
      if (!shutterAudioRef.current) {
        shutterAudioRef.current = new Audio('/shutter.mp3');
        shutterAudioRef.current.volume = 0.3;
      }
      shutterAudioRef.current.currentTime = 0;
      shutterAudioRef.current.play().catch(() => {
        // Ignore play errors (autoplay restrictions, etc.)
      });
    } catch {
      // Ignore audio errors
    }
  }, []);

  const handleData = useCallback(async (payload: Uint8Array) => {
    try {
      const str = new TextDecoder().decode(payload);
      const msg = JSON.parse(str) as IncomingMessage;
      if (msg.type === 'capture_screenshot') {
        addLog(`received capture_screenshot: ${msg.question}`);
        const imageBase64 = await captureScreenshot();
        if (!imageBase64) {
          addLog('screenshot failed');
          return;
        }
        // Send the raw screenshot to the central call events handler; it will call OpenAI
        await fetch('/api/call-events', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: (msg as any).requestId, imageBase64, question: msg.question }),
        });
        addLog('screenshot submitted to server');
      }
    } catch (e) {
      addLog(`data error: ${(e as Error).message}`);
    }
  }, [room, addLog]);

  useEffect(() => {
    // Create audio element for playing remote audio
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.autoplay = true;
      audioRef.current.muted = false;
      audioRef.current.volume = 1.0;
    }

    return () => {
      // cleanup on unmount
      (async () => {
        try {
          if (room) {
            await room.localParticipant.setMicrophoneEnabled(false);
            await room.disconnect();
          }
          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
          }
        } catch {
          // ignore
        }
      })();
    };
  }, [room]);

  useEffect(() => {
    if (connected) {
      startLocalCamera();
    }
  }, [connected, startLocalCamera]);

  const connect = useCallback(async () => {
    if (connecting || connected) return;
    setConnecting(true);
    try {
      const agentConfig = {
        name: 'Vision Assistant',
        systemPrompt: 'You are a electrical tradeschool lab assistant. Help the user complete the exercise they have been tasked with which is to wire up a simple lights switch and lamp socket. When the user asks you to look at something, fire the capture screenshot tool and review the result with the user. Always explain things one step at a time. Always write out 3/8" inch as three-eignths inch. Keep your responses as short and concise as possible.',
        firstMessage: 'Hi! Let\'s get started!',
        tools: [
          {
            id: "captureScreenshot",
            name: "captureScreenshot",
            description: "Capture a frame from the user camera to analyze",
            parameters: {
              type: 'object',
              properties: {
                question: { type: 'string', description: 'What do you want to know from the screenshot?' }
              },
              required: ['question']
            },
            fire_and_forget: false
          }
        ],
        tts: {
          provider: 'cartesia',
          config: {
            model: 'sonic-2',
            voice: '1c0a8256-df2c-47d8-a0c0-7f07262eaf16',
          }
        },
        callbackUrl: "https://roley.ngrok.app/api/call-events",
      };

      const resp = await fetch(`/api/livekit/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName, participantName: username, agentConfig }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error || 'token fetch failed');
      }
      const { token, url } = await resp.json();
      const lkRoom = new Room({ adaptiveStream: true, dynacast: true });

      lkRoom.on(RoomEvent.Connected, () => {
        addLog('connected');
        setConnected(true);
      });
      lkRoom.on(RoomEvent.Disconnected, () => {
        addLog('disconnected');
        setConnected(false);
      });
      lkRoom.on(RoomEvent.DataReceived, handleData);
      lkRoom.on(RoomEvent.LocalTrackPublished, () => addLog('local track published'));
      lkRoom.on(RoomEvent.LocalTrackUnpublished, () => addLog('local track unpublished'));

      // Add logging for agent/remote participants
      lkRoom.on(RoomEvent.ParticipantConnected, (participant) => {
        addLog(`participant connected: ${participant.identity} (${participant.kind})`);
      });
      lkRoom.on(RoomEvent.ParticipantDisconnected, (participant) => {
        addLog(`participant disconnected: ${participant.identity}`);
      });
      lkRoom.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication, participant) => {
        addLog(`track subscribed: ${track.kind} from ${participant.identity}`);
        if (track.kind === Track.Kind.Audio && audioRef.current) {
          track.attach(audioRef.current);
          addLog('agent audio track attached to audio element - should hear sound!');
        }
      });
      lkRoom.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
        addLog(`track unsubscribed: ${track.kind} from ${participant.identity}`);
      });
      lkRoom.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        addLog(`audio playback status changed: canPlayback=${lkRoom.canPlaybackAudio}`);
      });

      await lkRoom.connect(url, token);
      setRoom(lkRoom);
      try {
        await lkRoom.startAudio();
        addLog('room.startAudio() succeeded');
      } catch (e: any) {
        addLog(`room.startAudio() failed: ${e?.message || e}`);
      }

      // Only publish microphone; keep camera local to this page
      await lkRoom.localParticipant.setMicrophoneEnabled(true);
      addLog('microphone enabled (camera kept local)');

      // Start a private local camera for screenshots
      await startLocalCamera();
    } catch (e: any) {
      addLog(`connect error: ${e.message || String(e)}`);
    } finally {
      setConnecting(false);
    }
  }, [roomName, username, addLog, handleData, connecting, connected, startLocalCamera]);

  const disconnect = useCallback(async () => {
    try {
      if (!room) return;
      await room.localParticipant.setMicrophoneEnabled(false);
      await room.disconnect();
      setConnected(false);
      setRoom(null);
      addLog('disconnected');
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
    } catch (e: any) {
      addLog(`disconnect error: ${e.message || String(e)}`);
    }
  }, [room, addLog]);

  const captureScreenshot = useCallback(async (): Promise<string | null> => {
    const video = videoRef.current;
    if (!video) return null;
    if (!video.srcObject) {
      await startLocalCamera();
    }
    const width = video.videoWidth || (video as any).clientWidth || 1280;
    const height = video.videoHeight || (video as any).clientHeight || 720;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    playShutterSound();
    return dataUrl;
  }, [playShutterSound, startLocalCamera]);

  const testCapture = useCallback(async () => {
    const img = await captureScreenshot();
    if (!img) {
      addLog('no image');
      return;
    }
    const res = await fetch('/api/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: img, question: 'What do you see?' }),
    });
    const data = await res.json();
    addLog(`test vision: ${data?.answer || 'no answer'}`);
  }, [captureScreenshot, addLog]);

  return (
    <div className="min-h-screen p-4 md:p-6 bg-gray-50">
      <div className="max-w-5xl mx-auto space-y-6 md:space-y-8">
        <div className="flex items-center justify-center gap-2">
          <Image src="/lms_logo.svg" alt="Roley logo" width={20} height={20} priority />
          <h1 className="text-xl md:text-2xl font-semibold text-center">Roley Tradeschool Assistant</h1>
        </div>
        {!connected ? (
          <div className="mt-2 md:mt-4">
            <div className="mx-auto max-w-md bg-white rounded-xl shadow-sm p-6 text-center">
              <p className="text-gray-600 text-sm md:text-base mb-4">
                Start a call to get real-time help. You can switch cameras on mobile once connected.
              </p>
              <button
                className="px-6 py-3 rounded-lg bg-black text-white disabled:opacity-50 w-full"
                onClick={connect}
                disabled={connecting}
              >
                {connecting ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
              <button
                className="px-4 py-2 rounded bg-gray-200 w-full sm:w-auto"
                onClick={disconnect}
              >
                Disconnect
              </button>
              {isMobile && (
                <button
                  className="px-4 py-2 rounded bg-gray-100 text-gray-900 border w-full sm:w-auto"
                  onClick={flipCamera}
                >
                  Switch Camera
                </button>
              )}
            </div>
            <div className="aspect-video bg-black rounded overflow-hidden relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain bg-black"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>
          </>
        )}
      </div>

      {/* Hidden audio element for playing remote audio */}
      <audio ref={audioRef} style={{ display: 'none' }} />
    </div>
  );
}


