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
  const [selectedPreset, setSelectedPreset] = useState<'phone' | 'bottle' | 'pizza' | 'empty' | null>(null);
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

  // 3. Strict Manual Inspection API Call (Executed ONLY when clicking "Inspect Waste Item" or a Sample Preset)
  const inspectImageBase64 = useCallback(
    async (imageBase64: string, customBin?: string, presetKey?: string | null) => {
      if (isProcessing) return;
      setIsProcessing(true);

      const binToUse = customBin || targetBin;
      const activePreset = presetKey !== undefined ? presetKey : selectedPreset;
      const locationContext = activePreset
        ? `India - Municipal [preset:${activePreset}]`
        : 'India - Municipal';

      try {
        const res = await fetch(`${apiUrl}/api/inspect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: imageBase64,
            target_bin: binToUse,
            user_id: userId,
            ward_id: wardId,
            location_context: locationContext,
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
    [apiUrl, targetBin, userId, wardId, isProcessing, selectedPreset, onInspectionResult, drawOverlay]
  );

  // 4. Clean State Reset: When clicking "Scan Another Item"
  // Completely clear the previous result banner and show the live camera feed ready for the next snapshot
  const handleReset = useCallback(() => {
    setLastResult(null);
    setPreviewImage(null);
    setSelectedPreset(null);
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
      inspectImageBase64(previewImage, undefined, selectedPreset);
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
      inspectImageBase64(imageBase64, undefined, null);
    }
  }, [previewImage, isProcessing, selectedPreset, inspectImageBase64]);

  // Handle local image file upload (loads image frame for manual inspection)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setPreviewImage(b64);
      setSelectedPreset(null);
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

  // Sample test frame generator for instant verification of Phone, Bottle, Pizza, or Empty
  const handleSamplePreset = (preset: 'phone' | 'bottle' | 'pizza' | 'empty') => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, 1280, 720);

    if (preset === 'phone') {
      // Draw realistic Mobile Phone silhouette for E-Waste test
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 6;
      ctx.fillRect(490, 110, 300, 500);
      ctx.strokeRect(490, 110, 300, 500);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(510, 150, 260, 410);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('📱 MOBILE PHONE', 640, 340);
      ctx.font = '18px sans-serif';
      ctx.fillText('E-Waste / Lithium Battery Device', 640, 380);
    } else if (preset === 'bottle') {
      ctx.fillStyle = '#064e3b';
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 6;
      ctx.fillRect(520, 120, 240, 480);
      ctx.strokeRect(520, 120, 240, 480);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🧴 CLEAN PET BOTTLE', 640, 350);
      ctx.font = '18px sans-serif';
      ctx.fillText('Dry Recyclable Plastic (#1 PET)', 640, 390);
    } else if (preset === 'pizza') {
      ctx.fillStyle = '#78350f';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 6;
      ctx.fillRect(380, 160, 520, 400);
      ctx.strokeRect(380, 160, 520, 400);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🍕 GREASY PIZZA BOX', 640, 350);
      ctx.font = '18px sans-serif';
      ctx.fillText('Oil-Stained Cardboard (Contaminated)', 640, 390);
    } else {
      ctx.fillStyle = '#334155';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Empty Background (No Waste Item Present)', 640, 360);
    }

    const b64 = canvas.toDataURL('image/jpeg', 0.90);
    setPreviewImage(b64);
    setSelectedPreset(preset);
    setLastResult(null);
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width = 1280;
      overlayCanvasRef.current.height = 720;
      const octx = overlayCanvasRef.current.getContext('2d');
      octx?.clearRect(0, 0, 1280, 720);
    }
    // Immediately inspect the selected sample preset so clicking a sample test button returns its result right away
    inspectImageBase64(b64, undefined, preset);
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
      <div className="relative rounded-2xl overflow-hidden bg-[#070A0F] border border-slate-800/80 shadow-2xl shadow-black/60 aspect-[4/3] max-w-2xl mx-auto w-full transition-all group">
        {previewImage ? (
          <img
            src={previewImage}
            alt="Inspection Frame"
            className="w-full h-full object-contain bg-[#070A0F]"
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
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-20 pointer-events-none gap-2">
          <div className="flex items-center gap-2 bg-[#0B0F17]/85 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-800/80 text-xs text-white shadow-lg">
            <span
              className={`w-2 h-2 rounded-full ${
                isProcessing
                  ? 'bg-amber-400 animate-ping'
                  : previewImage
                  ? 'bg-cyan-400'
                  : 'bg-emerald-400'
              }`}
            />
            <span className="font-mono text-[11px] sm:text-xs">
              {isProcessing
                ? 'Auditing with Bedrock...'
                : previewImage
                ? 'Frame Loaded • Ready'
                : 'Live Camera • Active'}
            </span>
          </div>

          <div className="bg-[#0B0F17]/85 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-800/80 text-xs text-slate-300 font-mono shadow-lg">
            Target: <strong className="text-emerald-400 font-bold">{targetBin}</strong>
          </div>
        </div>

        {/* Error Notification if camera unavailable and no preview */}
        {cameraError && !previewImage && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#070A0F]/95 text-slate-200 p-6 text-center z-30">
            <span className="text-4xl mb-2">📷</span>
            <p className="font-semibold text-rose-300 mb-2 text-sm">{cameraError}</p>
            <p className="text-xs text-slate-400 mb-4">Click below to upload a photo or load a test frame:</p>
            <div className="flex gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg transition-all cursor-pointer"
              >
                📁 Upload Photo
              </button>
              <button
                onClick={() => handleSamplePreset('phone')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-xl text-xs font-bold border border-cyan-500/40 transition-all cursor-pointer"
              >
                📱 Test Mobile Phone
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Controller Buttons Bar */}
      <div className="glass-panel rounded-2xl p-4 sm:p-5 flex flex-col gap-3.5 max-w-2xl mx-auto w-full border border-slate-200/80 dark:border-slate-800/70 shadow-xl transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <label className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider shrink-0 font-mono">
              Target Bin:
            </label>
            <select
              value={targetBin}
              onChange={(e) => setTargetBin(e.target.value)}
              className="bg-slate-100 dark:bg-slate-900/90 border border-slate-300 dark:border-slate-700/80 text-xs sm:text-sm text-slate-900 dark:text-white rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 w-full sm:w-auto font-medium transition-all"
            >
              <option value="Auto-Detect">Auto-Detect Stream</option>
              <option value="Dry Recyclable">Blue Bin (Dry Recyclable)</option>
              <option value="Wet Organic">Green Bin (Wet Organic)</option>
            </select>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {previewImage && isStreaming && (
              <button
                onClick={handleReset}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-200 dark:bg-slate-800 text-cyan-700 dark:text-cyan-300 hover:bg-slate-300 dark:hover:bg-slate-700 border border-cyan-500/30 flex-1 sm:flex-initial cursor-pointer hover:-translate-y-0.5 active:scale-95 transition-all shadow-sm"
              >
                📹 Live Camera
              </button>
            )}

            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 transition-all flex items-center justify-center gap-1.5 flex-1 sm:flex-initial cursor-pointer hover:-translate-y-0.5 active:scale-95 shadow-sm"
            >
              <span>📁</span>
              <span>Upload Photo</span>
            </button>

            {/* Primary Action Button: Inspect Waste Item */}
            <button
              onClick={captureAndInspect}
              disabled={isProcessing}
              id="inspect-waste-btn"
              className="px-5 sm:px-6 py-2 rounded-xl text-xs sm:text-sm font-black bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/35 hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer flex-1 sm:flex-initial"
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

        {/* Quick Test Presets Row */}
        <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-mono">
            Quick Test Presets:
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => handleSamplePreset('phone')}
              className="text-[11px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-slate-300 dark:border-cyan-500/30 hover:border-cyan-500/50 font-medium hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer shadow-sm"
            >
              📱 Mobile Phone (E-Waste)
            </button>
            <button
              onClick={() => handleSamplePreset('bottle')}
              className="text-[11px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-slate-300 dark:border-emerald-500/30 hover:border-emerald-500/50 font-medium hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer shadow-sm"
            >
              🧴 PET Bottle (Clean)
            </button>
            <button
              onClick={() => handleSamplePreset('pizza')}
              className="text-[11px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-slate-300 dark:border-amber-500/30 hover:border-amber-500/50 font-medium hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer shadow-sm"
            >
              🍕 Greasy Pizza Box
            </button>
            <button
              onClick={() => handleSamplePreset('empty')}
              className="text-[11px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 font-medium hover:-translate-y-0.5 active:scale-95 transition-all cursor-pointer shadow-sm"
            >
              ⚪ Empty Frame
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
