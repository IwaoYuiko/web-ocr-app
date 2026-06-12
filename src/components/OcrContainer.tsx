import React, { useState, useEffect } from 'react';
import { initOcrEngine, recognizeText } from '../utils/ocrEngine';
import { pinyin } from 'pinyin-pro';
import { translations } from './translations'; // さきほど分割したファイル

/**
 * ピンインの文字列から声調を判定し、対応する色を返す関数
 */
const getToneColor = (pinyinText: string, isColorEnabled: boolean): string => {
  if (!isColorEnabled) {
    return '#4b5563';
  }

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
  // UI言語状態（初期表示は English）
  const [lang, setLang] = useState<'en' | 'ja'>('en');

  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string>('');
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // エラーはキーで管理することで言語切り替え時にメッセージも追従
  const [errorKey, setErrorKey] = useState<keyof typeof translations['en'] | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isColorEnabled, setIsColorEnabled] = useState<boolean>(true);

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

  // previewUrl の解放 ＆ 音声強制停止
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      window.speechSynthesis.cancel();
    };
  }, [previewUrl]);

  // 画像が選択された時の処理（jpeg, png 限定）
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      setErrorKey('errType');
      return;
    }

    setErrorKey(null);
    setImage(file);
    setOcrText('');
    setCopied(false);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(URL.createObjectURL(file));
  };

  // OCR実行処理
  const handleOcrExecute = async () => {
    if (!image) return;

    try {
      setIsProcessing(true);
      setErrorKey(null);
      setOcrText('');

      const result = await recognizeText(image);
      setOcrText(result);
    } catch (err) {
      setErrorKey('errProcess');
    } finally {
      setIsProcessing(false);
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
  const handleSpeak = () => {
    if (!ocrText) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(ocrText);
    utterance.lang = 'zh-CN';
    window.speechSynthesis.speak(utterance);
  };

  // 音声停止（Web Speech API）
  const handleStop = () => {
    window.speechSynthesis.cancel();
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>

      {/* 画面最上部の Language セレクトボックス */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '15px' }}>
        <label style={{ marginRight: '8px', fontSize: '14px', alignSelf: 'center', fontWeight: 'bold', color: '#334155' }}>Language:</label>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as 'en' | 'ja')}
          style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc', cursor: 'pointer', fontSize: '14px' }}
        >
          <option value="en">English</option>
          <option value="ja">日本語</option>
        </select>
      </div>

      {/* 初期化ステータスによる条件分岐 */}
      {isInitializing ? (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <p style={{ color: '#4b5563' }}>{t.initializing}</p>
        </div>
      ) : (
        <>
          <h2 style={{ textAlign: 'center', marginBottom: '24px', color: '#1e293b', fontSize: '24px', fontWeight: 'bold' }}>
            {t.title}
          </h2>

          {errorKey && (
            <div style={{ padding: '10px', backgroundColor: '#ffe6e6', color: '#cc0000', borderRadius: '4px', marginBottom: '15px' }}>
              {t[errorKey]}
            </div>
          )}

          {/* 1. 画像選択エリア（Flexboxで中身を中央寄せに設定） */}
          <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px', color: '#334155', textAlign: 'center' }}>
              {t.selectImage}
            </label>
            <input
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              onChange={handleImageChange}
              disabled={isProcessing}
              style={{ color: '#334155', marginBottom: '16px' }} // 元のサイズを保ったまま中央配置
            />

            {/* 安心お知らせ枠（幅いっぱいに広げて綺麗に整列） */}
            <div style={{
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
            </div>
          </div>

          {/* 画像プレビューとOCR実行ボタン */}
          {previewUrl && (
            <div style={{ marginBottom: '20px', textAlign: 'center' }}>
              <img
                src={previewUrl}
                alt="Preview"
                style={{ maxWidth: '100%', maxHeight: '300px', display: 'block', margin: '0 auto 15px', borderRadius: '4px', border: '1px solid #ccc' }}
              />

              {/* 2. OCR実行 */}
              <button
                onClick={handleOcrExecute}
                disabled={isProcessing}
                style={{
                  padding: '10px 20px',
                  fontSize: '16px',
                  backgroundColor: isProcessing ? '#ccc' : '#0070f3',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  width: '100%'
                }}
              >
                {isProcessing ? t.recognizing : t.executeOcr}
              </button>
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
                    onClick={handleSpeak}
                    style={{
                      padding: '4px 12px',
                      backgroundColor: '#0070f3',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    {t.playAudio}
                  </button>
                  <button
                    onClick={handleStop}
                    style={{
                      padding: '4px 12px',
                      backgroundColor: '#ef4444',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    {t.stopAudio}
                  </button>
                  <button
                    onClick={handleCopyText}
                    style={{
                      padding: '4px 12px',
                      backgroundColor: copied ? '#22c55e' : '#e5e7eb',
                      color: copied ? '#fff' : '#000',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    {copied ? t.copied : t.copy}
                  </button>
                </div>
              </div>

              {/* 既存のテキストエリア */}
              <textarea
                readOnly
                value={ocrText}
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
                  marginBottom: '25px'
                }}
              />

              {/* ピンイン表示エリア */}
              <div style={{ marginTop: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontWeight: 'bold', color: '#334155' }}>{t.pinyinLabel}</label>

                  <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px', cursor: 'pointer', userSelect: 'none', color: '#334155' }}>
                    <input
                      type="checkbox"
                      checked={isColorEnabled}
                      onChange={(e) => setIsColorEnabled(e.target.checked)}
                      style={{ marginRight: '6px', cursor: 'pointer' }}
                    />
                    {t.colorTone}
                  </label>
                </div>

                <div style={{
                  width: '100%',
                  padding: '15px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  boxSizing: 'border-box',
                  backgroundColor: '#fff',
                  color: '#1e293b',
                  fontSize: '19px',
                  lineHeight: '2.6em',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all'
                }}>
                  {ocrText.split('\n').map((line, lineIdx) => (
                    <div key={lineIdx} style={{ minHeight: '1.5em' }}>
                      {Array.from(line).map((char, charIdx) => {
                        const isChineseChar = /[\u4e00-\u9fa5]/.test(char);

                        if (isChineseChar) {
                          const pyArray = pinyin(char, { toneType: 'symbol', type: 'array' });
                          const py = pyArray[0] || '';
                          const toneColor = getToneColor(py, isColorEnabled);

                          return (
                            <ruby key={charIdx} style={{ marginRight: '2px' }}>
                              {char}
                              <rt style={{
                                fontSize: '0.55em',
                                color: toneColor,
                                fontWeight: isColorEnabled && toneColor !== '#4b5563' ? 'bold' : 'normal',
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
      <footer style={{
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
      </footer>

    </div>
  );
};