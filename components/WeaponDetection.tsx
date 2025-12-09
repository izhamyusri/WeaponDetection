'use client';

import { useState, useRef, useEffect } from 'react';
import { FrameCarousel } from './FrameCarousel';

interface Detection {
  class_id: number;
  class_name: string;
  confidence: number;
  bbox: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

interface DetectionResponse {
  success: boolean;
  detections: Detection[];
  count: number;
  image_size: {
    width: number;
    height: number;
  };
}

export default function WeaponDetection() {
  const [image, setImage] = useState<string | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [uploadedVideo, setUploadedVideo] = useState<string | null>(null);
  const [videoDetectionResult, setVideoDetectionResult] = useState<any>(null);
  const [extractedFrames, setExtractedFrames] = useState<any[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const uploadedVideoRef = useRef<HTMLVideoElement>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const lastWebhookTime = useRef<number>(0);
  const currentFrameData = useRef<string | null>(null);

  // Convert image to RGB (remove alpha channel)
  const convertToRGB = async (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;

        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Fill with white background (in case of transparency)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw image on top
        ctx.drawImage(img, 0, 0);

        // Convert to blob (JPEG has no alpha channel)
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to convert image'));
            }
          },
          'image/jpeg',
          0.95
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  };

  // Handle image upload and detection
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setUploadedVideo(null);
    setVideoDetectionResult(null);

    try {
      // Display uploaded image
      const reader = new FileReader();
      reader.onload = (e) => setImage(e.target?.result as string);
      reader.readAsDataURL(file);

      // Convert to RGB before sending (removes alpha channel)
      const rgbBlob = await convertToRGB(file);

      // Send to Next.js API route
      const formData = new FormData();
      formData.append('file', rgbBlob, 'image.jpg');

      const response = await fetch('/api/detect', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Image detection failed:', {
          status: response.status,
          statusText: response.statusText,
          errorData
        });

