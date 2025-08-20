
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Room, RoomEvent, Track, RemoteTrack } from 'livekit-client';
import { useIsMobile } from '@/hooks/use-mobile';
import { CheckCircle2, Circle, Clock } from 'lucide-react';

type IncomingMessage =
  | { type: 'capture_screenshot'; question: string; requestId?: string }
  | { type: 'mark_step_complete'; stepId: number; requestId?: string }
  | { type: string;[key: string]: any };

type StepStatus = 'pending' | 'in_progress' | 'completed';

interface Step {
  id: number;
  title: string;
  description: string;
  status: StepStatus;
  verificationCriteria: string[];
}

export default function Home() {
  const [room, setRoom] = useState<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [roomName, setRoomName] = useState<string>(() => `demo-${Date.now()}`);
  const [username, setUsername] = useState<string>(() => `web-${Math.random().toString(36).slice(2, 8)}`);
  const isMobile = useIsMobile();

  // Step tracking state
  const [steps, setSteps] = useState<Step[]>([
    {
      id: 1,
      title: 'Wire Preparation',
      description: 'Strip and prepare the wires for connection',
      status: 'in_progress',
      verificationCriteria: [
        'Three wires visible (hot/black, neutral/white, ground/green or bare)',
        'Wire ends stripped approximately 3/4 inch (three-quarters inch)',
        'Clean copper visible at wire ends',
        'No damaged insulation along wire length'
      ]
    },
    {
      id: 2,
      title: 'Switch Wiring',
      description: 'Connect wires to the light switch correctly',
      status: 'pending',
      verificationCriteria: [
        'Hot (black) wire connected to brass/gold terminal',
        'Neutral (white) wire properly connected or wire-nutted if not needed',
        'Ground wire connected to green ground screw',
        'All terminal screws tightened clockwise around wire',
        'No exposed copper outside terminals'
      ]
    },
    {
      id: 3,
      title: 'Lamp Socket Wiring',
      description: 'Complete the circuit by wiring the lamp socket',
      status: 'pending',
      verificationCriteria: [
        'Hot wire connected to brass/gold terminal on socket',
        'Neutral wire connected to silver terminal on socket',
        'Ground wire properly secured if present',
        'All connections tight and secure',
        'Socket shell properly assembled'
      ]
    }
  ]);

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
        shutterAudioRef.current = new Audio('/shutter_take_a_look.mp3');
        shutterAudioRef.current.volume = 0.3;
      }
      shutterAudioRef.current.currentTime = 0;
      shutterAudioRef.current.play().catch(() => {
        // Autoplay restrictions on mobile (especially iOS) can block this.
        // Provide a subtle haptic fallback if available.
        if ('vibrate' in navigator) {
          try { (navigator as any).vibrate?.(50); } catch { }
        }
      });
    } catch {
      // Ignore audio errors
    }
  }, []);

  // Attempt to unlock/prime the shutter sound within a user gesture
  const primeShutterSound = useCallback(() => {
    try {
      if (!shutterAudioRef.current) {
        const audio = new Audio('/shutter_take_a_look.mp3');
        audio.preload = 'auto';
        audio.volume = 0.3;
        shutterAudioRef.current = audio;
      }
      const audio = shutterAudioRef.current;
      if (!audio) return;
      // Play and immediately pause to unlock audio on iOS within a user gesture
      audio.currentTime = 0;
      void audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
      }).catch(() => {
        // Ignore; user gesture may not be active yet
      });
    } catch {
      // Ignore
    }
  }, []);

  const markStepComplete = useCallback((stepId: number) => {
    setSteps(prevSteps => {
      const newSteps = [...prevSteps];
      const stepIndex = newSteps.findIndex(s => s.id === stepId);

      if (stepIndex !== -1) {
        // Mark current step as completed
        newSteps[stepIndex].status = 'completed';

        // Mark next step as in_progress if it exists
        const nextStep = newSteps.find(s => s.id === stepId + 1);
        if (nextStep && nextStep.status === 'pending') {
          nextStep.status = 'in_progress';
        }
      }

      return newSteps;
    });

    addLog(`✅ Step ${stepId} marked complete`);
  }, [addLog]);

  // Define captureScreenshot before handleData
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
      } else if (msg.type === 'mark_step_complete') {
        const stepId = (msg as any).stepId;
        addLog(`received mark_step_complete for step ${stepId}`);
        markStepComplete(stepId);

        // Send confirmation back to the server
        if ((msg as any).requestId) {
          await fetch('/api/call-events', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requestId: (msg as any).requestId,
              stepCompleted: stepId,
              success: true
            }),
          });
        }
      }
    } catch (e) {
      addLog(`data error: ${(e as Error).message}`);
    }
  }, [room, addLog, markStepComplete, captureScreenshot]);

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
    // Prime the shutter sound synchronously within the click handler to satisfy iOS policies
    primeShutterSound();
    try {
      const agentConfig = {
        name: 'Vision Assistant',
        systemPrompt: `You are an electrical tradeschool lab assistant helping the user complete a 3-step wiring exercise:

STEP 1 - Wire Preparation: Check that wires are properly stripped (3/4 inch exposed copper), all three wires present (hot/black, neutral/white, ground/green or bare).

STEP 2 - Switch Wiring: Verify hot wire to brass terminal, neutral properly managed, ground to green screw, all connections tight.

STEP 3 - Lamp Socket Wiring: Confirm hot to brass terminal, neutral to silver terminal, ground secured, socket assembled.

IMPORTANT INSTRUCTIONS:
- Guide the user through one step at a time
- When you verify a step is complete through screenshot analysis, use the markStepComplete tool
- Always write out measurements like "three-quarters inch" not "3/4 inch"
- Keep responses short and focused on the current step
- Before marking complete, explicitly verify ALL criteria for that step
- Celebrate progress when steps are completed!`,
        firstMessage: 'Hi! Let\'s wire up your light switch and lamp socket. We\'ll go through 3 steps together. First, let\'s check your wire preparation. Can you show me your wires?',
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
          },
          {
            id: "markStepComplete",
            name: "markStepComplete",
            description: "Mark a step as complete when all verification criteria are met",
            parameters: {
              type: 'object',
              properties: {
                stepId: { type: 'number', description: 'The step number to mark complete (1, 2, or 3)' }
              },
              required: ['stepId']
            },
            fire_and_forget: false
          }
        ],
        tts: {
          provider: 'cartesia',
          config: {
            model: 'sonic-2',
            // voice: '1c0a8256-df2c-47d8-a0c0-7f07262eaf16',
            voice: 'bbee10a8-4f08-4c5c-8282-e69299115055',
          }
        },
        callbackUrl: `${process.env.NEXT_PUBLIC_BASE_URL || "https://trades.roley.ai"}/api/call-events`,
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
  }, [roomName, username, addLog, handleData, connecting, connected, startLocalCamera, primeShutterSound]);

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

            {/* Progress Tracker - Now below the camera */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold mb-4">Exercise Progress</h2>
              <div className="space-y-4">
                {steps.map((step, index) => (
                  <div key={step.id} className="relative">
                    <div className={`border rounded-lg p-4 transition-all ${step.status === 'completed' ? 'border-green-500 bg-green-50' :
                      step.status === 'in_progress' ? 'border-blue-500 bg-blue-50 shadow-md' :
                        'border-gray-300 bg-gray-50'
                      }`}>
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {step.status === 'completed' ? (
                            <CheckCircle2 className="w-6 h-6 text-green-600" />
                          ) : step.status === 'in_progress' ? (
                            <Clock className="w-6 h-6 text-blue-600 animate-pulse" />
                          ) : (
                            <Circle className="w-6 h-6 text-gray-400" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h3 className="font-semibold text-gray-900 flex-1">
                              Step {step.id}: {step.title}
                            </h3>
                            <div className="flex-shrink-0">
                              {step.status === 'completed' && (
                                <span className="text-xs bg-green-600 text-white px-2 py-1 rounded-full whitespace-nowrap">
                                  Complete
                                </span>
                              )}
                              {step.status === 'in_progress' && (
                                <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded-full animate-pulse whitespace-nowrap">
                                  Active
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{step.description}</p>

                          {/* Show verification criteria for current step */}
                          {step.status === 'in_progress' && (
                            <div className="mt-3 p-3 bg-white rounded border border-blue-200">
                              <p className="text-xs font-semibold text-gray-700 mb-2">Verification Checklist:</p>
                              <ul className="space-y-1">
                                {step.verificationCriteria.map((criteria, i) => (
                                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                                    <span className="text-blue-500 mt-0.5">•</span>
                                    <span>{criteria}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Connector line between steps */}
                    {index < steps.length - 1 && (
                      <div className={`absolute left-7 top-14 w-0.5 h-8 ${step.status === 'completed' ? 'bg-green-500' : 'bg-gray-300'
                        }`} />
                    )}
                  </div>
                ))}
              </div>

              {/* Overall progress bar */}
              <div className="mt-6">
                <div className="flex justify-between text-xs text-gray-600 mb-2">
                  <span>Overall Progress</span>
                  <span>{steps.filter(s => s.status === 'completed').length} of {steps.length} complete</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-green-500 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${(steps.filter(s => s.status === 'completed').length / steps.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Hidden audio element for playing remote audio */}
      <audio ref={audioRef} style={{ display: 'none' }} />
    </div>
  );
}
