import { useEffect } from 'react';
import { OcrContainer } from './components/OcrContainer';

function App() {
  const isAndroidApp = Boolean(window.PinyinLensAndroid);

  useEffect(() => {
    if (!isAndroidApp) return;
    document.body.classList.add('android-webview');
    return () => document.body.classList.remove('android-webview');
  }, [isAndroidApp]);

  return (
    <div style={{
      backgroundColor: '#fafafa',
      minHeight: '100vh',
      padding: isAndroidApp ? '0' : '40px 0'
    }}>
      <OcrContainer />
    </div>
  );
}

export default App;
