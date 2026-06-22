import { PaddleOcrService } from 'ppu-paddle-ocr/web';
import * as ort from 'onnxruntime-web';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url';

// ppu-paddle-ocr は既定でWASMをCDNから取得するため、APK内に同梱された
// Viteの生成物を明示する。WebViewではSharedArrayBufferを前提にしない。
ort.env.wasm.wasmPaths = {
  wasm: wasmUrl,
};
ort.env.wasm.numThreads = 1;

// 変更後：GitHub Pagesのサブフォルダ（/web-ocr-app/）から正しく読み込めるようにする
const BASE_URL = import.meta.env.BASE_URL || '/';
const DET_MODEL_PATH = `${BASE_URL}models/PP-OCRv5_mobile_det_infer.onnx`;
const REC_MODEL_PATH = `${BASE_URL}models/PP-OCRv5_mobile_rec_infer.onnx`;
const DICT_PATH = `${BASE_URL}models/ppocrv5_dict.txt`;

let ocrService: PaddleOcrService | null = null;
let initStatus: 'uninitialized' | 'loading' | 'ready' = 'uninitialized';
let initPromise: Promise<void> | null = null;
const MAX_OCR_IMAGE_SIDE = 2048;

/**
 * Large images consume considerably more memory when decoded in Android WebView.
 * Keep the original file for preview/storage and resize only the image sent to OCR.
 */
const drawOcrCanvas = (
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): HTMLCanvasElement => {
  const longestSide = Math.max(sourceWidth, sourceHeight);
  const scale = longestSide > MAX_OCR_IMAGE_SIDE ? MAX_OCR_IMAGE_SIDE / longestSide : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas is not available for OCR image processing.');
  }

  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
};

const loadImageElement = (imageFile: File): Promise<HTMLCanvasElement> => {
  const imageUrl = URL.createObjectURL(imageFile);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      try {
        resolve(drawOcrCanvas(image, image.naturalWidth, image.naturalHeight));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(imageUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error('The selected image could not be decoded.'));
    };
    image.src = imageUrl;
  });
};

const prepareLargeImageForOcr = async (imageFile: File): Promise<HTMLCanvasElement> => {
  if (typeof createImageBitmap !== 'function') {
    return loadImageElement(imageFile);
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(imageFile);
    return drawOcrCanvas(bitmap, bitmap.width, bitmap.height);
  } catch (error) {
    console.warn('ImageBitmap decoding failed; trying the image element fallback.', error);
    return loadImageElement(imageFile);
  } finally {
    bitmap?.close();
  }
};

/**
 * 1. OCRサービスの初期化
 * 既に初期化中、または初期化済みの場合は処理を重複させません。
 */
export const initOcrEngine = async (): Promise<void> => {
  if (initStatus === 'ready' && ocrService) {
    return;
  }

  // 既に初期化処理が進行中の場合は、その処理の完了を待つ
  if (initStatus === 'loading' && initPromise) {
    return initPromise;
  }

  initStatus = 'loading';
  initPromise = (async () => {
    try {
      ocrService = new PaddleOcrService({
        model: {
          detection: DET_MODEL_PATH,
          recognition: REC_MODEL_PATH,
          charactersDictionary: DICT_PATH,
        },
        processing: {
          engine: 'canvas-native',
        },
      });

      await ocrService.initialize();
      initStatus = 'ready';
    } catch (error) {
      ocrService = null;
      initStatus = 'uninitialized';
      console.error('OCRエンジンの初期化に失敗しました:', error);
      throw error;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
};

/**
 * 2. 画像ファイルから文字認識
 */
export const recognizeText = async (imageFile: File): Promise<string> => {
  // もし初期化中の場合は、完了するまで自動的に待つ安全弁
  if (initStatus === 'loading' && initPromise) {
    await initPromise;
  }

  if (initStatus !== 'ready' || !ocrService) {
    throw new Error('OCRエンジンが初期化されていません。最初に initOcrEngine() を呼び出してください。');
  }

  try {
    const preparedImage = await prepareLargeImageForOcr(imageFile);
    const result = await ocrService.recognize(preparedImage);
    return result?.text || '';
  } catch (error) {
    console.error('文字認識処理に失敗しました:', error);
    throw error;
  }
};

/**
 * 3. 後始末（メモリ解放）
 * 初期化中の競合を防ぎつつ安全に解放します。
 */
export const destroyOcrEngine = async (): Promise<void> => {
  if (initPromise) {
    try { await initPromise; } catch {}
  }

  if (!ocrService) {
    initStatus = 'uninitialized';
    return;
  }

  try {
    await ocrService.destroy();
  } catch (error) {
    console.error('OCRエンジンの破棄に失敗しました:', error);
  } finally {
    ocrService = null;
    initStatus = 'uninitialized';
  }
};
