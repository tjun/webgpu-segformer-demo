
import { pipeline, env, RawImage } from '@xenova/transformers';
import { SegmentedClass } from '../types';

// Configure environment
env.allowLocalModels = false;
env.useBrowserCache = true;

// Set ONNX log level to fatal
if (env.backends?.onnx) {
    env.backends.onnx.logLevel = 'fatal';
}

class ObjectDetectionService {
  private static instance: ObjectDetectionService;
  private pipe: any = null;
  // Specific model requested for Cityscapes segmentation
  // Upgraded to B1 for better accuracy as requested
  private modelId = 'Xenova/segformer-b1-finetuned-cityscapes-1024-1024';

  private constructor() {}

  public static getInstance(): ObjectDetectionService {
    if (!ObjectDetectionService.instance) {
      ObjectDetectionService.instance = new ObjectDetectionService();
    }
    return ObjectDetectionService.instance;
  }

  public async loadModel(onProgress?: (progress: number) => void): Promise<void> {
    if (this.pipe) return;

    console.log(`Loading Segmentation model: ${this.modelId}`);

    try {
      this.pipe = await pipeline('image-segmentation', this.modelId, {
        device: 'webgpu',
        quantized: true, // Use quantized for performance
        session_options: { logSeverityLevel: 4 }, // Suppress warnings about execution providers
        progress_callback: (data: any) => {
          if (data.status === 'progress' && onProgress) {
            onProgress(data.progress);
          }
        }
      } as any);
      console.log('SegFormer Model loaded successfully.');
    } catch (error) {
      console.error("Failed to load SegFormer model.", error);
      throw error;
    }
  }

  public async predict(source: HTMLCanvasElement): Promise<SegmentedClass[]> {
    if (!this.pipe) throw new Error("Model not loaded");

    const ctx = source.getContext('2d');
    if (ctx) {
        const width = Math.floor(source.width);
        const height = Math.floor(source.height);
        const imageData = ctx.getImageData(0, 0, width, height);
        
        // Manual RGB conversion for robustness
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
        const rawImage = new RawImage(rgbData, width, height, 3);
        
        // Run inference
        // Segformer returns an array of { label, score, mask }
        const results = await this.pipe(rawImage);
        
        return results;
    }

    return [];
  }
}

export const objectDetectionService = ObjectDetectionService.getInstance();
