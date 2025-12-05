
import React, { useState, useEffect } from 'react';
import { ProjectMetadata, MOCK_TASKS, Task } from '../types';
import { fetchProjects, createProject, deleteProject, updateProjectMetadata, isFirebaseReady, loadTasksFromFirebase } from '../services/firebaseConfig';
import ImportModal from './ImportModal';
import ConfirmDialog from './ConfirmDialog';

interface ProjectListProps {
  onOpenProject: (projectId: string) => void;
  useFirebase: boolean;
}

const LOCAL_PROJECTS_KEY = 'smart_gantt_projects_list';

const ProjectList: React.FC<ProjectListProps> = ({ onOpenProject, useFirebase }) => {
  const [projects, setProjects] = useState<ProjectMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  
  // Confirmation State
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string | null }>({ isOpen: false, id: null });
  
  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');

  useEffect(() => {
    loadProjects();
  }, [useFirebase]);

  const loadProjects = async () => {
    setIsLoading(true);
    if (useFirebase && isFirebaseReady()) {
      try {
        const list = await fetchProjects();
        setProjects(list);
      } catch (e) {
        console.error("Failed to load projects from cloud", e);
      }
    } else {
      // Load from LocalStorage
      const saved = localStorage.getItem(LOCAL_PROJECTS_KEY);
      if (saved) {
        setProjects(JSON.parse(saved));
      } else {
        const defaultProject: ProjectMetadata = {
            id: 'default-local-project',
            name: '範例專案',
            description: '這是您的本機範例專案',
            lastUpdated: new Date().toISOString(),
            taskCount: MOCK_TASKS.length
        };
        setProjects([defaultProject]);
        localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify([defaultProject]));
        localStorage.setItem('smart_gantt_tasks_default-local-project', JSON.stringify(MOCK_TASKS));
      }
    }
    setIsLoading(false);
  };

  const openCreateModal = () => {
    setModalMode('create');
    setEditingId(null);
    setFormName('');
    setFormDesc('');
    setIsModalOpen(true);
  };

  const openEditModal = (project: ProjectMetadata, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the project
    e.preventDefault();
    setModalMode('edit');
    setEditingId(project.id);
    setFormName(project.name);
    setFormDesc(project.description);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    if (modalMode === 'create') {
        await handleCreate();
    } else {
        await handleUpdate();
    }
  };

  const handleCreate = async () => {
    const newProject: ProjectMetadata = {
      id: crypto.randomUUID(),
      name: formName,
      description: formDesc,
      lastUpdated: new Date().toISOString(),
      taskCount: 0
    };

    try {
      if (useFirebase && isFirebaseReady()) {
        await createProject(newProject, []);
      } else {
        const updatedList = [...projects, newProject];
        localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(updatedList));
        localStorage.setItem(`smart_gantt_tasks_${newProject.id}`, JSON.stringify([]));
      }
      
      setProjects([...projects, newProject]);
      setIsModalOpen(false);
    } catch (e) {
      alert("建立專案失敗");
    }
  };

  const handleUpdate = async () => {
    if (!editingId) return;

    try {
      if (useFirebase && isFirebaseReady()) {
        await updateProjectMetadata(editingId, formName, formDesc);
      } else {
        const updatedList = projects.map(p => 
            p.id === editingId 
                ? { ...p, name: formName, description: formDesc, lastUpdated: new Date().toISOString() }
                : p
        );
        localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(updatedList));
        setProjects(updatedList);
      }
      
      // Update local state if not already handled
      setProjects(prev => prev.map(p => 
        p.id === editingId 
            ? { ...p, name: formName, description: formDesc, lastUpdated: new Date().toISOString() }
            : p
      ));
      
      setIsModalOpen(false);
    } catch (e) {
      alert("更新專案失敗");
    }
  };

  const handleImport = async (projectName: string, importedTasks: Task[]) => {
      const newProject: ProjectMetadata = {
        id: crypto.randomUUID(),
        name: projectName,
        description: `匯入自外部資料，共 ${importedTasks.length} 個功能`,
        lastUpdated: new Date().toISOString(),
        taskCount: importedTasks.length
      };

      try {
        if (useFirebase && isFirebaseReady()) {
          await createProject(newProject, importedTasks);
        } else {
          const updatedList = [...projects, newProject];
          localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(updatedList));
          localStorage.setItem(`smart_gantt_tasks_${newProject.id}`, JSON.stringify(importedTasks));
        }
        
        setProjects([...projects, newProject]);
      } catch (e) {
        alert("匯入專案失敗");
      }
  };

  const handleDuplicate = async (project: ProjectMetadata, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const newId = crypto.randomUUID();
    const newName = `${project.name} (副本)`;
    
    // Create Metadata
    const newProject: ProjectMetadata = {
        ...project,
        id: newId,
        name: newName,
        lastUpdated: new Date().toISOString()
    };

    // Optimistic UI update
    const previousProjects = [...projects];
    setProjects([...projects, newProject]);

    try {
        let tasksToCopy: Task[] = [];
        
        if (useFirebase && isFirebaseReady()) {
            // Fetch tasks from Firebase source
            const tasks = await loadTasksFromFirebase(project.id);
            tasksToCopy = tasks || [];
            await createProject(newProject, tasksToCopy);
        } else {
            // Fetch tasks from LocalStorage source
            const storedTasks = localStorage.getItem(`smart_gantt_tasks_${project.id}`);
            tasksToCopy = storedTasks ? JSON.parse(storedTasks) : [];
            
            const updatedList = [...projects, newProject];
            localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(updatedList));
            localStorage.setItem(`smart_gantt_tasks_${newId}`, JSON.stringify(tasksToCopy));
        }
    } catch (error) {
        console.error("Duplicate failed", error);
        alert("複製失敗");
        setProjects(previousProjects); // Rollback
        loadProjects(); // Reload to ensure consistency
    }
  };

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    // Stop propagation to prevent card click
    e.stopPropagation();
    e.preventDefault();
    setDeleteConfirm({ isOpen: true, id });
  };

  const executeDelete = async () => {
    const id = deleteConfirm.id;
    if (!id) return;
    setDeleteConfirm({ isOpen: false, id: null });
    
    // Optimistic Update: Immediately remove from UI
    const previousProjects = [...projects];
    setProjects(prevProjects => prevProjects.filter(p => p.id !== id));

    try {
      if (useFirebase && isFirebaseReady()) {
        await deleteProject(id);
      } else {
        // Local Deletion Logic
        const currentStored = localStorage.getItem(LOCAL_PROJECTS_KEY);
        if (currentStored) {
            const list = JSON.parse(currentStored) as ProjectMetadata[];
            const newList = list.filter(p => p.id !== id);
            localStorage.setItem(LOCAL_PROJECTS_KEY, JSON.stringify(newList));
        }
        // Also remove the tasks data
        localStorage.removeItem(`smart_gantt_tasks_${id}`);
      }
    } catch (e) {
      console.error(e);
      alert("刪除失敗，請檢查網路連線或資料庫權限。");
      setProjects(previousProjects); // Rollback on error
      loadProjects();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">我的專案</h2>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              {useFirebase ? '雲端同步模式' : '本機模式'}
            </p>
          </div>
          <div className="flex space-x-3">
            <button 
                onClick={() => setIsImporting(true)}
                className="bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 px-4 py-2.5 rounded-lg shadow-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center transition-colors"
            >
                <svg className="w-5 h-5 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                匯入專案
            </button>
            <button 
                onClick={openCreateModal}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg shadow-lg font-medium transition-transform hover:scale-105 flex items-center"
            >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                新專案
            </button>
          </div>
        </div>

        {/* Create/Edit Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
             <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6 animate-fade-in-up">
                <h3 className="text-xl font-bold mb-4 dark:text-white">
                    {modalMode === 'create' ? '建立新專案' : '編輯專案'}
                </h3>
                <form onSubmit={handleSubmit}>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">專案名稱</label>
                    <input 
                      autoFocus
                      type="text" 
                      required
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">描述 (選填)</label>
                    <textarea 
                      value={formDesc}
                      onChange={e => setFormDesc(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="flex justify-end space-x-3">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">取消</button>
                    <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                        {modalMode === 'create' ? '建立' : '儲存'}
                    </button>
                  </div>
                </form>
             </div>
          </div>
        )}

        {/* Import Modal */}
        <ImportModal 
            isOpen={isImporting} 
            onClose={() => setIsImporting(false)} 
            onImport={handleImport}
        />
        
        {/* Confirm Delete Dialog */}
        <ConfirmDialog
            isOpen={deleteConfirm.isOpen}
            title="刪除專案"
            message="確定要刪除此專案嗎？此動作無法復原。"
            onConfirm={executeDelete}
            onCancel={() => setDeleteConfirm({ isOpen: false, id: null })}
            isDangerous={true}
            confirmLabel="確認刪除"
        />

        {isLoading ? (
          <div className="flex justify-center py-20">
             <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map(project => (
              <div 
                key={project.id}
                className="group relative bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-xl hover:border-indigo-300 dark:hover:border-indigo-700 transition-all"
              >
                {/* 1. Main Clickable Body */}
                <div 
                  onClick={() => onOpenProject(project.id)}
                  className="p-6 h-full cursor-pointer"
                >
                  <div className="flex items-center mb-4">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold shadow-md flex-shrink-0">
                      {project.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="ml-4 overflow-hidden">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">{project.name}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(project.lastUpdated).toLocaleDateString('zh-TW')} 更新
                      </p>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-4 h-10 line-clamp-2">
                    {project.description || '沒有描述...'}
                  </p>

                  <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-gray-700">
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300">
                      {project.taskCount} 項功能
                    </span>
                    <span className="text-indigo-600 dark:text-indigo-400 text-sm font-medium group-hover:underline flex items-center">
                      開啟看板 <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    </span>
                  </div>
                </div>

                {/* 2. Actions: Edit, Duplicate and Delete */}
                <div className="absolute top-4 right-4 z-50 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2">
                  <button 
                    onClick={(e) => openEditModal(project, e)}
                    className="p-2 bg-white/80 dark:bg-gray-800/80 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-full transition-colors cursor-pointer shadow-sm border border-transparent hover:border-blue-100"
                    title="編輯專案名稱與描述"
                    type="button"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>

                  <button 
                    onClick={(e) => handleDuplicate(project, e)}
                    className="p-2 bg-white/80 dark:bg-gray-800/80 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-full transition-colors cursor-pointer shadow-sm border border-transparent hover:border-indigo-100"
                    title="複製專案"
                    type="button"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                  </button>

                  <button 
                    onClick={(e) => handleDeleteClick(project.id, e)}
                    className="p-2 bg-white/80 dark:bg-gray-800/80 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full transition-colors cursor-pointer shadow-sm border border-transparent hover:border-red-100"
                    title="刪除專案"
                    type="button"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>

              </div>
            ))}

            {projects.length === 0 && (
                <div 
                    onClick={openCreateModal}
                    className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl hover:border-indigo-500 dark:hover:border-indigo-500 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors text-gray-400 dark:text-gray-500 min-h-[200px]"
                >
                    <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                    <span className="font-medium">建立第一個專案</span>
                </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectList;
