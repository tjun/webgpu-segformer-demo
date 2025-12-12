
export interface ModelStatus {
  status: 'idle' | 'loading' | 'ready' | 'error';
  message?: string;
  progress?: number;
}

export interface SegmentedClass {
  label: string;
  score: number;
  mask: any; // RawImage (width, height, channels, data)
}

export interface CachedFrame {
    timestamp: number;
    odResult: SegmentedClass[];
}

// Minimal type definition for the transformer.js env and pipeline to avoid strict type errors without the package types installed
export type PipelineType = (inputs: any) => Promise<any>;
