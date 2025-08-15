import { NextRequest, NextResponse } from 'next/server';
import { RoomServiceClient } from 'livekit-server-sdk';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface ToolCall {
  name: string;
  id: string;
  parameters: Record<string, any>;
  timestamp?: string;
}

interface CallMessage {
  type: string;
  event_context?: string;
  timestamp?: string;
  call?: {
    id: string;
    assistant?: {
      name: string;
    };
    user?: {
      id: string;
    };
    metadata?: any;
  };
  assistant_name?: string;
  tool_call?: ToolCall;
  conversation?: Array<{
    role: string;
    content: string | string[];
  }>;
  usage_summary?: Record<string, any>;
  status?: string;
  endedReason?: string;
  recordingUrl?: string;
}

interface CallEventPayload {
  message: CallMessage;
}

// In-memory waiting room for screenshot results
const pendingScreenshots = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void; timer: NodeJS.Timeout }>();

// Handle capture_screenshot tool
async function handleCaptureScreenshot(toolCall: ToolCall, callId: string, message: CallMessage): Promise<string> {
  const { roomName: roomFromParams, targetIdentity: targetFromParams, question, timeoutMs = 25000 } = toolCall.parameters;

  // Allow fallback to message.call context if not provided explicitly
  const roomName = roomFromParams || message.call?.id;
  const targetIdentity = targetFromParams || message.call?.user?.id;
  
  if (!roomName || !question || !targetIdentity) {
    throw new Error('roomName, question, and targetIdentity are required for capture_screenshot');
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;
  
  if (!apiKey || !apiSecret || !wsUrl) {
    throw new Error('LiveKit not configured');
  }

  // Derive HTTP base from env values
  const httpBase = process.env.NEXT_PUBLIC_LIVEKIT_URL?.startsWith('http')
    ? process.env.NEXT_PUBLIC_LIVEKIT_URL
    : wsUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');

  const roomService = new RoomServiceClient(httpBase, apiKey, apiSecret);

  const requestId = `req_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  const payload = {
    type: 'capture_screenshot',
    question,
    requestId,
  };

  // Send request to the target user via data channel
  await roomService.sendData(roomName, new TextEncoder().encode(JSON.stringify(payload)), 1, {
    destinationIdentities: [targetIdentity],
  });

  // Wait for client to submit the screenshot back to this API (via PUT)
  const screenshotData = await new Promise<{ imageBase64?: string; question?: string; legacyAnswer?: string }>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingScreenshots.delete(requestId);
      reject(new Error('capture_screenshot timed out'));
    }, timeoutMs);
    pendingScreenshots.set(requestId, { resolve, reject, timer });
  });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const effectiveQuestion = question || screenshotData.question || 'What do you see?';

  // Backward-compat: if the client already did vision analysis and sent only an answer,
  // return that instead of calling OpenAI again.
  if (!screenshotData.imageBase64 && screenshotData.legacyAnswer) {
    return screenshotData.legacyAnswer;
  }

  // Fallback mock if no key is configured
  if (!OPENAI_API_KEY) {
    return `Mock vision answer to: ${effectiveQuestion}`;
  }

  // Normalize and validate base64; always build a clean data URL
  if (!screenshotData.imageBase64) {
    throw new Error('Missing imageBase64 in screenshot submission');
  }

  let mimeType = 'image/jpeg';
  let base64Payload = screenshotData.imageBase64;

  if (base64Payload.startsWith('data:')) {
    const match = base64Payload.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) {
      throw new Error('Unsupported data URL format');
    }
    mimeType = match[1] || 'image/jpeg';
    base64Payload = match[2] || '';
  }

  // Strip whitespace/newlines which can invalidate base64
  base64Payload = base64Payload.replace(/\s/g, '');

  // Quick validation: attempt decode and re-encode
  try {
    const buf = Buffer.from(base64Payload, 'base64');
    // Guard against empty/invalid buffers
    if (!buf || buf.length === 0) {
      throw new Error('Empty decoded buffer');
    }
    base64Payload = buf.toString('base64');
  } catch (e) {
    throw new Error('Invalid base64 payload for screenshot');
  }

  const dataUrl = `data:${mimeType};base64,${base64Payload}`;

  const openaiRes = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      input: [
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: effectiveQuestion },
            { type: 'input_image', image_url: dataUrl },
          ],
        },
      ],
      text: { verbosity: "low" },
    }),
  });



  if (!openaiRes.ok) {
    const errText = await openaiRes.text();
    throw new Error(`Vision LLM error: ${errText}`);
  }

  const json = await openaiRes.json();
  
  // Extract the text from the Responses API structure
  const messageOutput = json?.output?.find((item: any) => item.type === 'message');
  const textContent = messageOutput?.content?.find((item: any) => item.type === 'output_text');
  const answer: string = textContent?.text || 'No response text found';
  
  console.log('Extracted answer:', answer);
  return answer;
}

// Handle markStepComplete tool
async function handleMarkStepComplete(toolCall: ToolCall, callId: string, message: CallMessage): Promise<string> {
  const { stepId, roomName: roomFromParams, targetIdentity: targetFromParams } = toolCall.parameters;
  
  // Allow fallback to message.call context if not provided explicitly
  const roomName = roomFromParams || message.call?.id;
  const targetIdentity = targetFromParams || message.call?.user?.id;
  
  if (!roomName || !targetIdentity || stepId === undefined) {
    throw new Error('roomName, targetIdentity, and stepId are required for markStepComplete');
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;
  
  if (!apiKey || !apiSecret || !wsUrl) {
    throw new Error('LiveKit not configured');
  }

  // Derive HTTP base from env values
  const httpBase = process.env.NEXT_PUBLIC_LIVEKIT_URL?.startsWith('http')
    ? process.env.NEXT_PUBLIC_LIVEKIT_URL
    : wsUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');

  const roomService = new RoomServiceClient(httpBase, apiKey, apiSecret);

  const requestId = `req_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  const payload = {
    type: 'mark_step_complete',
    stepId: Number(stepId),
    requestId,
  };

  // Send request to the target user via data channel
  await roomService.sendData(roomName, new TextEncoder().encode(JSON.stringify(payload)), 1, {
    destinationIdentities: [targetIdentity],
  });

  return `Step ${stepId} marked complete`;
}

export async function POST(req: NextRequest) {
  try {
    const raw: any = await req.json();
    console.log("Received call event payload:", JSON.stringify(raw, null, 2));

    // Support both { message: {...} } and a flat payload from webhook manager
    let message: CallMessage | undefined = (raw as CallEventPayload)?.message;
    if (!message && raw?.event) {
      // Attempt to normalize webhook-style payload into CallMessage
      const evt = String(raw.event || '');
      const data = raw.data || {};
      const userData = raw.user_data_dict || raw.user_data || raw.userData || {};
      const callId = raw.room_name || raw.roomName || userData.room_name || userData.roomName;
      const userId = (raw.user && raw.user.id) || raw.user_id || raw.userId || userData.user_id || userData.userId;
      const assistantName = data.agent_name || raw.assistant_name;

      if (evt === 'tool.attempted') {
        message = {
          type: 'tool-call-attempt',
          tool_call: {
            name: data.tool_name,
            id: data.tool_id,
            parameters: data.parameters || {},
            timestamp: raw.timestamp,
          },
          call: {
            id: callId,
            user: userId ? { id: String(userId) } : undefined,
            assistant: assistantName ? { name: String(assistantName) } : undefined,
          },
          timestamp: raw.timestamp,
        } as CallMessage;
      }
    }

    if (!message) {
      console.warn("Received payload without a .message object:", raw);
      return NextResponse.json({ error: 'Invalid event structure: Missing message object.' }, { status: 400 });
    }

    // Handle tool calls
    if (message.type === 'tool-call-attempt' && message.tool_call) {
      console.log(`Handling tool_call_attempt for tool: ${message.tool_call.name}, id: ${message.tool_call.id}`);
      
      const toolCall = message.tool_call;
      const callId = message.call?.id || 'unknown';

      try {
        let result: any = null;

        // Route tool calls to appropriate handlers
        switch (toolCall.name) {
          case 'capture_screenshot':
          case 'captureScreenshot':
            result = await handleCaptureScreenshot(toolCall, callId, message);
            break;
          
          case 'markStepComplete':
            result = await handleMarkStepComplete(toolCall, callId, message);
            break;
          
          default:
            console.warn(`Unknown tool: ${toolCall.name}`);
            return NextResponse.json({ 
              error: `Unknown tool: ${toolCall.name}` 
            }, { status: 400 });
        }

        console.log(`Tool ${toolCall.name} executed successfully for call ${callId}`);
        return NextResponse.json({ 
          success: true, 
          tool_name: toolCall.name,
          tool_id: toolCall.id,
          result: result
        });

      } catch (error: any) {
        console.error(`Error executing tool ${toolCall.name}:`, error);
        return NextResponse.json({ 
          error: `Tool execution failed: ${error.message}`,
          tool_name: toolCall.name,
          tool_id: toolCall.id
        }, { status: 500 });
      }
    }

    // Handle other event types (conversation updates, end-of-call, etc.)
    console.log(`Received event type: ${message.type} - currently not handled in this demo`);
    return NextResponse.json({ 
      success: true, 
      message: `Event type '${message.type}' received but not actively handled in this demo.` 
    });

  } catch (error) {
    console.error("Error processing call event:", error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ 
      error: 'Failed to process webhook', 
      details: errorMessage 
    }, { status: 500 });
  }
}

// Companion endpoint for the client to deliver screenshot results and step completion confirmations
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { requestId, imageBase64, question, answer, stepCompleted, success } = body || {};
    
    if (!requestId) {
      return NextResponse.json({ error: 'requestId required' }, { status: 400 });
    }

    // Handle step completion confirmations
    if (stepCompleted !== undefined) {
      console.log(`Step ${stepCompleted} completion confirmed for request ${requestId}`);
      return NextResponse.json({ ok: true, stepCompleted, success });
    }

    // Handle screenshot submissions
    const waiter = pendingScreenshots.get(requestId);
    if (!waiter) {
      return NextResponse.json({ error: 'No pending request' }, { status: 404 });
    }

    pendingScreenshots.delete(requestId);
    clearTimeout(waiter.timer);

    // Prefer screenshot relay; keep backward-compat with legacy 'answer' field
    if (imageBase64) {
      waiter.resolve({ imageBase64, question });
    } else {
      waiter.resolve({ imageBase64: '', question, legacyAnswer: answer || '' });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ 
      error: e?.message || 'failed to submit result' 
    }, { status: 500 });
  }
}
