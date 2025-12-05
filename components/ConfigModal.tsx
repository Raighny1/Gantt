
import React, { useState } from 'react';
import { updateFirebaseConfig, clearFirebaseConfig, isFirebaseReady } from '../services/firebaseConfig';
import ConfirmDialog from './ConfirmDialog';

interface ConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ConfigModal: React.FC<ConfigModalProps> = ({ isOpen, onClose }) => {
  const [configInput, setConfigInput] = useState('');
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const isReady = isFirebaseReady();

  if (!isOpen) return null;

  const handleSave = () => {
    setError('');
    if (!configInput.trim()) {
        setError('請輸入設定內容');
        return;
    }

    const success = updateFirebaseConfig(configInput);
    if (success) {
        alert('設定成功！網頁將重新整理以套用新設定。');
        window.location.reload();
    } else {
        setError('無法解析設定碼，請確認您複製了完整的 { ... } 內容或是 const firebaseConfig = { ... } 區塊。');
    }
  };

  const handleClearClick = () => {
      setShowConfirm(true);
  };
  
  const executeClear = () => {
      setShowConfirm(false);
      clearFirebaseConfig();
  };

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl animate-fade-in-up flex flex-col max-h-[90vh]">
          
          <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 rounded-t-xl">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
              <span className="w-8 h-8 rounded-full bg-yellow-500 text-white flex items-center justify-center mr-3 text-sm">
                  FV
              </span>
              設定 Firebase 資料庫
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-4">
              {isReady ? (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 rounded-lg flex items-start">
                      <svg className="w-6 h-6 text-green-500 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      <div>
                          <h3 className="font-bold text-green-800 dark:text-green-300">已連線至 Firebase</h3>
                          <p className="text-sm text-green-600 dark:text-green-400 mt-1">您的專案目前正在與雲端資料庫同步。</p>
                          <button onClick={handleClearClick} className="mt-3 text-sm text-red-500 hover:text-red-700 underline">
                              移除連線設定
                          </button>
                      </div>
                  </div>
              ) : (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
                      <h3 className="font-bold text-blue-800 dark:text-blue-300 mb-2">如何取得設定碼？</h3>
                      <ol className="list-decimal list-inside text-sm text-blue-700 dark:text-blue-400 space-y-1">
                          <li>前往 <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" className="underline">Firebase Console</a> 並建立專案。</li>
                          <li>在 Project Settings (專案設定) 下方，點擊 <strong>&lt;/&gt;</strong> 新增 Web App。</li>
                          <li>複製 <code>const firebaseConfig = &#123; ... &#125;;</code> 這一整段程式碼。</li>
                          <li>確保您已在 Firebase 左側選單啟用 <strong>Firestore Database</strong>。</li>
                      </ol>
                  </div>
              )}

              <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
                      貼上設定碼
                  </label>
                  <textarea
                      value={configInput}
                      onChange={(e) => setConfigInput(e.target.value)}
                      placeholder={'例如：\nconst firebaseConfig = {\n  apiKey: "AIzaSy...",\n  authDomain: "..."\n};'}
                      className="w-full h-48 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 font-mono text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
              </div>
          </div>

          <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium transition-colors"
            >
              關閉
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-lg shadow-indigo-500/30"
            >
              儲存並連線
            </button>
          </div>
        </div>
      </div>
      
      {/* Confirm Disconnect Dialog */}
      <ConfirmDialog
        isOpen={showConfirm}
        title="移除連線"
        message="確定要移除資料庫連結嗎？這將會切斷雲端同步。"
        onConfirm={executeClear}
        onCancel={() => setShowConfirm(false)}
        isDangerous={true}
        confirmLabel="確認移除"
      />
    </>
  );
};

export default ConfigModal;
