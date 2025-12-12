
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { objectDetectionService } from '../services/objectDetectionService';
import { ModelStatus, CachedFrame, SegmentedClass } from '../types';

interface VideoProcessorProps {
  videoSrc: string;
  modelStatus: ModelStatus;
}

const VideoProcessor: React.FC<VideoProcessorProps> = ({ videoSrc, modelStatus }) => {
  const visibleVideoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const segInputCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // Reusable helper canvas for mask manipulation
  const maskHelperCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'analyzing' | 'complete'>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [activeClasses, setActiveClasses] = useState<string[]>([]);
  
  const cacheRef = useRef<CachedFrame[]>([]);
  const requestRef = useRef<number | undefined>(undefined);
  const analysisTriggeredRef = useRef<boolean>(false);
  
  // Configuration
  const CROP_PERCENT = 0.20; 
  // SegFormer B0/B1 trained on 1024x1024. 
  const SEG_INPUT_SIZE = 640; 
  // Revert frequency: 0.2s
  const ANALYSIS_INTERVAL = 0.2; 
  const MAX_DEMO_DURATION = 15; // Limit demo to 15s

  // Reset state when video source changes
  useEffect(() => {
    setAnalysisStatus('idle');
    setProgress(0);
    setActiveClasses([]);
    cacheRef.current = [];
    setIsPlaying(false);
    analysisTriggeredRef.current = false;
    
    if (visibleVideoRef.current) visibleVideoRef.current.currentTime = 0;
    
    const clearCanvas = (ref: React.RefObject<HTMLCanvasElement>) => {
        if (ref.current) {
            const ctx = ref.current.getContext('2d');
            ctx?.clearRect(0, 0, ref.current.width, ref.current.height);
        }
    };
    clearCanvas(overlayCanvasRef);
    
    if (!maskHelperCanvasRef.current) {
        maskHelperCanvasRef.current = document.createElement('canvas');
        maskHelperCanvasRef.current.width = SEG_INPUT_SIZE;
        maskHelperCanvasRef.current.height = SEG_INPUT_SIZE;
    }
  }, [videoSrc]);

  // Auto-Start Analysis when video metadata is loaded and model is ready
  const handleVideoLoaded = () => {
    if (modelStatus.status === 'ready' && !analysisTriggeredRef.current && analysisStatus === 'idle') {
        analysisTriggeredRef.current = true;
        startAnalysis();
    }
  };

  // Re-trigger if model becomes ready after video loaded
  useEffect(() => {
    if (modelStatus.status === 'ready' && visibleVideoRef.current && visibleVideoRef.current.readyState >= 1 && !analysisTriggeredRef.current && analysisStatus === 'idle') {
         analysisTriggeredRef.current = true;
         startAnalysis();
    }
  }, [modelStatus.status]);


  // --- Render Functions ---

  const drawMaskToContext = (
      mask: any, 
      color: number[], 
      targetCtx: CanvasRenderingContext2D,
      targetX: number, targetY: number, targetW: number, targetH: number
  ) => {
      if (!mask || !maskHelperCanvasRef.current) return;
      const helper = maskHelperCanvasRef.current;
      
      // Update helper size if needed
      if (helper.width !== mask.width || helper.height !== mask.height) {
          helper.width = mask.width;
          helper.height = mask.height;
      }
      const hCtx = helper.getContext('2d');
      if (!hCtx) return;

      const imgData = hCtx.createImageData(mask.width, mask.height);
      const data = imgData.data;
      const maskData = mask.data;
      const [r, g, b, a] = color;
      
      // Optimization: Loop through mask data
      for (let i = 0; i < maskData.length; i++) {
          // Typically 0 or 255 for binary mask from pipeline
          if (maskData[i] > 0) {
            const offset = i * 4;
            data[offset] = r;
            data[offset+1] = g;
            data[offset+2] = b;
            data[offset+3] = a; 
          }
      }
      hCtx.putImageData(imgData, 0, 0);

      targetCtx.imageSmoothingEnabled = false; // Pixelated look
      targetCtx.drawImage(helper, 0, 0, mask.width, mask.height, targetX, targetY, targetW, targetH);
      targetCtx.imageSmoothingEnabled = true;
  }

  const renderSegmentationOverlay = (
    results: SegmentedClass[], 
    overlayCanvas: HTMLCanvasElement, 
    videoElement: HTMLVideoElement,
    cropPercent: number
  ) => {
    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return;
    const containerW = videoElement.clientWidth;
    const containerH = videoElement.clientHeight;
    
    // Resize overlay if needed
    if (overlayCanvas.width !== containerW || overlayCanvas.height !== containerH) {
        overlayCanvas.width = containerW;
        overlayCanvas.height = containerH;
    }
    ctx.clearRect(0, 0, containerW, containerH);

    const videoW = videoElement.videoWidth;
    const videoH = videoElement.videoHeight;
    if (!videoW || !videoH) return;

    // Calculate display area (letterboxing)
    const videoRatio = videoW / videoH;
    const containerRatio = containerW / containerH;
    let displayedW, displayedH, offsetX, offsetY;
    if (containerRatio > videoRatio) {
        displayedH = containerH;
        displayedW = containerH * videoRatio;
        offsetX = (containerW - displayedW) / 2;
        offsetY = 0;
    } else {
        displayedW = containerW;
        displayedH = containerW / videoRatio;
        offsetX = 0;
        offsetY = (containerH - displayedH) / 2;
    }

    // Adjust for crop
    const cropY = Math.floor(videoH * cropPercent);
    
    // We only want to draw on the cropped area
    const displayedCropHeight = displayedH * (1 - cropPercent);
    const displayedCropTopY = offsetY + (displayedH * cropPercent);

    const foundClasses: Set<string> = new Set();

    results.forEach(item => {
        const label = item.label.toLowerCase();
        let color: number[] | null = null;

        // Color Mapping
        if (label === 'traffic light' || label === 'traffic_light') {
            color = [255, 230, 0, 200]; // Bright Yellow for Traffic Light
            foundClasses.add('TRAFFIC LIGHT');
        } else if (['car', 'truck', 'bus', 'motorcycle', 'bicycle'].includes(label)) {
            color = [0, 255, 100, 160]; // Green for vehicles
            foundClasses.add('VEHICLE');
        } 
        // Pedestrian visualization removed as requested

        if (color) {
            drawMaskToContext(item.mask, color, ctx, offsetX, displayedCropTopY, displayedW, displayedCropHeight);
        }
    });

    // Update active classes for UI
    setActiveClasses(Array.from(foundClasses));
  };

  // --- ANALYSIS LOGIC ---
  const startAnalysis = async () => {
    const video = visibleVideoRef.current;
    if (!video || !video.duration) return;
    
    setAnalysisStatus('analyzing');
    setIsPlaying(false);
    video.pause();
    cacheRef.current = [];
    const effectiveDuration = Math.min(video.duration, MAX_DEMO_DURATION);
    let currentTime = 0;
    const steps = Math.ceil(effectiveDuration / ANALYSIS_INTERVAL) + 1;
    
    if (!segInputCanvasRef.current) segInputCanvasRef.current = document.createElement('canvas');

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cropY = Math.floor(vh * CROP_PERCENT);
    const cropHeight = vh - cropY;
    
    // Segmentation setup
    const segHeight = Math.floor(SEG_INPUT_SIZE * (cropHeight / vw));
    segInputCanvasRef.current.width = SEG_INPUT_SIZE;
    segInputCanvasRef.current.height = segHeight;

    let frameCount = 0;
    video.currentTime = 0;
    
    await new Promise<void>((resolve) => {
        const onSeeked = () => resolve();
        // Check if already at 0
        if (video.currentTime === 0 && video.readyState >= 2) resolve();
        else video.addEventListener('seeked', onSeeked, { once: true });
    });

    while (currentTime <= effectiveDuration + 0.1) {
        const nextTime = currentTime + ANALYSIS_INTERVAL;
        
        const segCtx = segInputCanvasRef.current.getContext('2d', { willReadFrequently: true });
        segCtx?.drawImage(video, 0, cropY, vw, cropHeight, 0, 0, SEG_INPUT_SIZE, segHeight);

        let seekPromise = Promise.resolve();
        if (nextTime <= effectiveDuration + 0.1) {
             video.currentTime = nextTime;
             seekPromise = new Promise<void>((resolve) => {
                video.addEventListener('seeked', () => resolve(), { once: true });
            });
        }

        try {
            const segRes = await objectDetectionService.predict(segInputCanvasRef.current);
            cacheRef.current.push({ timestamp: currentTime, odResult: segRes });
        } catch (e) { console.error("Analysis failed", e); }

        await seekPromise;
        frameCount++;
        setProgress(Math.min(100, Math.round((frameCount / steps) * 100)));
        currentTime = nextTime;
        // Small yield to UI to prevent freeze
        await new Promise(r => setTimeout(r, 0));
    }
    
    setAnalysisStatus('complete');
    video.currentTime = 0;
    // Auto-play after analysis
    togglePlay();
  };

  const playbackLoop = useCallback(() => {
    const video = visibleVideoRef.current;
    if (!video || video.paused || video.ended) {
        setIsPlaying(false);
        return;
    }
    const currentTime = video.currentTime;
    if (currentTime >= MAX_DEMO_DURATION) {
        video.currentTime = 0;
        requestRef.current = requestAnimationFrame(playbackLoop);
        return;
    }
    const cache = cacheRef.current;
    
    // Find nearest frame
    let closestFrame = cache[0];
    let minDiff = Infinity;

    for (const frame of cache) {
        const diff = Math.abs(frame.timestamp - currentTime);
        if (diff < minDiff) {
            minDiff = diff;
            closestFrame = frame;
        }
    }
    
    if (closestFrame && closestFrame.odResult) {
        if (overlayCanvasRef.current) renderSegmentationOverlay(closestFrame.odResult, overlayCanvasRef.current, video, CROP_PERCENT);
    }

    requestRef.current = requestAnimationFrame(playbackLoop);
  }, []);

  const togglePlay = () => {
    const video = visibleVideoRef.current;
    if (!video) return;
    if (isPlaying) {
        video.pause();
        setIsPlaying(false);
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    } else {
        video.play().then(() => { setIsPlaying(true); playbackLoop(); }).catch(e => console.error(e));
    }
  };

  useEffect(() => {
    if (isPlaying) requestRef.current = requestAnimationFrame(playbackLoop);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [isPlaying, playbackLoop]);

  return (
    <div className="w-full h-full flex flex-col items-center gap-6">
       
       {/* --- MAIN DISPLAY --- */}
       <div className="w-full max-w-5xl relative group flex flex-col bg-slate-900/40 backdrop-blur-md border border-cyan-500/30 p-1 shadow-[0_0_20px_rgba(6,182,212,0.1)]">
           {/* FUI Corner Brackets */}
           <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-500"></div>
           <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-500"></div>
           <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-500"></div>
           <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-500"></div>
           
           {/* Panel Header */}
           <div className="flex justify-between items-center px-4 py-2 bg-cyan-950/30 border-b border-cyan-900/50 mb-1">
             <h3 className="text-cyan-400 text-sm tracking-widest font-bold uppercase flex items-center gap-2">
               <div className="w-2 h-2 bg-cyan-400 animate-pulse"></div>
               SEMANTIC SEGMENTATION LIVE FEED
             </h3>
             <span className="text-cyan-700 text-xs font-mono">SegFormer B1 // CITYSCAPES</span>
           </div>

           <div className="relative w-full aspect-video bg-black overflow-hidden border border-slate-800">
                <video
                    ref={visibleVideoRef}
                    src={videoSrc}
                    onLoadedData={handleVideoLoaded}
                    className={`absolute top-0 left-0 w-full h-full object-contain z-0 transition-opacity duration-500 ${analysisStatus === 'analyzing' ? 'opacity-30 grayscale blur-sm' : ''}`}
                    playsInline
                    muted
                    loop={false} 
                    crossOrigin="anonymous"
                />
                <canvas ref={overlayCanvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none z-10" />
                
                {/* Active Classes Legend */}
                <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-30 pointer-events-none">
                     {/* TRAFFIC LIGHT */}
                     <div className="flex items-center gap-2 bg-black/60 px-3 py-1 border-l-2 border-yellow-500 backdrop-blur-sm">
                        <span className="w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_8px_#eab308]"></span>
                        <span className={`text-[10px] font-bold tracking-wider ${activeClasses.includes('TRAFFIC LIGHT') ? 'text-yellow-400' : 'text-slate-600'}`}>TRAFFIC LIGHT</span>
                     </div>
                     {/* VEHICLE */}
                     <div className="flex items-center gap-2 bg-black/60 px-3 py-1 border-l-2 border-green-500 backdrop-blur-sm">
                        <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]"></span>
                        <span className={`text-[10px] font-bold tracking-wider ${activeClasses.includes('VEHICLE') ? 'text-green-400' : 'text-slate-600'}`}>VEHICLE</span>
                     </div>
                </div>

                {/* Scanline Overlay (Visual) */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)50%,rgba(0,0,0,0.25)50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] pointer-events-none z-20 opacity-20"></div>
           </div>
           
           {/* Analysis Progress Overlay */}
           {analysisStatus === 'analyzing' && (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-50 backdrop-blur-sm">
                <div className="text-cyan-400 font-bold tracking-widest text-2xl animate-pulse mb-6">ANALYSIS SEQUENCE</div>
                <div className="w-96 h-2 bg-cyan-900/50 relative overflow-hidden rounded-full">
                    <div className="absolute inset-0 bg-cyan-400 blur-[2px] transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
                </div>
                <div className="flex justify-between w-96 mt-2 text-xs text-cyan-600 font-mono">
                    <span>PROCESSING_FRAMES</span>
                    <span>{progress}%</span>
                </div>
             </div>
           )}
       </div>
       
       {/* --- CONTROL DECK --- */}
       <div className="w-full max-w-5xl border-t border-cyan-900/30 pt-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
             <button
                onClick={togglePlay}
                disabled={analysisStatus !== 'complete'}
                className={`group relative px-10 py-4 border font-bold uppercase tracking-widest text-sm transition-all duration-300 overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed ${
                    isPlaying 
                    ? 'bg-amber-950 border-amber-600 text-amber-400 hover:bg-amber-600 hover:text-black' 
                    : 'bg-green-950 border-green-600 text-green-400 hover:bg-green-600 hover:text-black'
                }`}
             >
                <span className="relative z-10">{isPlaying ? 'HALT SIMULATION' : 'ENGAGE PLAYBACK'}</span>
                <div className={`absolute inset-0 translate-y-full group-hover:translate-y-0 transition-transform duration-200 ease-out z-0 ${isPlaying ? 'bg-amber-600' : 'bg-green-600'}`}></div>
             </button>
             
             <div className="text-xs text-cyan-800 font-mono flex flex-col">
                 <span>{analysisStatus === 'idle' && "WAITING FOR SOURCE..."}</span>
                 <span>{analysisStatus === 'analyzing' && "NEURAL NETWORK ACTIVE..."}</span>
                 <span>{analysisStatus === 'complete' && "DATA CACHED. READY."}</span>
                 <span className="text-cyan-600 mt-1">LOOP_DURATION: {MAX_DEMO_DURATION}S</span>
             </div>
          </div>

          {/* Timeline Decoration */}
          <div className="flex-1 max-w-md hidden md:flex items-center gap-1 opacity-50 ml-12">
             {[...Array(24)].map((_, i) => (
                 <div key={i} className={`h-1.5 w-full rounded-sm skew-x-12 ${i < (progress/4.16) ? 'bg-cyan-500 shadow-[0_0_5px_rgba(6,182,212,0.8)]' : 'bg-cyan-900/30'}`}></div>
             ))}
          </div>
       </div>
    </div>
  );
};

export default VideoProcessor;
