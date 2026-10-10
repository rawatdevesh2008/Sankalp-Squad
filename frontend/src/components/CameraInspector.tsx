import React, { useRef, useEffect, useState, useCallback } from 'react';
import { InspectionResponse } from '../types';
import { InspectionResult } from './InspectionResult';

interface CameraInspectorProps {
  apiUrl: string;
  onInspectionResult: (result: InspectionResponse) => void;
  userId: string;
  wardId: string;
  externalResult?: InspectionResponse | null;
  onFrameCaptureReady?: (getFrameFn: () => string | null) => void;
}

export const CameraInspector: React.FC<CameraInspectorProps> = ({
  apiUrl,
  onInspectionResult,
  userId,
  wardId,
  externalResult,
  onFrameCaptureReady,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isStreaming, setIsStreaming] = useState(false);
  const [targetBin, setTargetBin] = useState('Auto-Detect');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<InspectionResponse | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. Initialize Webcam at High Resolution (at least 640x480, ideal 1280x720)
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 },
            facingMode: 'environment',
          },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setIsStreaming(true);
          setCameraError(null);
        }
      } catch (err: any) {
        console.error('Camera access error:', err);
        setCameraError(
          'Webcam unavailable or permission denied. You can test manually using Upload Photo or Sample Presets below.'
        );
      }
    }

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Update overlay canvas size when video dimensions are known
  const handleVideoMetadataLoaded = () => {
    if (videoRef.current && overlayCanvasRef.current) {
      overlayCanvasRef.current.width = videoRef.current.videoWidth || 640;
      overlayCanvasRef.current.height = videoRef.current.videoHeight || 480;
    }
  };

  // 2. Draw Green / Red Bounding Box on Overlay Canvas
  const drawOverlay = useCallback((result: InspectionResponse) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // If No Object is detected, do not draw bounding box overlay
    const isNoObject =
      !result.item_detected ||
      result.item_detected === 'None' ||
      result.correct_bin === 'Waiting for Item...' ||
      result.category === 'N/A';

    if (isNoObject) {
      return;
    }

    const { ymin, xmin, ymax, xmax } = result.bounding_box || { ymin: 0, xmin: 0, ymax: 0, xmax: 0 };
    if (ymin === 0 && xmin === 0 && ymax === 0 && xmax === 0) {
      return;
    }

    const x = (xmin / 1000) * canvas.width;
    const y = (ymin / 1000) * canvas.height;
    const width = ((xmax - xmin) / 1000) * canvas.width;
    const height = ((ymax - ymin) / 1000) * canvas.height;

    const isGreen = result.box_color === 'green';
    const strokeColor = isGreen ? '#22c55e' : '#ef4444';
    const fillColor = isGreen ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)';

    // Bounding Box
    ctx.lineWidth = 4;
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    if (typeof (ctx as any).roundRect === 'function') {
      (ctx as any).roundRect(x, y, width, height, 8);
    } else {
      ctx.rect(x, y, width, height);
    }
    ctx.fill();
    ctx.stroke();

    // Badge Label Header
    const labelText = `${result.item_detected} • ${isGreen ? 'CLEAN (PASS)' : 'CONTAMINATED / HAZARD'}`;
    const fontSize = Math.max(12, Math.round(canvas.width * 0.022));
    ctx.font = `bold ${fontSize}px sans-serif`;
    const textWidth = ctx.measureText(labelText).width;
    const badgeHeight = fontSize + 12;

    ctx.fillStyle = strokeColor;
    ctx.fillRect(x, Math.max(0, y - badgeHeight - 2), textWidth + 16, badgeHeight);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(labelText, x + 8, Math.max(fontSize + 4, y - 8));
  }, []);

  // Synchronize external inspection results (e.g. from ShieldBin AI Copilot)
  useEffect(() => {
    if (externalResult) {
      setLastResult(externalResult);
      drawOverlay(externalResult);
    }
  }, [externalResult, drawOverlay]);

  // Frame capture function exposed to external components like AiChatBox
  const getCurrentFrame = useCallback((): string | null => {
    if (previewImage) {
      return previewImage;
    }
    if (videoRef.current && canvasRef.current && videoRef.current.videoWidth > 0) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const captureWidth = Math.max(video.videoWidth || 640, 640);
      const captureHeight = Math.max(video.videoHeight || 480, 480);
      canvas.width = captureWidth;
      canvas.height = captureHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(video, 0, 0, captureWidth, captureHeight);
        return canvas.toDataURL('image/jpeg', 0.90);
      }
    }
    return null;
  }, [previewImage]);

  useEffect(() => {
    if (onFrameCaptureReady) {
      onFrameCaptureReady(getCurrentFrame);
    }
  }, [onFrameCaptureReady, getCurrentFrame]);

  // 3. Strict Manual Inspection API Call (Executed ONLY when clicking "Inspect Waste Item")
  const inspectImageBase64 = useCallback(
    async (imageBase64: string, customBin?: string) => {
      if (isProcessing) return;
      setIsProcessing(true);

      const binToUse = customBin || targetBin;

      try {
        const res = await fetch(`${apiUrl}/api/inspect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: imageBase64,
            target_bin: binToUse,
            user_id: userId,
            ward_id: wardId,
            location_context: 'India - Municipal',
          }),
        });

        if (res.ok) {
          const data: InspectionResponse = await res.json();
          setLastResult(data);
          onInspectionResult(data);
          drawOverlay(data);
        } else {
          console.error('Inspection API returned status:', res.status);
        }
      } catch (err) {
        console.error('Failed to inspect frame:', err);
      } finally {
        setIsProcessing(false);
      }
    },
    [apiUrl, targetBin, userId, wardId, isProcessing, onInspectionResult, drawOverlay]
  );

  // 4. Clean State Reset: When clicking "Scan Another Item"
  // Completely clear the previous result banner and show the live camera feed ready for the next snapshot
  const handleReset = useCallback(() => {
    setLastResult(null);
    setPreviewImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    const canvas = overlayCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    if (videoRef.current && videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    }
  }, []);

  // 5. High-Resolution Canvas Capture & Manual Trigger
  const captureAndInspect = useCallback(async () => {
    if (isProcessing) return;

    // If an image was uploaded or chosen via preset, inspect that frame
    if (previewImage) {
      inspectImageBase64(previewImage);
      return;
    }

    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    // High-Resolution Capture: use actual video dimensions (at least 640x480)
    const captureWidth = Math.max(video.videoWidth || 640, 640);
    const captureHeight = Math.max(video.videoHeight || 480, 480);

    canvas.width = captureWidth;
    canvas.height = captureHeight;

    // Synchronize overlay canvas dimensions as well
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width = captureWidth;
      overlayCanvasRef.current.height = captureHeight;
    }

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(video, 0, 0, captureWidth, captureHeight);

      // High-resolution JPEG (quality 0.90) so Bedrock receives sharp visual markers
      const imageBase64 = canvas.toDataURL('image/jpeg', 0.90);
      inspectImageBase64(imageBase64);
    }
  }, [previewImage, isProcessing, inspectImageBase64]);

  // Handle local image file upload (loads image frame for manual inspection)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setPreviewImage(b64);
      setLastResult(null); // Clear previous result banner
      const canvas = overlayCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Hidden File Input for Image Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Viewport Frame */}
      <div className="relative rounded-2xl overflow-hidden bg-slate-900 dark:bg-slate-950 border-2 border-slate-700/60 dark:border-slate-800 shadow-2xl aspect-[4/3] max-w-2xl mx-auto w-full transition-all">
        {previewImage ? (
          <img
            src={previewImage}
            alt="Inspection Frame"
            className="w-full h-full object-contain bg-slate-950"
          />
        ) : (
          <video
            ref={videoRef}
            onLoadedMetadata={handleVideoMetadataLoaded}
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}

        {/* Bounding Box Overlay Canvas */}
        <canvas
          ref={overlayCanvasRef}
          width={640}
          height={480}
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
        />

        {/* Hidden high-res capture canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Status Bar Overlay */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-20 pointer-events-none">
          <div className="flex items-center gap-2 bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/60 text-xs text-white">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isProcessing
                  ? 'bg-amber-400 animate-ping'
                  : previewImage
                  ? 'bg-cyan-400'
                  : 'bg-emerald-400'
              }`}
            />
            <span>
              {isProcessing
                ? 'Auditing with Bedrock...'
                : previewImage
                ? 'Frame Loaded • Ready to Inspect'
                : 'Live Camera • Manual Snap Ready'}
            </span>
          </div>

          <div className="bg-slate-950/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-700/60 text-xs text-slate-300">
            Target Bin: <strong className="text-white">{targetBin}</strong>
          </div>
        </div>

        {/* Error Notification if camera unavailable and no preview */}
        {cameraError && !previewImage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 text-slate-200 p-6 text-center z-30">
            <span className="text-4xl mb-2">📷</span>
            <p className="font-semibold text-rose-300 mb-2">{cameraError}</p>
            <p className="text-xs text-slate-400 mb-4">Click below to upload a photo for inspection:</p>
            <div className="flex gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold shadow-lg transition-all cursor-pointer"
              >
                📁 Upload Photo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Controller Buttons: Strict Manual Trigger Bar */}
      <div className="glass-panel rounded-xl p-3 sm:p-4 flex flex-col gap-3 max-w-2xl mx-auto w-full border border-slate-200 dark:border-slate-800 transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold shrink-0">
              Target Bin:
            </label>
            <select
              value={targetBin}
              onChange={(e) => setTargetBin(e.target.value)}
              className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white rounded-lg px-2.5 sm:px-3 py-1.5 focus:outline-none focus:border-emerald-500 w-full sm:w-auto font-medium"
            >
              <option value="Auto-Detect">Auto-Detect Stream</option>
              <option value="Dry Recyclable">Blue Bin (Dry Recyclable)</option>
              <option value="Wet Organic">Green Bin (Wet Organic)</option>
            </select>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {previewImage && isStreaming && (
              <button
                onClick={handleReset}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-800 text-cyan-700 dark:text-cyan-300 hover:bg-slate-300 dark:hover:bg-slate-700 border border-cyan-500/30 flex-1 sm:flex-initial cursor-pointer transition-all"
              >
                📹 Live Camera
              </button>
            )}

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 transition-all flex items-center justify-center gap-1.5 flex-1 sm:flex-initial cursor-pointer"
            >
              <span>📁</span>
              <span>Upload Photo</span>
            </button>

            {/* Primary Action Button: Inspect Waste Item */}
            <button
              onClick={captureAndInspect}
              disabled={isProcessing}
              id="inspect-waste-btn"
              className="px-4 sm:px-6 py-2 rounded-xl text-xs sm:text-sm font-black bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/25 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer flex-1 sm:flex-initial"
            >
              {isProcessing ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Auditing with Bedrock...</span>
                </>
              ) : (
                <>
                  <span>📸</span>
                  <span>Inspect Waste Item</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Real-time Advice & Remediation Card (Dedicated InspectionResult Component) */}
      <InspectionResult
        result={lastResult}
        onReset={handleReset}
        isScanning={isProcessing}
      />
    </div>
  );
};

export default CameraInspector;
