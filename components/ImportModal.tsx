
import React, { useState, useRef } from 'react';
import { Task, TAILWIND_COLORS, getColorForRole } from '../types';
import { parseImportData } from '../services/geminiService';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (projectName: string, tasks: Task[]) => void;
}

const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onImport }) => {
  const [inputText, setInputText] = useState('');
  const [projectName, setProjectName] = useState('');
  const [error, setError] = useState('');
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== 'application/pdf') {
        setError('目前僅支援 PDF 格式檔案');
        return;
      }
      setSelectedFile(file);
      setError('');
      setInputText(''); 
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleAiParse = async () => {
    setError('');
    
    if (!inputText.trim() && !selectedFile) {
      setError('請輸入文字或上傳 PDF 檔案');
      return;
    }

    setIsAiParsing(true);
    try {
      let parsedTasks: Task[] = [];

      if (selectedFile) {
        const base64Data = await fileToBase64(selectedFile);
        parsedTasks = await parseImportData({
          inlineData: {
            data: base64Data,
            mimeType: 'application/pdf'
          }
        });
      } else {
        parsedTasks = await parseImportData(inputText);
      }
      
      if (parsedTasks.length === 0) {
        setError('AI 無法識別有效資料，請確認內容是否包含時程資訊。');
        setIsAiParsing(false);
        return;
      }

      const defaultName = selectedFile 
        ? selectedFile.name.replace('.pdf', '') 
        : `AI 匯入專案 (${new Date().toLocaleDateString('zh-TW')})`;

      const finalProjectName = projectName.trim() || defaultName;
      
      onImport(finalProjectName, parsedTasks);
      onClose();
      resetState();
    } catch (e) {
      console.error(e);
      setError('AI 解析失敗，請稍後再試。');
    } finally {
      setIsAiParsing(false);
    }
  };

  const smartParse = () => {
    if (selectedFile) {
        setError('標準解析僅支援文字貼上 (Excel/CSV)。PDF 請使用 AI 智能解析。');
        return;
    }

    setError('');
    if (!inputText.trim()) {
      setError('請貼上資料');
      return;
    }

    const rows = inputText.trim().split('\n');
    const taskMap = new Map<string, Task>();
    
    try {
      rows.forEach((row, index) => {
        let cols = row.split('\t');
        if (cols.length < 2 && row.includes(',')) cols = row.split(',');
        
        const cleanCols = cols.map(c => c.trim()).filter(c => c !== '');
        if (cleanCols.length === 0) return;

        const dateCols: string[] = [];
        const textCols: string[] = [];

        cleanCols.forEach(col => {
          const isDateLike = /[\d]{1,4}[-/][\d]{1,2}/.test(col) && !isNaN(Date.parse(col));
          if (isDateLike) {
            dateCols.push(col);
          } else {
            textCols.push(col);
          }
        });

        const headerKeywords = ['名稱', '功能', '日期', '開始', '結束', '角色', '負責人', 'Name', 'Title', 'Date', 'Start', 'End', 'Role'];
        if (dateCols.length === 0 && textCols.some(t => headerKeywords.includes(t))) {
           return; 
        }
        
        if (textCols.length === 0 && dateCols.length === 0) return;

        const featureName = textCols.length > 0 ? textCols[0] : `匯入項目 ${index + 1}`;
        let rawRoleString = '未指派';
        if (textCols.length >= 2) {
             rawRoleString = textCols[textCols.length - 1]; 
        }

        // --- Role Splitting Logic ---
        let role = rawRoleString;
        let subLabel = '';

        // Try to match "[UI] Description" or "UI - Description"
        const bracketMatch = rawRoleString.match(/^\[(.*?)(?:\]|】)\s*(.*)/);
        if (bracketMatch) {
            role = bracketMatch[1].trim();
            subLabel = bracketMatch[2].trim();
        } else {
             // Try dash separator if no brackets
             const dashSplit = rawRoleString.split(/[-:：]/);
             if (dashSplit.length > 1) {
                 role = dashSplit[0].trim();
                 subLabel = dashSplit.slice(1).join(' ').trim();
             }
        }
        // ----------------------------

        const today = new Date().toISOString().split('T')[0];
        const formatDate = (d: string) => {
            try { return new Date(d).toISOString().split('T')[0]; } catch { return today; }
        };

        let startDate = today;
        let endDate = today;

        if (dateCols.length >= 1) startDate = formatDate(dateCols[0]);
        if (dateCols.length >= 2) endDate = formatDate(dateCols[1]);
        else endDate = startDate; 

        if (!taskMap.has(featureName)) {
          taskMap.set(featureName, {
            id: crypto.randomUUID(),
            name: featureName,
            assignments: []
          });
        }

        const task = taskMap.get(featureName)!;
        
        task.assignments.push({
          id: crypto.randomUUID(),
          role: role,
          subLabel: subLabel,
          startDate: startDate,
          endDate: endDate,
          progress: 0,
          color: getColorForRole(role)
        });
      });

      const tasks = Array.from(taskMap.values());

      if (tasks.length === 0) {
        setError('找不到有效資料。請確認您複製了包含文字或日期的內容。');
        return;
      }

      const finalProjectName = projectName.trim() || `匯入專案 (${new Date().toLocaleDateString('zh-TW')})`;
      onImport(finalProjectName, tasks);
      onClose();
      resetState();
      
    } catch (e) {
      console.error(e);
      setError('解析失敗，請檢查資料格式。');
    }
  };

  const handleSample = () => {
     const today = new Date();
     const d1 = today.toISOString().split('T')[0];
     const d2 = new Date(today.setDate(today.getDate()+5)).toISOString().split('T')[0];
     const sample = `會員系統\t[FE] 前端切版\t${d1}\t${d2}\n${d1}\t${d2}\t會員系統\t[UI] 介面設計\nAPI開發\t${d1}\t[BE] 後端 API`;
     setInputText(sample);
     setSelectedFile(null);
  };

  const resetState = () => {
      setInputText('');
      setProjectName('');
      setSelectedFile(null);
      setError('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl animate-fade-in-up flex flex-col max-h-[90vh]">
        
        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 rounded-t-xl">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
            <svg className="w-6 h-6 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            智慧匯入 (Excel / PDF)
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 flex-1">
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 p-4 rounded-lg text-sm text-indigo-800 dark:text-indigo-300">
                <p className="font-bold mb-2">💡 匯入說明：</p>
                <ul className="list-disc list-inside space-y-1 text-xs sm:text-sm">
                    <li><strong>標準格式：</strong>適合 Excel/Google Sheets，支援自動拆解 <code>[Role] 事項</code> 格式。</li>
                    <li><strong>PDF 文件：</strong>直接上傳專案 PDF，AI 將自動辨識結構並拆分角色與事項。</li>
                </ul>
                <button onClick={handleSample} className="mt-2 text-indigo-600 dark:text-indigo-400 underline text-xs">載入文字範例</button>
            </div>

            <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
                    新專案名稱
                </label>
                <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder={`例如：匯入專案 ${new Date().toLocaleDateString('zh-TW')}`}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
            </div>

            <div className="space-y-4">
                <div 
                  className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center transition-colors cursor-pointer ${
                    selectedFile 
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/10' 
                      : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                >
                   <input 
                     type="file" 
                     ref={fileInputRef} 
                     onChange={handleFileChange} 
                     accept="application/pdf"
                     className="hidden" 
                   />
                   
                   {selectedFile ? (
                     <div className="text-center">
                        <svg className="w-10 h-10 text-indigo-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <p className="font-medium text-indigo-600 dark:text-indigo-400">{selectedFile.name}</p>
                        <p className="text-xs text-gray-500 mt-1">點擊可更換檔案</p>
                     </div>
                   ) : (
                     <div className="text-center text-gray-400 dark:text-gray-500">
                        <svg className="w-10 h-10 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                        <p className="font-medium">點擊上傳 PDF</p>
                        <p className="text-xs mt-1">或將檔案拖放至此</p>
                     </div>
                   )}
                </div>

                <div className="relative">
                    <div className="absolute inset-0 flex items-center" aria-hidden="true">
                        <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                    </div>
                    <div className="relative flex justify-center">
                        <span className="px-2 bg-white dark:bg-gray-800 text-sm text-gray-500">或貼上文字</span>
                    </div>
                </div>

                <textarea
                    value={inputText}
                    onChange={(e) => {
                        setInputText(e.target.value);
                        if (e.target.value) setSelectedFile(null);
                    }}
                    placeholder="貼上 Excel/Google Sheets 複製的內容..."
                    className="w-full h-32 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                    disabled={!!selectedFile}
                />
                
                {error && <p className="text-red-500 text-sm">{error}</p>}
            </div>
        </div>

        <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium transition-colors"
          >
            取消
          </button>
          
          <button
            onClick={smartParse}
            disabled={isAiParsing || !!selectedFile}
            className={`px-5 py-2.5 rounded-lg font-medium transition-colors ${
                selectedFile 
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                : 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-500/30'
            }`}
          >
            標準匯入
          </button>

          <button
            onClick={handleAiParse}
            disabled={isAiParsing}
            className="flex items-center px-5 py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium shadow-lg shadow-indigo-500/30 hover:opacity-90 transition-opacity disabled:opacity-70"
          >
            {isAiParsing ? (
                <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    AI 分析中...
                </>
            ) : (
                <>
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    ✨ AI 智能解析
                </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
