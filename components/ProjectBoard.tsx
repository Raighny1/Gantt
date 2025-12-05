
import React, { useState, useEffect, useRef } from 'react';
import GanttChart from './GanttChart';
import TaskModal from './TaskModal';
import ConfigModal from './ConfigModal';
import ConfirmDialog from './ConfirmDialog';
import { Task, MOCK_TASKS, GroupBy } from '../types';
import { generateProjectPlan } from '../services/geminiService';
import { saveTasksToFirebase, loadTasksFromFirebase, isFirebaseReady } from '../services/firebaseConfig';

interface ProjectBoardProps {
  projectId: string;
  onBack: () => void;
  useFirebase: boolean;
}

// Minimal types for URL compression
interface MinifiedAssignment {
  i: string; // id
  r: string; // role
  sl?: string; // subLabel
  s: string; // startDate
  e: string; // endDate
  p: number; // progress
  c: string; // color
}

interface MinifiedTask {
  i: string; // id
  n: string; // name
  a: MinifiedAssignment[]; // assignments
}

const ProjectBoard: React.FC<ProjectBoardProps> = ({ projectId, onBack, useFirebase }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false); // New State for Read Only

  const [filterText, setFilterText] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>(GroupBy.None);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Confirmation State
  const [confirmAction, setConfirmAction] = useState<{
    isOpen: boolean;
    type: 'DELETE_TASK' | 'RESET' | null;
    payload?: any;
  }>({ isOpen: false, type: null });

  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAiInput, setShowAiInput] = useState(false);

  const [notification, setNotification] = useState<{msg: string, type: 'success' | 'error' | 'info'} | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Data Compression Logic ---
  const minifyTasks = (taskList: Task[]): MinifiedTask[] => {
    return taskList.map(t => ({
      i: t.id,
      n: t.name,
      a: t.assignments.map(a => ({
        i: a.id,
        r: a.role,
        sl: a.subLabel,
        s: a.startDate,
        e: a.endDate,
        p: a.progress,
        c: a.color
      }))
    }));
  };

  const unminifyTasks = (minified: MinifiedTask[]): Task[] => {
    return minified.map(t => ({
      id: t.i,
      name: t.n,
      assignments: t.a.map(a => ({
        id: a.i,
        role: a.r,
        subLabel: a.sl || '',
        startDate: a.s,
        endDate: a.e,
        progress: a.p,
        color: a.c
      }))
    }));
  };

  const encodeData = (data: Task[]) => {
    try {
      const minified = minifyTasks(data);
      const json = JSON.stringify(minified);
      return btoa(unescape(encodeURIComponent(json)));
    } catch (e) { return ""; }
  };

  const decodeData = (str: string): Task[] | null => {
    try {
      const json = decodeURIComponent(escape(window.atob(str)));
      const parsed = JSON.parse(json);
      
      // Check if it's the new minified format (has 'n' and 'a' props)
      if (Array.isArray(parsed) && parsed.length > 0 && 'n' in parsed[0] && 'a' in parsed[0]) {
          return unminifyTasks(parsed as MinifiedTask[]);
      }
      // Fallback for old format
      if (Array.isArray(parsed)) {
          return parsed as Task[];
      }
      return null;
    } catch (e) { return null; }
  };
  // -----------------------------

  useEffect(() => {
    const initData = async () => {
      setIsLoaded(false);
      setIsReadOnly(false);

      const params = new URLSearchParams(window.location.search);
      const sharedData = params.get('data');
      
      // If data comes from URL, we treat it as a snapshot (Read Only)
      if (sharedData) {
        const parsedTasks = decodeData(sharedData);
        if (parsedTasks && Array.isArray(parsedTasks)) {
          setTasks(parsedTasks);
          setIsReadOnly(true); // Enable Read Only Mode
          setNotification({ msg: '您正在檢視唯讀的專案快照', type: 'info' });
          setIsLoaded(true);
          return;
        }
      }

      if (useFirebase && isFirebaseReady()) {
        try {
          setIsSyncing(true);
          const fbData = await loadTasksFromFirebase(projectId);
          setIsSyncing(false);
          if (fbData) {
            setTasks(fbData);
            setIsLoaded(true);
            return;
          }
        } catch (error: any) {
          setIsSyncing(false);
          const errString = error.toString();
          if (errString.includes('permission-denied')) {
             setNotification({ 
               msg: '錯誤：請至 Firebase Console 啟用 Firestore', 
               type: 'error' 
             });
          }
        }
      }

      const localKey = `smart_gantt_tasks_${projectId}`;
      const saved = localStorage.getItem(localKey);
      if (saved) {
        setTasks(JSON.parse(saved));
      } else {
        setTasks([]);
      }
      setIsLoaded(true);
    };

    initData();
  }, [projectId, useFirebase]);

  useEffect(() => {
    if (!isLoaded) return;
    
    // Do NOT auto-save if in Read Only mode
    if (isReadOnly) return;

    localStorage.setItem(`smart_gantt_tasks_${projectId}`, JSON.stringify(tasks));

    if (useFirebase && isFirebaseReady()) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      
      setIsSyncing(true);
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await saveTasksToFirebase(projectId, tasks);
          setIsSyncing(false);
        } catch (error) {
           setIsSyncing(false);
           console.error("Auto save failed", error);
        }
      }, 2000);
    }
  }, [tasks, isLoaded, projectId, useFirebase, isReadOnly]);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const filteredTasks = tasks.filter(t => {
    const matchName = t.name.toLowerCase().includes(filterText.toLowerCase());
    const matchRole = t.assignments.some(a => a.role.toLowerCase().includes(filterText.toLowerCase()));
    return matchName || matchRole;
  });

  const avgProgress = (() => {
      const totalAssignments = filteredTasks.reduce((acc, t) => acc + t.assignments.length, 0);
      const totalProgress = filteredTasks.reduce((acc, t) => {
        const taskTotal = t.assignments.reduce((sum, a) => sum + a.progress, 0);
        return acc + taskTotal;
      }, 0);
      return totalAssignments > 0 ? Math.round(totalProgress / totalAssignments) : 0;
  })();

  const handleTaskReorder = (newTasks: Task[]) => {
      if (isReadOnly) return;
      setTasks(newTasks);
  };

  const handleSaveTask = (task: Task) => {
    if (isReadOnly) return;

    // 1. Identify Role Color Changes from the task being saved
    const roleColorUpdates = new Map<string, string>();
    task.assignments.forEach(a => {
      if (a.role && a.color) {
         roleColorUpdates.set(a.role.trim().toLowerCase(), a.color);
      }
    });

    // 2. Update the specific task list (Create or Edit)
    let newTasks = editingTask
      ? tasks.map(t => t.id === task.id ? task : t)
      : [...tasks, task];

    // 3. Apply Global Color Sync
    if (roleColorUpdates.size > 0) {
      newTasks = newTasks.map(t => ({
        ...t,
        assignments: t.assignments.map(a => {
          const cleanRoleKey = a.role.trim().toLowerCase();
          if (roleColorUpdates.has(cleanRoleKey)) {
            const newColor = roleColorUpdates.get(cleanRoleKey);
            if (newColor && a.color !== newColor) {
              return { ...a, color: newColor };
            }
          }
          return a;
        })
      }));
    }

    setTasks(newTasks);
    setEditingTask(null);
    setNotification({ msg: '已儲存並同步角色顏色', type: 'success' });
  };

  const handleDeleteTaskClick = (id: string) => {
    if (isReadOnly) return;
    setConfirmAction({ isOpen: true, type: 'DELETE_TASK', payload: id });
  };

  const handleResetClick = () => {
    if (isReadOnly) return;
    setConfirmAction({ isOpen: true, type: 'RESET' });
  };

  const handleConfirmAction = () => {
    if (isReadOnly) return;
    if (confirmAction.type === 'DELETE_TASK') {
        setTasks(tasks.filter(t => t.id !== confirmAction.payload));
        setIsModalOpen(false);
        setEditingTask(null);
    } else if (confirmAction.type === 'RESET') {
        setTasks(MOCK_TASKS);
        setNotification({ msg: '資料已重置', type: 'success' });
    }
    setConfirmAction({ isOpen: false, type: null });
  };

  const handleShareProject = () => {
    // Check for Blob URL which prevents sharing
    if (window.location.protocol === 'blob:') {
        alert("⚠️ 注意：您目前處於預覽環境 (Blob URL)，產生的連結僅供本機測試，無法傳送給他人開啟。\n\n如需分享，請將專案部署至公開網頁伺服器 (如 Vercel, Netlify)。");
    }

    const encoded = encodeData(tasks);
    const url = new URL(window.location.href);
    url.searchParams.set('data', encoded);
    
    // Remove hash if present to avoid confusion
    const cleanUrl = url.toString().split('#')[0];
    
    navigator.clipboard.writeText(cleanUrl)
      .then(() => setNotification({ msg: '專案快照連結已複製！(若在預覽環境請勿分享)', type: 'success' }))
      .catch(() => setNotification({ msg: '複製失敗', type: 'error' }));
  };

  const handleGeneratePlan = async () => {
    if (isReadOnly) return;
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    try {
      const generatedTasks = await generateProjectPlan(aiPrompt);
      setTasks([...tasks, ...generatedTasks]);
      setShowAiInput(false);
      setAiPrompt('');
      setNotification({ msg: 'AI 已生成專案計畫！', type: 'success' });
    } catch (error) {
      setNotification({ msg: '生成失敗，請稍後再試。', type: 'error' });
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isLoaded) return <div className="p-10 flex justify-center text-gray-500">載入專案中...</div>;

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans">
      
      {notification && (
        <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[70] px-6 py-3 rounded-full shadow-lg text-white text-sm font-medium animate-fade-in-down ${
          notification.type === 'success' ? 'bg-emerald-600' : 
          notification.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
        }`}>
          {notification.msg}
        </div>
      )}

      {useFirebase && !isReadOnly && (
        <div className="fixed bottom-4 right-4 z-50 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-full shadow border border-gray-200 dark:border-gray-700 text-xs text-gray-500 flex items-center space-x-2">
           <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-yellow-400 animate-pulse' : 'bg-green-500'}`}></div>
           <span>{isSyncing ? '同步中...' : '已儲存'}</span>
        </div>
      )}

      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 z-30">
        <div className="max-w-screen-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
             <button 
                onClick={onBack}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="回到專案列表"
             >
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
             </button>
             <div className="flex flex-col">
               <h1 className="text-xl font-bold tracking-tight leading-none flex items-center">
                 Smart<span className="text-indigo-600">Gantt</span>
                 {isReadOnly && (
                    <span className="ml-2 px-2 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 border border-gray-200 dark:border-gray-600">
                      唯讀模式
                    </span>
                 )}
               </h1>
             </div>
          </div>
          
          <div className="flex items-center space-x-2 md:space-x-4">
             {/* Search */}
             <div className="relative hidden md:block">
                <input 
                  type="text" 
                  placeholder="搜尋功能..." 
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="pl-9 pr-4 py-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-48 transition-all"
                />
                <svg className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
             </div>

             {/* Group Toggle */}
             <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                <button 
                  onClick={() => setGroupBy(GroupBy.None)}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${groupBy === GroupBy.None ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
                >
                  依功能
                </button>
                <button 
                  onClick={() => setGroupBy(GroupBy.Assignee)}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${groupBy === GroupBy.Assignee ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
                >
                  依角色
                </button>
             </div>

             <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1 md:mx-2"></div>

             {/* Share Button (Available even in Read Only so they can reshare) */}
             <button 
               onClick={handleShareProject}
               className="flex items-center space-x-1 px-3 py-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-sm font-medium"
             >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                <span className="hidden md:inline">分享連結</span>
             </button>

             {/* Edit Actions: Hide in Read Only */}
             {!isReadOnly && (
               <>
                 <button 
                    onClick={() => setShowAiInput(!showAiInput)}
                    className="hidden md:flex items-center space-x-2 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium shadow-md"
                 >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    <span>AI 生成</span>
                 </button>

                 <button 
                    onClick={() => setIsConfigModalOpen(true)}
                    className="flex items-center justify-center p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title="設定雲端資料庫"
                 >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                 </button>

                 <button 
                    onClick={() => { setEditingTask(null); setIsModalOpen(true); }}
                    className="flex items-center space-x-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium shadow-md"
                 >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    <span className="hidden sm:inline">新增</span>
                 </button>
               </>
             )}
          </div>
        </div>
      </header>

      {/* AI Prompt Bar */}
      {showAiInput && !isReadOnly && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800/50 p-4 animate-fade-in-down">
           <div className="max-w-3xl mx-auto flex gap-3">
              <input 
                type="text" 
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="例如：'規劃公司尾牙'"
                className="flex-1 px-4 py-2 rounded-lg border border-indigo-200 dark:border-indigo-700 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 outline-none"
                onKeyDown={(e) => e.key === 'Enter' && handleGeneratePlan()}
              />
              <button 
                onClick={handleGeneratePlan}
                disabled={isGenerating}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center"
              >
                {isGenerating ? '生成中...' : '生成'}
              </button>
           </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-hidden p-4">
        <div className="h-full flex flex-col">
          {/* Stats Bar */}
          <div className="mb-4 flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400 items-center justify-between">
             <div className="flex gap-4">
                <div className="bg-white dark:bg-gray-800 px-3 py-1 rounded border border-gray-200 dark:border-gray-700 shadow-sm">
                    功能: <strong className="text-gray-900 dark:text-white">{filteredTasks.length}</strong>
                </div>
                <div className="bg-white dark:bg-gray-800 px-3 py-1 rounded border border-gray-200 dark:border-gray-700 shadow-sm">
                    進度: <strong className="text-emerald-600">{avgProgress}%</strong>
                </div>
             </div>
             
             {!isReadOnly && (
                <button 
                  onClick={handleResetClick}
                  className="text-xs text-gray-400 hover:text-red-500 underline decoration-dotted"
                >
                  重置
                </button>
             )}
          </div>

          <GanttChart 
            tasks={filteredTasks} 
            groupBy={groupBy}
            onTaskReorder={handleTaskReorder}
            onTaskClick={(task) => {
              setEditingTask(task);
              setIsModalOpen(true);
            }} 
            readOnly={isReadOnly}
          />
        </div>
      </main>

      <TaskModal 
        isOpen={isModalOpen}
        initialData={editingTask}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTask(null);
        }}
        onSave={handleSaveTask}
        readOnly={isReadOnly}
      />

      <ConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
      />
      
      {/* Action Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmAction.isOpen}
        title={confirmAction.type === 'DELETE_TASK' ? '刪除功能' : '重置專案'}
        message={confirmAction.type === 'DELETE_TASK' ? '確定要刪除此功能及其所有角色時程嗎？' : '確定要重置此專案為範例資料嗎？此動作無法復原。'}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction({ isOpen: false, type: null })}
        isDangerous={true}
        confirmLabel="確定執行"
      />

      {editingTask && isModalOpen && !isReadOnly && (
        <div className="fixed bottom-6 left-6 z-[60]">
           <button 
             onClick={() => handleDeleteTaskClick(editingTask.id)}
             className="bg-red-500 hover:bg-red-600 text-white p-3 rounded-full shadow-lg transition-transform hover:scale-105 flex items-center justify-center"
           >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
               <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
             </svg>
           </button>
        </div>
      )}

    </div>
  );
};

export default ProjectBoard;
