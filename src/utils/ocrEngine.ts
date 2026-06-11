import { PaddleOcrService } from 'ppu-paddle-ocr/web';

// 変更後：GitHub Pagesのサブフォルダ（/web-ocr-app/）から正しく読み込めるようにする
const BASE_URL = import.meta.env.BASE_URL || '/';
const DET_MODEL_PATH = `${BASE_URL}models/PP-OCRv5_mobile_det_infer.onnx`;
const REC_MODEL_PATH = `${BASE_URL}models/PP-OCRv5_mobile_rec_infer.onnx`;
const DICT_PATH = `${BASE_URL}models/ppocrv5_dict.txt`;

let ocrService: PaddleOcrService | null = null;
let initStatus: 'uninitialized' | 'loading' | 'ready' = 'uninitialized';
let initPromise: Promise<void> | null = null;

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
    const arrayBuffer = await imageFile.arrayBuffer();
    const result = await ocrService.recognize(arrayBuffer);
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