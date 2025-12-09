import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.DETECTION_API_URL || 'https://khaiman-test-weapon-detection-api.hf.space';
const WEBHOOK_URL = process.env.WEBHOOK_URL;

console.log('===== Environment Variables at Startup =====');
console.log('API_URL:', API_URL);
console.log('WEBHOOK_URL:', WEBHOOK_URL);
console.log('==========================================');

// Function to send webhook notification
async function sendWebhook(detections: any[]) {
  console.log('sendWebhook called with detections:', detections.length);
  console.log('WEBHOOK_URL:', WEBHOOK_URL);

  if (!WEBHOOK_URL) {
    console.log('No webhook URL configured, skipping webhook notification');
    return;
  }

  const payload = { detections };
  console.log('Sending webhook payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    console.log('Webhook response status:', response.status);
    const responseText = await response.text();
    console.log('Webhook response body:', responseText);

    if (!response.ok) {
      console.error('Webhook call failed:', response.status, response.statusText);
    } else {
      console.log('Webhook notification sent successfully');
    }
  } catch (error) {
    console.error('Error sending webhook:', error);
  }
}

// Function to extract detections from response data
function extractDetections(data: any): any[] {
  console.log('extractDetections called with data:', JSON.stringify(data, null, 2));
  const detections: any[] = [];

  // Handle image response
  if (data.detections && Array.isArray(data.detections)) {
    console.log('Found image detections:', data.detections.length);
    data.detections.forEach((det: any) => {
      detections.push({
        class_id: det.class_id || det.class,
        class_name: det.class_name || det.name,
        confidence: det.confidence,
        bbox: det.bbox || {
          x1: det.x1 || det.xmin,
          y1: det.y1 || det.ymin,
          x2: det.x2 || det.xmax,
          y2: det.y2 || det.ymax,
        },
      });
    });
  }

  // Handle video response with frames
  if (data.frames && Array.isArray(data.frames)) {
    console.log('Found video frames:', data.frames.length);
    data.frames.forEach((frame: any) => {
      if (frame.detections && Array.isArray(frame.detections)) {
        console.log(`Frame ${frame.frame_number} has ${frame.detections.length} detections`);
        frame.detections.forEach((det: any) => {
          detections.push({
            class_id: det.class_id || det.class,
            class_name: det.class_name || det.name,
            confidence: det.confidence,
            bbox: det.bbox || {
              x1: det.x1 || det.xmin,
              y1: det.y1 || det.ymin,
              x2: det.x2 || det.xmax,
              y2: det.y2 || det.ymax,
            },
            frame_number: frame.frame_number,
          });
        });
      }
    });
  }

  console.log('Total detections extracted:', detections.length);
  return detections;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const confidence = formData.get('confidence');
    const skipFrames = formData.get('skip_frames');
    const returnFrames = formData.get('return_frames');

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Determine if it's an image or video
    const fileType = file.type;
    let endpoint: string;

    if (fileType.startsWith('image/')) {
      endpoint = '/detect/image';
    } else if (fileType.startsWith('video/')) {
      endpoint = '/detect/video';
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload an image or video.' },
        { status: 400 }
      );
    }

    // Forward the request to your FastAPI backend
    const apiFormData = new FormData();
    apiFormData.append('file', file);

    // Build query parameters
    const queryParams = new URLSearchParams();
    if (confidence) {
      queryParams.append('confidence', confidence.toString());
    }
    if (skipFrames && endpoint === '/detect/video') {
      queryParams.append('skip_frames', skipFrames.toString());
    }
    if (returnFrames && endpoint === '/detect/video') {
      queryParams.append('return_frames', returnFrames.toString());
    }

    const url = `${API_URL}${endpoint}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

    const response = await fetch(url, {
      method: 'POST',
      body: apiFormData,
    });

    if (!response.ok) {
      // Handle error response
      const responseText = await response.text();
      let errorData: any = { detail: response.statusText };

      try {
        errorData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse error response as JSON:', {
          responseText: responseText.substring(0, 500),
          parseError
        });
      }

      console.error('Backend API error:', {
        status: response.status,
        statusText: response.statusText,
        url: url,
        errorData: errorData
      });

      return NextResponse.json(
        {
          error: 'Detection failed',
          details: errorData.detail || errorData.message || `Backend API error: ${response.statusText}`,
          status: response.status,
          backend_url: API_URL
        },
        { status: response.status }
      );
    }

    // Handle video streaming response differently
    if (endpoint === '/detect/video') {
      // For video, collect all streaming chunks
      const responseText = await response.text();

      // The response might be newline-delimited JSON or a single JSON object
      // Try to parse as single JSON first
      try {
        const data = JSON.parse(responseText);

        // Extract detections and send webhook
        console.log('=== Video Detection Complete (single JSON) ===');
        const detections = extractDetections(data);
        console.log('Calling webhook with detections...');
        // Always send webhook on successful detection response
        sendWebhook(detections).catch(err =>
          console.error('Webhook notification failed:', err)
        );

        return NextResponse.json(data);
      } catch {
        // If that fails, try parsing as newline-delimited JSON
        try {
          const lines = responseText.trim().split('\n');
          const jsonObjects = lines
            .filter(line => line.trim())
            .map(line => JSON.parse(line));

          // Filter only frame objects (exclude summary/other message types)
          const frames = jsonObjects.filter(obj => obj.type === 'frame');

          // Combine all the streaming results
          const combinedResult = {
            success: true,
            frames: frames,
            total_frames: frames.length,
            total_detections: frames.reduce((sum, frame) => sum + (frame.count || 0), 0)
          };

          // Extract detections and send webhook
          console.log('=== Video Detection Complete (streaming) ===');
          const detections = extractDetections(combinedResult);
          console.log('Calling webhook with detections...');
          // Always send webhook on successful detection response
          sendWebhook(detections).catch(err =>
            console.error('Webhook notification failed:', err)
          );

          return NextResponse.json(combinedResult);
        } catch (parseError) {
          console.error('Failed to parse video response:', {
            responseText: responseText.substring(0, 500),
            parseError
          });
          throw new Error('Invalid JSON response from video endpoint');
        }
      }
    }

    // Handle image response (single JSON object)
    const responseText = await response.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse success response as JSON:', {
        responseText: responseText.substring(0, 500),
        parseError
      });
      throw new Error('Invalid JSON response from backend');
    }

    // Extract detections and send webhook
    console.log('=== Image Detection Complete ===');
    const detections = extractDetections(data);
    console.log('Calling webhook with detections...');
    // Always send webhook on successful detection response
    sendWebhook(detections).catch(err =>
      console.error('Webhook notification failed:', err)
    );

    return NextResponse.json(data);
  } catch (error) {
    console.error('Detection API error:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      backend_url: API_URL
    });

    return NextResponse.json(
      {
        error: 'Detection failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        backend_url: API_URL
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  try {
    const response = await fetch(`${API_URL}/health`);
    const data = await response.json();

    return NextResponse.json({
      status: 'ok',
      backend: data
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: 'Backend unreachable' },
      { status: 503 }
    );
  }
}