import React, { useState, useEffect } from 'react';
import { initOcrEngine, recognizeText } from '../utils/ocrEngine';
import { pinyin } from 'pinyin-pro';
import { translations } from './translations'; // さきほど分割したファイル

declare global {
  interface Window {
    PinyinLensAndroid?: {
      onOcrCompleted: (text: string) => void;
      onOcrTextChanged: (text: string) => void;
      speak: (text: string) => void;
      stopSpeech: () => void;
    };
  }
}

/**
 * ピンインの文字列から声調を判定し、対応する色を返す関数
 */
const getToneColor = (pinyinText: string): string => {
  // 第1声の母音記号（ā ē ī ō ū ǖ）
  if (/[āēīōūǖ]/.test(pinyinText)) return '#ef4444'; // 赤

  // 第2声の母音記号（á é í ó ú ǘ）
  if (/[áéíóúǘ]/.test(pinyinText)) return '#22c55e'; // 緑

  // 第3声の母音記号（ǎ ě ǐ ǒ ǔ ǚ）
  if (/[ǎěǐǒǔǚ]/.test(pinyinText)) return '#3b82f6'; // 青

  // 第4声の母音記号（à è ì ò ù ǜ）
  if (/[àèìòùǜ]/.test(pinyinText)) return '#a855f7'; // 紫

  // 軽声（記号なし）
  return '#4b5563';
};

