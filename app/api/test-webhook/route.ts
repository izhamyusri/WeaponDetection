import { NextRequest, NextResponse } from 'next/server';

const WEBHOOK_URL = process.env.WEBHOOK_URL;

export async function GET() {
  console.log('Test webhook endpoint called');
  console.log('WEBHOOK_URL:', WEBHOOK_URL);

  if (!WEBHOOK_URL) {
    return NextResponse.json({
      error: 'WEBHOOK_URL not configured',
      message: 'Please set WEBHOOK_URL in your .env.local file'
    }, { status: 500 });
  }

  // Send test webhook
  const testPayload = {
    detections: [
      {
        class_id: 0,
        class_name: "gun",
        confidence: 0.95,
        bbox: { x1: 100, y1: 100, x2: 200, y2: 200 }
      },
      {
        class_id: 1,
        class_name: "knife",
        confidence: 0.88,
        bbox: { x1: 300, y1: 150, x2: 400, y2: 250 }
      }
    ]
  };

  console.log('Sending test webhook with payload:', JSON.stringify(testPayload, null, 2));

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    const responseText = await response.text();
    console.log('Webhook response status:', response.status);
    console.log('Webhook response body:', responseText);

    return NextResponse.json({
      success: response.ok,
      webhook_url: WEBHOOK_URL,
      status: response.status,
      response: responseText,
      test_payload: testPayload
    });
  } catch (error) {
    console.error('Webhook test failed:', error);
    return NextResponse.json({
      error: 'Webhook test failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      webhook_url: WEBHOOK_URL
    }, { status: 500 });
  }
}
