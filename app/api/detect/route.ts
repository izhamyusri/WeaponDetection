import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.DETECTION_API_URL || 'https://weapon-detection.azshorizon.xyz';

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