export const OcrContainer: React.FC = () => {
  const isAndroidApp = Boolean(window.PinyinLensAndroid);
  const androidLanguage: 'en' | 'ja' = navigator.language.toLowerCase().startsWith('ja')
    ? 'ja'
    : 'en';

  // UI言語状態（初期表示は English）
  const [lang, setLang] = useState<'en' | 'ja'>(isAndroidApp ? androidLanguage : 'en');

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // エラーはキーで管理することで言語切り替え時にメッセージも追従
  const [errorKey, setErrorKey] = useState<keyof typeof translations['en'] | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const utteranceRef = React.useRef<SpeechSynthesisUtterance | null>(null);
  const isInitialAndroidScreen = isAndroidApp && !previewUrl && !ocrText && !errorKey;

  // 選択中の言語に応じた翻訳オブジェクトを取得
  const t = translations[lang];

  // コンポーネントマウント時にOCRエンジンを初期化
  useEffect(() => {
    let isMounted = true;

    const setupEngine = async () => {
      try {
        setIsInitializing(true);
        setErrorKey(null);
        await initOcrEngine();
      } catch (err) {
        if (isMounted) {
          setErrorKey('errInit');
        }
      } finally {
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    };

    setupEngine();

    return () => {
      isMounted = false;
    };
  }, []);

  // Androidの履歴から文章と保存画像を受け取り、ピンインを再生成して表示する
  useEffect(() => {
    const handleSavedRecord = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string; imageUrl?: string }>).detail;
      if (!detail?.text) return;
      setOcrText(detail.text);
      setErrorKey(null);
      setCopied(false);
      setPreviewUrl((current) => {
        if (current?.startsWith('blob:')) URL.revokeObjectURL(current);
        return detail.imageUrl || null;
      });
    };
    window.addEventListener('pinyin-lens-load-record', handleSavedRecord);
    return () => window.removeEventListener('pinyin-lens-load-record', handleSavedRecord);
  }, []);

  // previewUrl の解放 ＆ 音声強制停止
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      window.speechSynthesis?.cancel();
    };
  }, [previewUrl]);

  useEffect(() => {
    const handleSpeechEnded = () => setIsSpeaking(false);
    window.addEventListener('pinyin-lens-speech-ended', handleSpeechEnded);
    return () => window.removeEventListener('pinyin-lens-speech-ended', handleSpeechEnded);
  }, []);

  // 画像が選択された時の処理（jpeg, png 限定）
  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      setErrorKey('errType');
      input.value = '';
      return;
    }

    setErrorKey(null);
    setOcrText('');
    setCopied(false);

    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(URL.createObjectURL(file));

    try {
      setIsProcessing(true);
      setErrorKey(null);
      setOcrText('');

      const result = await recognizeText(file);
      setOcrText(result);
      if (result) {
        window.PinyinLensAndroid?.onOcrCompleted(result);
      }
    } catch (err) {
      setErrorKey('errProcess');
    } finally {
      setIsProcessing(false);
      input.value = '';
    }
  };

  // 結果をクリップボードにコピー
  const handleCopyText = async () => {
    if (!ocrText) return;
    try {
      await navigator.clipboard.writeText(ocrText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setErrorKey('errCopy');
    }
  };

  // 中国語の音声再生（Web Speech API）
  const handleToggleSpeech = () => {
    if (!ocrText) return;

    if (isSpeaking) {
      if (window.PinyinLensAndroid) {
        window.PinyinLensAndroid.stopSpeech();
      } else {
        window.speechSynthesis?.cancel();
        utteranceRef.current = null;
      }
      setIsSpeaking(false);
      return;
    }

    if (window.PinyinLensAndroid) {
      window.PinyinLensAndroid.speak(ocrText);
      setIsSpeaking(true);
      return;
    }

    window.speechSynthesis?.cancel();
    const utterance = new SpeechSynthesisUtterance(ocrText);
    utterance.lang = 'zh-CN';
    utterance.onend = () => {
      utteranceRef.current = null;
      setIsSpeaking(false);
    };
    utterance.onerror = () => {
      utteranceRef.current = null;
      setIsSpeaking(false);
    };
    utteranceRef.current = utterance;
    setIsSpeaking(true);
    window.speechSynthesis?.speak(utterance);
  };

  // 音声停止（Web Speech API）
  return (
    <div style={{
      maxWidth: '600px',
      margin: '0 auto',
      padding: isAndroidApp ? '12px' : '20px',
      fontFamily: 'sans-serif',
      boxSizing: 'border-box',
      minHeight: isInitialAndroidScreen ? '100vh' : undefined,
      height: isInitialAndroidScreen ? '100dvh' : undefined,
      display: isInitialAndroidScreen ? 'flex' : undefined,
      flexDirection: isInitialAndroidScreen ? 'column' : undefined
    }}>

      {/* 画面最上部の Language セレクトボックス */}
      {!isAndroidApp && <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '15px' }}>
        <label style={{ marginRight: '8px', fontSize: '14px', alignSelf: 'center', fontWeight: 'bold', color: '#334155' }}>Language:</label>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as 'en' | 'ja')}
          style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc', cursor: 'pointer', fontSize: '14px' }}
        >
          <option value="en">English</option>
          <option value="ja">日本語</option>
        </select>
      </div>}

      {/* 初期化ステータスによる条件分岐 */}
      {isInitializing ? (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <p style={{ color: '#4b5563' }}>{t.initializing}</p>
        </div>
      ) : (
        <>
          {!isAndroidApp && (
            <h2 style={{ textAlign: 'center', marginBottom: '24px', color: '#1e293b', fontSize: '24px', fontWeight: 'bold' }}>
              {t.title}
            </h2>
          )}

          {errorKey && (
            <div style={{ padding: '10px', backgroundColor: '#ffe6e6', color: '#cc0000', borderRadius: '4px', marginBottom: '15px' }}>
              {t[errorKey]}
            </div>
          )}

          {/* 1. 画像選択エリア（Flexboxで中身を中央寄せに設定） */}
          <div style={{
            flex: isInitialAndroidScreen ? '1' : undefined,
            width: '100%',
            marginBottom: isInitialAndroidScreen ? '0' : (isAndroidApp ? '12px' : '24px'),
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: isInitialAndroidScreen ? 'center' : undefined
          }}>
            <input
              id="ocr-image-input"
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              onChange={handleImageChange}
              disabled={isProcessing}
              style={{ display: 'none' }}
            />
            <label
              htmlFor="ocr-image-input"
              style={{
                width: '100%',
                maxWidth: '360px',
                boxSizing: 'border-box',
                padding: '12px 20px',
                borderRadius: isAndroidApp ? '24px' : '8px',
                backgroundColor: isProcessing ? '#cbd5e1' : '#0070f3',
                color: '#fff',
                fontSize: '16px',
                fontWeight: 'bold',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                pointerEvents: isProcessing ? 'none' : 'auto'
              }}
            >
              {isProcessing && <span className="ocr-spinner" aria-hidden="true" />}
              {isProcessing ? t.recognizing : t.selectImage}
            </label>
            <div style={{
              marginTop: '7px',
              marginBottom: isAndroidApp ? '0' : '16px',
              color: '#64748b',
              fontSize: '12px',
              textAlign: 'center'
            }}>
              {t.supportedFormats}
            </div>

            {/* 安心お知らせ枠（幅いっぱいに広げて綺麗に整列） */}
            {!isAndroidApp && <div style={{
              color: '#0f766e',
              backgroundColor: '#f0fdfa',
              border: '1px solid #ccfbf1',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '14px',
              lineHeight: '1.5',
              textAlign: 'left',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              {t.privacyNotice}
            </div>}
          </div>

          {/* 画像プレビュー */}
          {previewUrl && (
            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
              <img
                src={previewUrl}
                alt="Preview"
                style={{ maxWidth: '100%', maxHeight: '300px', display: 'block', margin: '0 auto 15px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>
          )}

          {/* 3. 認識結果表示 & ピンイン表示エリア */}
          {ocrText !== '' && (
            <div style={{ marginTop: '25px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontWeight: 'bold', color: '#334155' }}>{t.resultLabel}</label>

                {/* 操作ボタン群 */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleToggleSpeech}
                    aria-label={isSpeaking ? t.stopAudio : t.playAudio}
                    title={isSpeaking ? t.stopAudio : t.playAudio}
                    style={{
                      width: '38px',
                      height: '38px',
                      padding: '0',
                      backgroundColor: isSpeaking ? '#fee2e2' : '#e0efff',
                      color: isSpeaking ? '#dc2626' : '#0070f3',
                      border: 'none',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {isSpeaking ? (
                      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="7" y="7" width="10" height="10" rx="1" />
                      </svg>
                    ) : (
                      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
                        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                      </svg>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyText}
                    aria-label={copied ? t.copied : t.copy}
                    title={copied ? t.copied : t.copy}
                    style={{
                      width: '38px',
                      height: '38px',
                      padding: '0',
                      backgroundColor: copied ? '#22c55e' : '#e5e7eb',
                      color: copied ? '#fff' : '#334155',
                      border: 'none',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {copied ? (
                      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 12 4 4L19 6" />
                      </svg>
                    ) : (
                      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="10" height="10" rx="2" />
                        <path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* 既存のテキストエリア */}
              <textarea
                className="ocr-result-textarea"
                value={ocrText}
                onChange={(event) => setOcrText(event.target.value)}
                onBlur={() => window.PinyinLensAndroid?.onOcrTextChanged(ocrText)}
                rows={6}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  boxSizing: 'border-box',
                  fontFamily: 'monospace',
                  fontSize: '15px',
                  backgroundColor: '#f9f9f9',
                  color: '#1e293b',
                  marginBottom: '10px',
                  overflowY: 'scroll',
                  scrollbarGutter: 'stable'
                }}
              />

              {/* ピンイン表示エリア */}
              <div style={{ marginTop: '0', textAlign: 'left' }}>
                <div style={{ marginBottom: '8px', textAlign: 'left' }}>
                  <label style={{ fontWeight: 'bold', color: '#334155' }}>{t.pinyinLabel}</label>
                </div>

                <div style={{
                  width: '100%',
                  padding: '15px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  boxSizing: 'border-box',
                  backgroundColor: '#fff',
                  color: '#1e293b',
                  fontSize: '20px',
                  lineHeight: '2.6em',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  textAlign: 'left'
                }}>
                  {ocrText.split('\n').map((line, lineIdx) => (
                    <div key={lineIdx} style={{ minHeight: '1.5em' }}>
                      {Array.from(line).map((char, charIdx) => {
                        const isChineseChar = /[\u4e00-\u9fa5]/.test(char);

                        if (isChineseChar) {
                          const pyArray = pinyin(char, { toneType: 'symbol', type: 'array' });
                          const py = pyArray[0] || '';
                          const toneColor = getToneColor(py);

                          return (
                            <ruby key={charIdx} style={{ marginRight: '2px' }}>
                              {char}
                              <rt style={{
                                fontSize: '0.68em',
                                color: toneColor,
                                fontWeight: toneColor !== '#4b5563' ? 'bold' : 'normal',
                                userSelect: 'none'
                              }}>
                                {py}
                              </rt>
                            </ruby>
                          );
                        }
                        return <span key={charIdx}>{char}</span>;
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ライセンス・クレジット表記 */}
      {!isAndroidApp && <footer style={{
        marginTop: '60px',
        paddingTop: '20px',
        borderTop: '1px solid #e2e8f0',
        textAlign: 'center',
        fontSize: '12px',
        color: '#64748b',
        lineHeight: '1.6'
      }}>
        <a
          href="https://github.com/IwaoYuiko/web-ocr-app/blob/main/README.md"
          target="_blank"
          rel="noopener noreferrer"
        >
          📖 使い方
        </a>

        {' | '}

        <a
          href="https://github.com/IwaoYuiko/web-ocr-app"
          target="_blank"
          rel="noopener noreferrer"
        >
          💻 GitHub
        </a>

        <div>
          <p style={{ fontWeight: 'bold', margin: '0 0 2px 0', color: '#475569' }}>Powered by:</p>
          <p style={{ margin: 0, color: '#64748b' }}>
            PaddleOCR PP-OCRv5
          </p>
        </div>
      </footer>}

    </div>
  );
};
