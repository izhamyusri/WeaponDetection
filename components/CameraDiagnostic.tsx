// components/CameraDiagnostic.tsx
// Use this to debug camera issues

'use client';

import React, { useState, useEffect } from 'react';

const CameraDiagnostic: React.FC = () => {
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    const runDiagnostics = async () => {
      const logs: string[] = [];

      // Check 1: Browser support
      logs.push('=== BROWSER SUPPORT ===');
      logs.push(`Browser: ${navigator.userAgent}`);
      logs.push(`MediaDevices API: ${navigator.mediaDevices ? '✅ Available' : '❌ Not available'}`);
      logs.push(`getUserMedia: ${typeof navigator.mediaDevices?.getUserMedia === 'function' ? '✅ Available' : '❌ Not available'}`);

      // Check 2: Protocol
      logs.push('\n=== CONNECTION ===');
      logs.push(`Protocol: ${window.location.protocol}`);
      logs.push(`Host: ${window.location.host}`);
      logs.push(`Is Secure: ${window.isSecureContext ? '✅ Yes' : '❌ No (may need HTTPS or localhost)'}`);

      // Check 3: Permissions
      logs.push('\n=== PERMISSIONS ===');
      if (navigator.permissions) {
        try {
          const cameraPermission = await navigator.permissions.query({ name: 'camera' as PermissionName });
          logs.push(`Camera permission: ${cameraPermission.state}`);
        } catch (err) {
          logs.push(`Camera permission: Unable to query (${err})`);
        }
      } else {
        logs.push('Permissions API not available');
      }

      // Check 4: Available devices
      logs.push('\n=== DEVICES ===');
      if (navigator.mediaDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(d => d.kind === 'videoinput');
          
          logs.push(`Total video devices: ${videoDevices.length}`);
          
          if (videoDevices.length > 0) {
            videoDevices.forEach((device, index) => {
              logs.push(`  Camera ${index + 1}:`);
              logs.push(`    - Device ID: ${device.deviceId}`);
              logs.push(`    - Label: ${device.label || '(Permission needed to see name)'}`);
              logs.push(`    - Group ID: ${device.groupId}`);
            });
            setCameras(videoDevices);
          } else {
            logs.push('❌ No video input devices found!');
          }

          const audioDevices = devices.filter(d => d.kind === 'audioinput');
          logs.push(`Audio input devices: ${audioDevices.length}`);
        } catch (err: any) {
          logs.push(`❌ Error enumerating devices: ${err.message}`);
        }
      }

      // Check 5: Try to access camera
      logs.push('\n=== CAMERA ACCESS TEST ===');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 640, height: 480 } 
        });
        logs.push('✅ Camera access granted!');
        logs.push(`Video tracks: ${stream.getVideoTracks().length}`);
        
        const track = stream.getVideoTracks()[0];
        if (track) {
          const settings = track.getSettings();
          logs.push('Camera settings:');
          logs.push(`  - Width: ${settings.width}`);
          logs.push(`  - Height: ${settings.height}`);
          logs.push(`  - Frame rate: ${settings.frameRate}`);
          logs.push(`  - Facing mode: ${settings.facingMode || 'unknown'}`);
        }
        
        // Stop the stream
        stream.getTracks().forEach(track => track.stop());
        logs.push('✅ Camera test completed successfully');
      } catch (err: any) {
        logs.push(`❌ Camera access FAILED`);
        logs.push(`Error name: ${err.name}`);
        logs.push(`Error message: ${err.message}`);
        
        // Provide specific guidance
        logs.push('\n=== SOLUTION ===');
        switch (err.name) {
          case 'NotAllowedError':
          case 'PermissionDeniedError':
            logs.push('• Grant camera permission in browser');
            logs.push('• Click lock icon in address bar → Camera → Allow');
            logs.push('• Refresh the page');
            break;
          case 'NotFoundError':
          case 'DevicesNotFoundError':
            logs.push('• No camera detected');
            logs.push('• Connect a camera/webcam');
            logs.push('• Check camera is enabled in Device Manager (Windows)');
            break;
          case 'NotReadableError':
          case 'TrackStartError':
            logs.push('• Camera is in use by another app');
            logs.push('• Close apps: Zoom, Teams, Skype, Discord, etc.');
            logs.push('• Restart browser');
            break;
          case 'SecurityError':
            logs.push('• Must use HTTPS or localhost');
            logs.push('• Use http://localhost:3000 (not 127.0.0.1)');
            break;
        }
      }

      setDiagnostics(logs);
    };

    runDiagnostics();
  }, []);

  const testCamera = async (deviceId?: string) => {
    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : true
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      alert(`✅ Camera test successful!\n\nDevice: ${deviceId || 'default'}\nTracks: ${stream.getVideoTracks().length}`);
      stream.getTracks().forEach(track => track.stop());
    } catch (err: any) {
      alert(`❌ Camera test failed!\n\nError: ${err.name}\nMessage: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">📹 Camera Diagnostics</h1>
        
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">System Information</h2>
          <pre className="bg-black p-4 rounded overflow-x-auto text-sm">
            {diagnostics.join('\n')}
          </pre>
        </div>

        {cameras.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Test Individual Cameras</h2>
            <div className="space-y-3">
              {cameras.map((camera, index) => (
                <button
                  key={camera.deviceId}
                  onClick={() => testCamera(camera.deviceId)}
                  className="w-full p-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-left transition-colors"
                >
                  <div className="font-semibold">Camera {index + 1}</div>
                  <div className="text-sm text-gray-200">
                    {camera.label || 'Unknown Camera'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 bg-yellow-900 bg-opacity-30 border border-yellow-600 rounded-lg p-4">
          <h3 className="font-semibold mb-2">Quick Fixes:</h3>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Use Chrome or Edge browser (best support)</li>
            <li>Use http://localhost:3000 (not 127.0.0.1)</li>
            <li>Grant camera permissions (click lock icon in address bar)</li>
            <li>Close other apps using camera (Zoom, Teams, etc.)</li>
            <li>Refresh page after granting permissions</li>
          </ul>
        </div>

        <div className="mt-6">
          <a 
            href="/"
            className="inline-block px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition-colors"
          >
            ← Back to Detection App
          </a>
        </div>
      </div>
    </div>
  );
};

export default CameraDiagnostic;