import { pipeline, env, RawImage } from '@xenova/transformers';

// Configure environment
// Skip local model checks to avoid 404s on local file system attempts
env.allowLocalModels = false;
// Use browser cache to prevent re-downloading model on refresh
env.useBrowserCache = true;

class DepthService {
  private static instance: DepthService;
  private pipe: any = null;
  // Switched back to Small model for real-time performance.
  private modelId = 'Xenova/depth-anything-small-hf';
  
  private constructor() {}

  public static getInstance(): DepthService {
    if (!DepthService.instance) {
      DepthService.instance = new DepthService();
    }
    return DepthService.instance;
  }

  public async loadModel(onProgress?: (progress: number) => void): Promise<void> {
    if (this.pipe) return;

    console.log(`Loading model: ${this.modelId}`);

    try {
      // Try to use WebGPU if available
      // ENABLE QUANTIZATION: { quantized: true } significantly improves performance
      this.pipe = await pipeline('depth-estimation', this.modelId, {
        device: 'webgpu',
        quantized: true, 
        session_options: { logSeverityLevel: 4 }, // Suppress excessive logs
        progress_callback: (data: any) => {
          if (data.status === 'progress' && onProgress) {
            onProgress(data.progress);
          }
        }
      } as any);
      console.log('Model loaded with WebGPU (Quantized)');
    } catch (error) {
      console.warn("WebGPU initialization failed or model load error, falling back to WASM/CPU.", error);
      // Fallback attempt (wasm)
      this.pipe = await pipeline('depth-estimation', this.modelId, {
        quantized: true,
        session_options: { logSeverityLevel: 4 },
        progress_callback: (data: any) => {
          if (data.status === 'progress' && onProgress) {
            onProgress(data.progress);
          }
        }
      } as any);
      console.log('Model loaded with WASM fallback');
    }
  }

  public async predict(source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement) {
    if (!this.pipe) throw new Error("Model not loaded");

    // "Unsupported input type: object" fix:
    // Explicitly convert HTMLCanvasElement to a RawImage object using ImageData.
    if (source instanceof HTMLCanvasElement) {
      const ctx = source.getContext('2d');
      if (ctx) {
        // Ensure dimensions are integers to avoid pipeline errors
        const width = Math.floor(source.width);
        const height = Math.floor(source.height);
        
        const imageData = ctx.getImageData(0, 0, width, height);
        
        // Convert RGBA (4 channels) to RGB (3 channels)
        // Some pipelines fail or produce garbage with the alpha channel present when using RawImage directly.
        const { data } = imageData;
        const rgbData = new Uint8Array(width * height * 3);
        
        const len = width * height;
        for (let i = 0; i < len; i++) {
            const offset = i * 4;
            const targetOffset = i * 3;
            rgbData[targetOffset] = data[offset];     // R
            rgbData[targetOffset + 1] = data[offset + 1]; // G
            rgbData[targetOffset + 2] = data[offset + 2]; // B
        }

        // Create a RawImage (data, width, height, channels)
        const rawImage = new RawImage(rgbData, width, height, 3);
        const result = await this.pipe(rawImage);
        return result;
      }
    }

    // Fallback for other types
    const result = await this.pipe(source);
    return result;
  }

  public getModelId() {
    return this.modelId;
  }
}

export const depthService = DepthService.getInstance();