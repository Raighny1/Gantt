
import React, { useState, useEffect } from 'react';
import { Task, TaskAssignment, TAILWIND_COLORS, getColorForRole } from '../types';
import { calculateWorkingDays } from './DateUtils';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Task) => void;
  initialData?: Task | null;
  readOnly?: boolean;
}

const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, onSave, initialData, readOnly = false }) => {
  const [name, setName] = useState('');
  const [assignments, setAssignments] = useState<TaskAssignment[]>([]);

  // Smart split helper
  const processAssignmentRole = (roleStr: string, currentSubLabel: string) => {
    let role = roleStr;
    let subLabel = currentSubLabel;

    // Only attempt split if subLabel is currently empty or looks like it belongs to the role string
    if (!subLabel) {
        const bracketMatch = role.match(/^\[(.*?)(?:\]|】)\s*(.*)/);
        if (bracketMatch) {
            role = bracketMatch[1].trim();
            subLabel = bracketMatch[2].trim();
        } 
        else if (role.includes(' - ')) {
            const parts = role.split(' - ');
            role = parts[0].trim();
            subLabel = parts.slice(1).join(' - ').trim();
        }
    }
    
    return { role, subLabel };
  };

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setName(initialData.name);
        
        // Process existing data to fix any un-split roles
        const processedAssignments = initialData.assignments.map(a => {
            const { role, subLabel } = processAssignmentRole(a.role, a.subLabel || '');
            return { 
                ...a, 
                role,
                subLabel,
                color: a.color || getColorForRole(role) // Use existing color if available, else default
            };
        });

        setAssignments(processedAssignments);
      } else {
        const today = new Date().toISOString().split('T')[0];
        setName('');
        setAssignments([
          {
            id: crypto.randomUUID(),
            role: '',
            subLabel: '',
            startDate: today,
            endDate: today,
            progress: 0,
            color: TAILWIND_COLORS[0]
          }
        ]);
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleAddAssignment = () => {
    if (readOnly) return;
    const today = new Date().toISOString().split('T')[0];
    const lastAssignment = assignments[assignments.length - 1];
    const baseDate = lastAssignment ? lastAssignment.endDate : today;
    
    setAssignments([
      ...assignments,
      {
        id: crypto.randomUUID(),
        role: '',
        subLabel: '',
        startDate: baseDate,
        endDate: baseDate,
        progress: 0,
        color: TAILWIND_COLORS[assignments.length % TAILWIND_COLORS.length]
      }
    ]);
  };

  const handleRemoveAssignment = (id: string) => {
    if (readOnly) return;
    if (assignments.length > 1) {
      setAssignments(assignments.filter(a => a.id !== id));
    }
  };

  const updateAssignment = (id: string, field: keyof TaskAssignment, value: any) => {
    if (readOnly) return;
    setAssignments(assignments.map(a => {
        if (a.id === id) {
            let updated = { ...a, [field]: value };
            
            // Special logic for Role field change
            if (field === 'role') {
                const { role, subLabel } = processAssignmentRole(value as string, a.subLabel || '');
                updated.role = role;
                // Only update subLabel if we actually extracted something new
                if (subLabel !== (a.subLabel || '')) {
                    updated.subLabel = subLabel;
                }
                // When role changes, we reset color to default for that role
                updated.color = getColorForRole(role);
            }
            
            return updated;
        }
        return a;
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    
    const validAssignments = assignments.map(a => ({
      ...a,
      role: a.role.trim() || '未指派',
      // We removed the forced getColorForRole here to allow custom color selections to persist
      color: a.color 
    }));

    onSave({
      id: initialData?.id || crypto.randomUUID(),
      name,
      assignments: validAssignments
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl animate-fade-in-up flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 rounded-t-xl">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {readOnly ? '檢視功能詳情' : (initialData ? '編輯功能與時程' : '新增功能與時程')}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {readOnly ? '唯讀模式：無法修改內容' : '為單一功能設定多個角色的獨立時程'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Feature Name */}
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-2">
              功能名稱 (Feature Name)
            </label>
            <input
              type="text"
              required
              disabled={readOnly}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none text-lg font-medium disabled:opacity-60 disabled:cursor-not-allowed"
              placeholder="例如：會員中心改版"
            />
          </div>

          {/* Assignments List */}
          <div>
            <div className="flex justify-between items-end mb-3">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-200">
                角色分派與時程
              </label>
              {!readOnly && (
                <button
                    type="button"
                    onClick={handleAddAssignment}
                    className="text-sm px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors font-medium flex items-center"
                >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    新增角色
                </button>
              )}
            </div>

            <div className="space-y-3">
              {assignments.map((assign, index) => {
                const workDays = calculateWorkingDays(assign.startDate, assign.endDate);
                
                return (
                  <div key={assign.id} className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:shadow-md transition-shadow relative group">
                    
                    {/* Remove Button */}
                    {!readOnly && assignments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveAssignment(assign.id)}
                        className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        title="移除此列"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                      
                      {/* Role Name */}
                      <div className="lg:col-span-2">
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">負責角色 (Role)</label>
                        <input
                          type="text"
                          disabled={readOnly}
                          value={assign.role}
                          onChange={(e) => updateAssignment(assign.id, 'role', e.target.value)}
                          placeholder="如: UI (支援貼上 [UI] 標題)"
                          className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-1 focus:ring-indigo-500 font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                      </div>

                      {/* SubLabel (Task Details) */}
                      <div className="lg:col-span-3">
                        <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">負責事項 (Item)</label>
                        <input
                          type="text"
                          disabled={readOnly}
                          value={assign.subLabel || ''}
                          onChange={(e) => updateAssignment(assign.id, 'subLabel', e.target.value)}
                          placeholder="如: 畫面設計"
                          className="w-full px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-1 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                      </div>

                      {/* Date Range */}
                      <div className="lg:col-span-4 grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">開始</label>
                          <input
                            type="date"
                            disabled={readOnly}
                            value={assign.startDate}
                            onChange={(e) => updateAssignment(assign.id, 'startDate', e.target.value)}
                            className="w-full px-2 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-1 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">結束</label>
                          <input
                            type="date"
                            disabled={readOnly}
                            value={assign.endDate}
                            min={assign.startDate}
                            onChange={(e) => updateAssignment(assign.id, 'endDate', e.target.value)}
                            className="w-full px-2 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-1 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                        </div>
                      </div>

                      {/* Work Days (Replaces Progress Slider) */}
                      <div className="lg:col-span-2 flex flex-col justify-center items-center">
                         <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">工期</label>
                         <span className="inline-flex items-center justify-center px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-sm font-bold w-full">
                            {workDays} 天
                         </span>
                      </div>

                      {/* Color Picker */}
                      <div className="lg:col-span-1 flex justify-center items-center pt-5 lg:pt-0">
                        <div className="relative group/color">
                           <button
                             type="button"
                             disabled={readOnly}
                             className={`w-8 h-8 rounded-full ${assign.color} ring-2 ring-white dark:ring-gray-800 shadow-sm transition-transform ${!readOnly && 'hover:scale-110 cursor-pointer'} ${readOnly && 'cursor-default'}`}
                             title={readOnly ? '角色顏色' : "點擊更換顏色 (已自動依角色配色)"}
                           />
                           {/* Only show picker if not Read Only */}
                           {!readOnly && (
                               <div className="absolute right-0 top-full pt-2 hidden group-hover/color:block z-50 w-32">
                                   <div className="p-2 bg-white dark:bg-gray-700 rounded-lg shadow-xl grid grid-cols-4 gap-1 border border-gray-200 dark:border-gray-600">
                                      {TAILWIND_COLORS.map(c => (
                                        <button
                                          key={c}
                                          type="button"
                                          onClick={() => updateAssignment(assign.id, 'color', c)}
                                          className={`w-6 h-6 rounded-full ${c} hover:scale-110 transition-transform`}
                                        />
                                      ))}
                                   </div>
                               </div>
                           )}
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium transition-colors"
          >
            {readOnly ? '關閉' : '取消'}
          </button>
          
          {!readOnly && (
            <button
                onClick={handleSubmit}
                type="button"
                className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-lg shadow-indigo-500/30 transition-all transform hover:scale-[1.02]"
            >
                儲存設定
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskModal;
