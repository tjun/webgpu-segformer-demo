
import React, { useState, useEffect } from 'react';
import VideoProcessor from './components/VideoProcessor';
import { objectDetectionService } from './services/objectDetectionService';
import { ModelStatus } from './types';

function App() {
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus>({ status: 'idle' });
  const [showSampleMenu, setShowSampleMenu] = useState<boolean>(false);

  // Load Models on Mount
  useEffect(() => {
    const initModels = async () => {
      try {
        setModelStatus({ status: 'loading', progress: 0 });
        // Only load segmentation model
        await objectDetectionService.loadModel((progress) => {
            setModelStatus({ status: 'loading', progress });
        });
        setModelStatus({ status: 'ready' });
      } catch (error) {
        console.error("Failed to load models", error);
        setModelStatus({ status: 'error', message: 'Initialization Failed.' });
      }
    };
    initModels();
  }, []);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      setShowSampleMenu(false);
    }
  };

  const loadSample = (path: string) => {
      setVideoSrc(path);
      setShowSampleMenu(false);
  };

  return (
    <div className="min-h-screen flex flex-col text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* --- FUI HEADER --- */}
      <header className="w-full border-b border-cyan-900/50 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          
          {/* Logo Area */}
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-cyan-500/10 border border-cyan-400 flex items-center justify-center animate-pulse">
                <div className="w-3 h-3 bg-cyan-400 rotate-45"></div>
             </div>
             <div>
                <h1 className="text-xl font-bold tracking-widest text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">
                  DEEPDRIVE<span className="text-slate-100">VISION</span>
                </h1>
                <p className="text-[10px] text-cyan-600/80 tracking-[0.2em] uppercase">Autonomous Sensory System v2.1</p>
             </div>
          </div>

          {/* System Status Indicators (Decorative) */}
          <div className="hidden md:flex items-center gap-8 text-[10px] font-bold text-cyan-700 tracking-wider">
             <div className="flex flex-col items-end">
                <span className="text-cyan-500">SYSTEM STATUS</span>
                <span className="text-green-400 animate-pulse">ONLINE</span>
             </div>
             <div className="flex flex-col items-end">
                <span className="text-cyan-500">GPU LOAD</span>
                <span className="text-slate-300">{Math.floor(Math.random() * 20 + 70)}%</span>
             </div>
          </div>

          {/* Model Status Badge */}
          <div className="flex items-center gap-3">
             <div className={`flex items-center gap-2 text-xs px-3 py-1 border ${
                modelStatus.status === 'ready' ? 'border-green-500/30 bg-green-500/5 text-green-400' :
                modelStatus.status === 'error' ? 'border-red-500/30 bg-red-500/5 text-red-400' :
                'border-cyan-500/30 bg-cyan-500/5 text-cyan-400'
             }`}>
                <span className={`w-1.5 h-1.5 ${
                    modelStatus.status === 'ready' ? 'bg-green-400 animate-pulse' : 
                    modelStatus.status === 'error' ? 'bg-red-400' : 'bg-cyan-400 animate-bounce'
                }`}></span>
                {modelStatus.status === 'ready' ? 'SEGMENTATION MODULE READY' : modelStatus.status === 'loading' ? `LOADING ${Math.round(modelStatus.progress || 0)}%` : modelStatus.status.toUpperCase()}
             </div>
          </div>
        </div>
      </header>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-6 flex flex-col">
        {videoSrc ? (
          <VideoProcessor videoSrc={videoSrc} modelStatus={modelStatus} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center relative">
             {/* Decorative Background Elements */}
             <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                <div className="w-[500px] h-[500px] border border-cyan-500/20 rounded-full flex items-center justify-center">
                    <div className="w-[400px] h-[400px] border border-cyan-500/20 rounded-full border-dashed animate-[spin_60s_linear_infinite]"></div>
                </div>
             </div>

             {/* Upload Card */}
             <div className="relative z-10 w-full max-w-2xl">
                 {/* Corner Brackets */}
                 <div className="absolute -top-2 -left-2 w-6 h-6 border-t-2 border-l-2 border-cyan-500"></div>
                 <div className="absolute -top-2 -right-2 w-6 h-6 border-t-2 border-r-2 border-cyan-500"></div>
                 <div className="absolute -bottom-2 -left-2 w-6 h-6 border-b-2 border-l-2 border-cyan-500"></div>
                 <div className="absolute -bottom-2 -right-2 w-6 h-6 border-b-2 border-r-2 border-cyan-500"></div>

                 <div className="bg-slate-900/80 backdrop-blur-sm border border-cyan-900/50 p-12 flex flex-col items-center text-center">
                    <div className="w-20 h-20 mb-6 relative">
                        <div className="absolute inset-0 bg-cyan-500/20 animate-ping rounded-full"></div>
                        <div className="relative z-10 w-full h-full bg-slate-950 border border-cyan-400 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                        </div>
                    </div>
                    
                    <h2 className="text-2xl font-bold text-slate-100 tracking-wider mb-2">INITIATE SEQUENCE</h2>
                    <p className="text-cyan-600/70 text-sm max-w-md mb-8">
                        Upload dashcam footage to activate automatic semantic analysis. <br/>
                        System requires MP4/WebM input for WebGPU processing.
                    </p>

                    <div className="flex flex-col gap-4 w-full max-w-xs">
                        {/* File Upload Button */}
                        <label className="group relative cursor-pointer px-8 py-4 bg-cyan-950/30 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500 hover:text-slate-950 transition-all duration-300 font-bold tracking-widest uppercase overflow-hidden text-center">
                            <span className="relative z-10">Select Source File</span>
                            <div className="absolute inset-0 bg-cyan-400 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out z-0"></div>
                            <input type="file" accept="video/*" onChange={handleFileUpload} className="hidden" />
                        </label>

                        {/* Sample Data Button */}
                        <div className="relative">
                            <button 
                                onClick={() => setShowSampleMenu(!showSampleMenu)}
                                className="w-full px-8 py-3 bg-slate-950 border border-slate-700 text-slate-400 hover:border-amber-500/50 hover:text-amber-500 transition-all duration-300 font-mono text-xs tracking-widest uppercase"
                            >
                                {showSampleMenu ? 'CANCEL SELECTION' : 'INITIATE SIMULATION (SAMPLE)'}
                            </button>

                            {/* Sample Selection Menu (Slide down) */}
                            {showSampleMenu && (
                                <div className="absolute top-full left-0 w-full mt-2 bg-slate-900 border border-amber-900/50 flex flex-col z-20 shadow-xl">
                                    <button 
                                        onClick={() => loadSample('./demo1.mp4')}
                                        className="px-4 py-3 text-left text-xs font-mono text-amber-500/80 hover:bg-amber-900/20 hover:text-amber-400 border-b border-amber-900/30 transition-colors"
                                    >
                                        ▷ SEQUENCE_01 [CITY]
                                    </button>
                                    <button 
                                        onClick={() => loadSample('./demo2.mp4')}
                                        className="px-4 py-3 text-left text-xs font-mono text-amber-500/80 hover:bg-amber-900/20 hover:text-amber-400 transition-colors"
                                    >
                                        ▷ SEQUENCE_02 [HIGHWAY]
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                 </div>
             </div>
          </div>
        )}
      </main>

      <footer className="w-full border-t border-cyan-900/30 bg-slate-950 py-4">
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center text-[10px] text-cyan-800 uppercase tracking-widest">
            <div>DeepDrive Vision © 2025</div>
            <div>Powered by Transformers.js // WebGPU // Xenova</div>
        </div>
      </footer>
    </div>
  );
}

export default App;