        const errorMessage = errorData.details || errorData.error || `Detection failed (${response.status})`;
        throw new Error(errorMessage);
      }

      const data: DetectionResponse = await response.json();
      setDetections(data.detections);
      setImageSize(data.image_size);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Detection failed';
      setError(errorMessage);
      console.error('Image detection error:', {
        error: err,
        message: errorMessage
      });
    } finally {
      setLoading(false);
    }
  };

  // Extract frames from video at specific frame numbers
  const extractFramesFromVideo = async (videoElement: HTMLVideoElement, frameNumbers: number[]) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];

    const frames: any[] = [];

    for (const frameNum of frameNumbers) {
      // Calculate time for this frame (assuming ~30 fps)
      const time = frameNum / 30;

      // Seek to the frame
      videoElement.currentTime = time;

      // Wait for the video to seek
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          videoElement.removeEventListener('seeked', onSeeked);
          resolve();
        };
        videoElement.addEventListener('seeked', onSeeked);
      });

      // Set canvas size to video size
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;

      // Draw the current frame
      ctx.drawImage(videoElement, 0, 0);

      // Convert to base64
      const frameImage = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

      frames.push({
        frameNumber: frameNum,
        image: frameImage,
      });
    }

    return frames;
  };

  // Handle video upload and detection
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Clear image state first before loading
    setImage(null);
    setDetections([]);
    setImageSize(null);
    setVideoDetectionResult(null);
    setExtractedFrames([]);
    setError(null);
    setLoading(true);

    try {
      // Display uploaded video
      const videoUrl = URL.createObjectURL(file);
      setUploadedVideo(videoUrl);

      // Send to Next.js API route
      const formData = new FormData();
      formData.append('file', file);
      formData.append('return_frames', 'true');

      const response = await fetch('/api/detect', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Video detection failed:', {
          status: response.status,
          statusText: response.statusText,
          errorData
        });

        const errorMessage = errorData.details || errorData.error || `Detection failed (${response.status})`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('Video detection response:', data);
      setVideoDetectionResult(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Detection failed';
      setError(errorMessage);
      console.error('Video detection error:', {
        error: err,
        message: errorMessage
      });
    } finally {
      setLoading(false);
    }
  };

  // Send webhook notification with 30-second throttling
  const sendWebhookNotification = async (detections: Detection[], imageBase64?: string) => {
    try {
      // Check if 30 seconds have passed since last webhook
      const now = Date.now();
      const timeSinceLastWebhook = now - lastWebhookTime.current;

      if (timeSinceLastWebhook < 30000) {
        console.log(`Webhook throttled. ${Math.ceil((30000 - timeSinceLastWebhook) / 1000)}s remaining`);
        return;
      }

      console.log('Sending webhook notification with detections:', detections.length);

      const payload: any = { detections };

      // Add base64 image if available
      if (imageBase64) {
        payload.image = imageBase64;
      } else if (currentFrameData.current) {
        payload.image = currentFrameData.current;
      }

      const response = await fetch('/api/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        console.log('Webhook notification sent successfully');
        lastWebhookTime.current = now; // Update last webhook time
      } else {
        const errorText = await response.text();
        console.error('Webhook notification failed:', response.status, errorText);
      }
    } catch (error) {
      console.error('Error sending webhook notification:', error);
    }
  };

  // Connect to WebSocket for real-time detection
  const connectWebSocket = () => {
    // Use environment variable or default to localhost
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/detect/realtime';

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      websocketRef.current = ws;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.success) {
          setDetections(data.detections);

          // Send webhook notification if there are detections
          if (data.detections && data.detections.length > 0) {
            sendWebhookNotification(data.detections).catch(err =>
              console.error('Webhook notification failed:', err)
            );
          }

          // Draw detections on canvas
          if (canvasRef.current) {
            const ctx = canvasRef.current.getContext('2d');
            if (ctx && data.image_size) {
              drawDetections(ctx, data.detections, data.image_size.width, data.image_size.height);
            }
          }
        } else if (data.error) {
          console.error('WebSocket detection error:', data.error);
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('WebSocket connection error');
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      websocketRef.current = null;
    };

    return ws;
  };

  // Start webcam
  const startWebcam = async () => {
    try {
      console.log('Requesting webcam access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 }
      });

      console.log('Webcam access granted, setting up video element...');
      streamRef.current = stream;
      setIsWebcamActive(true); // Set this FIRST so the video element renders

      // Wait a tick for React to render the video element
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;

          // Wait for video to be ready and play
          videoRef.current.onloadedmetadata = () => {
            if (videoRef.current) {
              videoRef.current.play().then(() => {
                console.log('Webcam video playing successfully');

                // Connect to WebSocket
                connectWebSocket();

                // Start sending frames to WebSocket after a short delay
                setTimeout(() => {
                  startRealTimeDetection();
                }, 1000);
              }).catch((err) => {
                console.error('Failed to play video:', err);
                setError('Failed to play webcam video');
              });
            }
          };
        }
      }, 100);
    } catch (err) {
      setError('Failed to access webcam');
      console.error('Webcam error:', err);
    }
  };

  // Stop webcam
  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }
    setIsWebcamActive(false);
    setDetections([]);
  };

  // Real-time detection from webcam using WebSocket
  const startRealTimeDetection = () => {
    intervalRef.current = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current || !websocketRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) return;
      if (websocketRef.current.readyState !== WebSocket.OPEN) return;

      // Set canvas dimensions to match video
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      // Create a temporary canvas to capture the video frame
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = video.videoWidth;
      tempCanvas.height = video.videoHeight;
      const tempCtx = tempCanvas.getContext('2d');

      if (!tempCtx) return;

      // Draw video frame to temporary canvas
      tempCtx.drawImage(video, 0, 0);

      // Convert temporary canvas to base64
      tempCanvas.toBlob(async (blob) => {
        if (!blob) return;

        try {
          // Convert blob to base64
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = reader.result as string;
            // Remove the data:image/jpeg;base64, prefix
            const base64Image = base64data.split(',')[1];

            // Store current frame data for webhook
            currentFrameData.current = base64Image;

            // Send to WebSocket
            if (websocketRef.current?.readyState === WebSocket.OPEN) {
              websocketRef.current.send(JSON.stringify({
                image: base64Image,
                confidence: 0.25
              }));
            }
          };
          reader.readAsDataURL(blob);
        } catch (err) {
          console.error('Real-time detection error:', err);
        }
      }, 'image/jpeg', 0.8);
    }, 500); // Send frame every 500ms (adjust for performance)
  };

  // Draw bounding boxes on canvas
  const drawDetections = (
    ctx: CanvasRenderingContext2D,
    detections: Detection[],
    width: number,
    height: number
  ) => {
    ctx.clearRect(0, 0, width, height);
    
    detections.forEach((det) => {
      const { bbox, class_name, confidence } = det;
      
      // Draw bounding box
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 3;
      ctx.strokeRect(bbox.x1, bbox.y1, bbox.x2 - bbox.x1, bbox.y2 - bbox.y1);
      
      // Draw label background
      ctx.fillStyle = '#FF0000';
      const label = `${class_name} ${(confidence * 100).toFixed(1)}%`;
      const textWidth = ctx.measureText(label).width;
      ctx.fillRect(bbox.x1, bbox.y1 - 25, textWidth + 10, 25);
      
      // Draw label text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '16px Arial';
      ctx.fillText(label, bbox.x1 + 5, bbox.y1 - 7);
    });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWebcam();
    };
  }, []);

  // Get current timestamp for CCTV overlay
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    // Set initial time on client side only to avoid hydration mismatch
    setCurrentTime(new Date());

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  return (
    <div className="min-h-screen bg-black text-green-500 font-mono p-4">
      {/* CCTV Header */}
      <div className="border-2 border-green-500 mb-4 p-4 bg-black/50">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></div>
            <h1 className="text-2xl font-bold tracking-wider">WEAPON DETECTION SYSTEM</h1>
          </div>
          <div className="text-right">
            <div className="text-sm">SURVEILLANCE ACTIVE</div>
            <div className="text-xs text-green-400">
              {currentTime ? formatTime(currentTime) : '--/--/----, --:--:--'}
            </div>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="border-2 border-green-500 mb-4 p-3 bg-black/50">
        <div className="flex gap-3 justify-center flex-wrap">
          <button
            onClick={() => {
              stopWebcam();
              document.getElementById('fileInput')?.click();
            }}
            className="px-4 py-2 border-2 border-green-500 hover:bg-green-500 hover:text-black transition font-bold tracking-wide"
          >
            [IMG UPLOAD]
          </button>
          <button
            onClick={() => {
              stopWebcam();
              document.getElementById('videoInput')?.click();
            }}
            className="px-4 py-2 border-2 border-green-500 hover:bg-green-500 hover:text-black transition font-bold tracking-wide"
          >
            [VID UPLOAD]
          </button>
          <button
            onClick={isWebcamActive ? stopWebcam : startWebcam}
            className={`px-4 py-2 border-2 font-bold tracking-wide transition ${
              isWebcamActive
                ? 'border-red-500 text-red-500 hover:bg-red-500 hover:text-black'
                : 'border-green-500 hover:bg-green-500 hover:text-black'
            }`}
          >
            {isWebcamActive ? '[STOP CAM]' : '[START CAM]'}
          </button>
        </div>
      </div>

      <input
        id="fileInput"
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />
      <input
        id="videoInput"
        type="file"
        accept="video/*"
        onChange={handleVideoUpload}
        className="hidden"
      />

      {/* Main Content - Side by Side Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Side - Video Feed (2/3 width on large screens) */}
        <div className="lg:col-span-2">
          <div className="border-2 border-green-500 bg-black/50 relative">
            {/* CCTV Overlay Header */}
            <div className="absolute top-0 left-0 right-0 z-10 bg-black/70 border-b border-green-500 p-2 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
                <span className="text-xs font-bold">CAM-01</span>
              </div>
              <div className="text-xs">
                {currentTime ? formatTime(currentTime) : '--/--/----, --:--:--'}
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="absolute top-12 left-4 right-4 z-10 p-3 bg-red-900/90 border-2 border-red-500 text-red-200">
                <div className="font-bold">[ERROR]</div>
                {error}
              </div>
            )}

            {/* Loading Indicator */}
            {loading && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-green-500 border-t-transparent"></div>
                  <p className="mt-3 text-green-400 font-bold tracking-wide">ANALYZING...</p>
                </div>
              </div>
            )}

            {/* Image Upload Display */}
            {image && !isWebcamActive && !uploadedVideo && (
              <div className="relative pt-12">
                <div className="max-w-2xl mx-auto">
                  <img
                    ref={imageRef}
                    src={image}
                    alt="Uploaded"
                    className="w-full"
                  />
                  {detections.length > 0 && imageRef.current && imageSize && (
                    <div className="absolute top-12 left-0 w-full h-full flex justify-center">
                      <svg style={{ width: imageRef.current.clientWidth, height: imageRef.current.clientHeight }}>
                        {detections.map((det, idx) => {
                          const scaleX = imageRef.current!.clientWidth / imageSize.width;
                          const scaleY = imageRef.current!.clientHeight / imageSize.height;
                          const x1 = det.bbox.x1 * scaleX;
                          const y1 = det.bbox.y1 * scaleY;
                          const x2 = det.bbox.x2 * scaleX;
                          const y2 = det.bbox.y2 * scaleY;

                          return (
                            <g key={idx}>
                              <rect
                                x={x1}
                                y={y1}
                                width={x2 - x1}
                                height={y2 - y1}
                                fill="none"
                                stroke="#ff0000"
                                strokeWidth="3"
                              />
                              <rect
                                x={x1}
                                y={y1 - 24}
                                width={(det.class_name.length + 8) * 8}
                                height="24"
                                fill="#ff0000"
                              />
                              <text
                                x={x1 + 5}
                                y={y1 - 7}
                                fill="white"
                                fontSize="14"
                                fontWeight="bold"
                                fontFamily="monospace"
                              >
                                {det.class_name} {(det.confidence * 100).toFixed(1)}%
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Webcam Display */}
            {isWebcamActive && (
              <div className="relative pt-12">
                <div className="max-w-2xl mx-auto relative">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full"
                  />
                  <canvas
                    ref={canvasRef}
                    className="absolute top-0 left-0 w-full h-full pointer-events-none"
                    style={{ background: 'transparent' }}
                  />
                </div>
              </div>
            )}

            {/* Uploaded Video Display */}
            {uploadedVideo && !isWebcamActive && (
              <div className="pt-12">
                <div className="max-w-2xl mx-auto">
                  <video
                    ref={uploadedVideoRef}
                    src={uploadedVideo}
                    controls
                    className="w-full"
                  />
                </div>

                {/* Frame Carousel */}
                {videoDetectionResult && videoDetectionResult.frames && (
                  <div className="max-w-4xl mx-auto mt-6">
                    <FrameCarousel frames={videoDetectionResult.frames} />
                  </div>
                )}
              </div>
            )}

            {/* Idle State */}
            {detections.length === 0 && !loading && !error && !uploadedVideo && !image && !isWebcamActive && (
              <div className="flex items-center justify-center h-96 text-green-400/50 pt-12">
                <div className="text-center">
                  <div className="text-6xl mb-4">◉</div>
                  <div className="text-lg tracking-wider">NO SIGNAL</div>
                  <div className="text-sm mt-2">AWAITING INPUT SOURCE</div>
                </div>
              </div>
            )}

            {isWebcamActive && detections.length === 0 && !loading && (
              <div className="absolute bottom-4 left-4 bg-black/70 border border-green-500 px-3 py-2">
                <span className="text-xs">STATUS: MONITORING</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Side - Detection Panel (1/3 width on large screens) */}
        <div className="lg:col-span-1">
          <div className="border-2 border-green-500 bg-black/50 h-full">
            <div className="border-b border-green-500 p-3 bg-green-500/10">
              <h2 className="text-lg font-bold tracking-wider">DETECTION LOG</h2>
            </div>

            <div className="p-3 space-y-3 max-h-[600px] overflow-y-auto">
              {/* Video Detection Results */}
              {uploadedVideo && videoDetectionResult && (
                <div className="space-y-2">
                  <div className="border border-green-500 p-2 bg-green-500/5">
                    <div className="text-xs text-green-400 mb-1">VIDEO ANALYSIS</div>
                    <div className="flex justify-between text-sm">
                      <span>TOTAL THREATS:</span>
                      <span className="text-red-500 font-bold">
                        {videoDetectionResult.total_detections || 0}
                      </span>
                    </div>
                  </div>
                  <div className="border border-green-500 p-2 bg-green-500/5">
                    <div className="flex justify-between text-sm">
                      <span>FRAMES PROC:</span>
                      <span className="font-bold">{videoDetectionResult.frames_processed || 0}</span>
                    </div>
                  </div>
                  <div className="border border-green-500 p-2 bg-green-500/5">
                    <div className="flex justify-between text-sm">
                      <span>PROC TIME:</span>
                      <span className="font-bold">
                        {videoDetectionResult.processing_time
                          ? `${videoDetectionResult.processing_time.toFixed(2)}s`
                          : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {videoDetectionResult.detections_by_frame &&
                   Object.keys(videoDetectionResult.detections_by_frame).length > 0 && (
                    <div className="mt-3 border-t border-green-500 pt-3">
                      <div className="text-xs font-bold mb-2">FRAME DETECTIONS:</div>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {Object.entries(videoDetectionResult.detections_by_frame).map(
                          ([frameNum, frameDetections]: [string, any]) => (
                            <div key={frameNum} className="border-l-4 border-red-500 pl-2 bg-red-500/5 p-1">
                              <div className="text-xs font-bold text-red-400">
                                FRAME {frameNum}
                              </div>
                              {frameDetections.map((det: Detection, idx: number) => (
                                <div
                                  key={idx}
                                  className="text-xs flex justify-between mt-1"
                                >
                                  <span className="text-green-400">{det.class_name}</span>
                                  <span className="text-red-500 font-bold">
                                    {(det.confidence * 100).toFixed(1)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Live/Image Detection Results */}
              {detections.length > 0 && (
                <div>
                  <div className="border border-red-500 bg-red-500/10 p-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
                      <span className="font-bold text-red-500">THREAT DETECTED</span>
                    </div>
                    <div className="text-2xl font-bold text-red-500 mt-1">
                      {detections.length} OBJECT{detections.length !== 1 ? 'S' : ''}
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    {detections.map((det, idx) => (
                      <div
                        key={idx}
                        className="border-l-4 border-red-500 bg-red-500/5 p-2"
                      >
                        <div className="flex justify-between items-start mb-1">
                          <div>
                            <div className="font-bold text-red-400 text-sm">
                              {det.class_name}
                            </div>
                            <div className="text-xs text-green-400/70">
                              ID: {det.class_id}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-red-500">
                              {(det.confidence * 100).toFixed(1)}%
                            </div>
                          </div>
                        </div>
                        <div className="text-xs text-green-400/50 mt-1 font-mono">
                          POS: [{det.bbox.x1.toFixed(0)},{det.bbox.y1.toFixed(0)}]-[{det.bbox.x2.toFixed(0)},{det.bbox.y2.toFixed(0)}]
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Original Image Preview */}
                  {image && !isWebcamActive && (
                    <div className="border-t border-green-500 pt-3">
                      <div className="text-xs font-bold mb-2 text-green-400">ORIGINAL IMAGE:</div>
                      <div className="border border-green-500/50 p-1 bg-black/30">
                        <img
                          src={image}
                          alt="Original"
                          className="w-full h-auto"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* No Detections State */}
              {detections.length === 0 && !videoDetectionResult && (
                <div className="text-center text-green-400/50 py-8">
                  <div className="text-4xl mb-2">✓</div>
                  <div className="text-sm">NO THREATS DETECTED</div>
                  <div className="text-xs mt-2">AREA SECURE</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}