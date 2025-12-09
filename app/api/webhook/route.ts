import { NextRequest, NextResponse } from 'next/server';

const WEBHOOK_URL = process.env.WEBHOOK_URL;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { detections, image } = body;

    console.log('Webhook relay called with detections:', detections?.length || 0);
    console.log('Image included:', !!image);
    console.log('WEBHOOK_URL:', WEBHOOK_URL);

    if (!WEBHOOK_URL) {
      console.error('No webhook URL configured');
      return NextResponse.json(
        { error: 'Webhook URL not configured' },
        { status: 500 }
      );
    }

    if (!detections || !Array.isArray(detections)) {
      return NextResponse.json(
        { error: 'Invalid detections data' },
        { status: 400 }
      );
    }

    const payload: any = { detections };

    // Include image if provided
    if (image) {
      payload.image = image;
    }

    console.log('Sending to webhook (detections):', detections.length);

    // Send to n8n webhook
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log('Webhook response status:', response.status);
    console.log('Webhook response body:', responseText);

    if (!response.ok) {
      console.error('Webhook call failed:', response.status, response.statusText);
      return NextResponse.json(
        {
          error: 'Webhook call failed',
          status: response.status,
          details: responseText
        },
        { status: response.status }
      );
    }

    console.log('Webhook notification sent successfully');
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook relay error:', error);
    return NextResponse.json(
      {
        error: 'Webhook relay failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
