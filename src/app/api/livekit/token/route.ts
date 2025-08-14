import { NextRequest, NextResponse } from 'next/server';
import { AccessToken, AgentDispatchClient } from 'livekit-server-sdk';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const { roomName, participantName, room, username, agentConfig } = await request.json();

    const finalRoomName = roomName || room;
    const finalParticipantName = participantName || username;

    if (!finalRoomName || !finalParticipantName) {
      return NextResponse.json(
        { error: 'Room name and participant name are required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const wsUrl = process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !wsUrl) {
      return NextResponse.json(
        { error: 'LiveKit credentials not configured' },
        { status: 500 }
      );
    }

    // Create access token
    const at = new AccessToken(apiKey, apiSecret, {
      identity: finalParticipantName,
      name: finalParticipantName,
    });

    at.addGrant({
      roomJoin: true,
      room: finalRoomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    // Dispatch agent to the room if config provided (pass-through metadata)
    if (agentConfig) {
      const agentDispatchClient = new AgentDispatchClient(wsUrl, apiKey, apiSecret);
      const agentDispatchName = 'livekit_agent_server';

      // If the payload doesn't include a squad, wrap it in the squad format expected by many agent servers
      const baseMetadata = agentConfig?.squad
        ? agentConfig
        : {
            callType: 'inbound',
            room_name: finalRoomName,
            demo_mode: true,
            squad: {
              members: [
                {
                  agent: agentConfig,
                },
              ],
            },
          };

      // Ensure compatibility with Python agent expectations by promoting callback/webhook
      const envCallbackUrl = process.env.CALL_EVENTS_URL || process.env.NEXT_PUBLIC_CALL_EVENTS_URL;
      const callbackUrl = (agentConfig as any)?.callbackUrl || (baseMetadata as any)?.callbackUrl || envCallbackUrl;
      const webhookToken = (agentConfig as any)?.webhookToken || (baseMetadata as any)?.webhookToken || process.env.AGENT_WEBHOOK_TOKEN || process.env.NEXT_PUBLIC_AGENT_WEBHOOK_TOKEN;

      // Normalize callConfig so TTS/LLM/STT can be picked up at session level
      const normalizedCallConfig = {
        ...(baseMetadata as any)?.callConfig,
        ...(agentConfig as any)?.callConfig,
        ...(agentConfig as any)?.tts ? { tts: (agentConfig as any).tts } : {},
        ...(agentConfig as any)?.llm ? { llm: (agentConfig as any).llm } : {},
        ...(agentConfig as any)?.stt ? { stt: (agentConfig as any).stt } : {},
      };

      const metadataToSend = {
        ...baseMetadata,
        // Provide top-level fields the Python server reads directly into session.userdata
        ...(callbackUrl ? { callbackUrl } : {}),
        ...(webhookToken ? { webhookToken } : {}),
        // Helpful defaults
        userId: (baseMetadata as any)?.userId || finalParticipantName,
        callConfig: normalizedCallConfig,
      };

      const metadataJson = JSON.stringify(metadataToSend);

      try {
        console.log(`Dispatching agent to room: ${finalRoomName}`);
        const dispatchResult = await agentDispatchClient.createDispatch(
          finalRoomName,
          agentDispatchName,
          { metadata: metadataJson }
        );
        console.log('Agent dispatch successful:', dispatchResult);
      } catch (dispatchError) {
        const errorMessage = dispatchError instanceof Error ? dispatchError.message : 'Unknown dispatch error';
        console.error('Error dispatching agent:', errorMessage);
        // Continue anyway - user can still join the room even if agent failed to dispatch
      }
    }

    return NextResponse.json({
      token,
      url: wsUrl,
      wsUrl,
      roomName: finalRoomName,
      participantName: finalParticipantName,
      agentConfig
    }, { headers: { 'Cache-Control': 'no-store' } });

  } catch (error) {
    console.error('Error generating LiveKit token:', error);
    return NextResponse.json(
      { error: 'Failed to generate token' },
      { status: 500 }
    );
  }
}


