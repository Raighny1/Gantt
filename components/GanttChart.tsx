
import React, { useMemo, useState, useEffect } from 'react';
import { Task, GroupBy, TaskAssignment } from '../types';
import { getDaysArray, getDayName, calculateWorkingDays, isHoliday, getWeekNumber, addDaysToDate, calculateEndDate } from './DateUtils';

interface GanttChartProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onTaskReorder?: (newTasks: Task[]) => void;
  groupBy: GroupBy;
  readOnly?: boolean;
}

interface DragState {
  type: 'TASK' | 'ASSIGNMENT';
  id: string; // Task ID or Assignment ID
  parentId?: string; // Only for Assignments (Task ID)
}

interface BarDragState {
  assignmentId: string;
  parentId: string;
  startX: number;
  originalStart: string;
  originalEnd: string;
  originalWorkingDays: number;
  currentStart: string;
  currentEnd: string;
  hasMoved: boolean; // Flag to distinguish click vs drag
  taskReference: Task; // Store reference to open modal on click
}

const DAY_WIDTH = 50;
const LEFT_COL_WIDTH = 380;
const HEADER_HEIGHT = 88; 

// Internal interface for the flattened rows we render
interface RenderRow {
  uniqueId: string;
  label: string;
  subLabel?: string;
  isHeader: boolean;
  
  // Data for bar
  startDate?: string;
  endDate?: string;
  progress?: number;
  color?: string;
  
  // Reference to original data
  originalTask: Task;
  originalAssignment?: TaskAssignment;
}

const GanttChart: React.FC<GanttChartProps> = ({ tasks, onTaskClick, onTaskReorder, groupBy, readOnly = false }) => {
  // State for Row Reordering
  const [draggedItem, setDraggedItem] = useState<DragState | null>(null);
  
  // State for Bar Rescheduling (Horizontal Drag)
  const [draggedBar, setDraggedBar] = useState<BarDragState | null>(null);

  // 1. Calculate Global Date Range
  const { minDate, dates } = useMemo(() => {
    let allAssignments: TaskAssignment[] = [];
    tasks.forEach(t => allAssignments.push(...t.assignments));

    if (allAssignments.length === 0) {
      const start = new Date();
      start.setDate(start.getDate() - 2);
      const end = new Date();
      end.setDate(end.getDate() + 14);
      return { minDate: start, dates: getDaysArray(start, end) };
    }

    const startDates = allAssignments.map(a => new Date(a.startDate).getTime());
    const endDates = allAssignments.map(a => new Date(a.endDate).getTime());
    
    let min = new Date(Math.min(...startDates));
    min.setDate(min.getDate() - 3); // Buffer before
    
    let max = new Date(Math.max(...endDates));
    max.setDate(max.getDate() + 7); // Buffer after

    return {
      minDate: min,
      dates: getDaysArray(min, max)
    };
  }, [tasks]);

  // 2. Calculate Week Chunks for Header
  const weekChunks = useMemo(() => {
    const chunks: { week: number, year: number, days: number }[] = [];
    if (dates.length === 0) return chunks;

    let currentChunk = { 
        week: getWeekNumber(dates[0]), 
        year: dates[0].getFullYear(),
        days: 0 
    };

    dates.forEach((date) => {
        const w = getWeekNumber(date);
        const y = date.getFullYear();
        
        // If week number changes, push old chunk and start new
        if (w !== currentChunk.week) {
            chunks.push(currentChunk);
            currentChunk = { week: w, year: y, days: 0 };
        }
        currentChunk.days++;
    });
    chunks.push(currentChunk);
    return chunks;
  }, [dates]);

  // Handle Global Mouse Move/Up for Bar Dragging
  useEffect(() => {
    if (!draggedBar) return;

    const handleMouseMove = (e: MouseEvent) => {
        if (readOnly) return;
        const deltaX = e.clientX - draggedBar.startX;
        const deltaDays = Math.round(deltaX / DAY_WIDTH);

        if (deltaDays === 0) return;

        // If we have moved, mark as moved so mouseUp knows it's a drag, not a click
        const newStartDate = addDaysToDate(draggedBar.originalStart, deltaDays);
        
        let newEndDate;
        if (draggedBar.originalWorkingDays > 0) {
            newEndDate = calculateEndDate(newStartDate, draggedBar.originalWorkingDays);
        } else {
            newEndDate = addDaysToDate(draggedBar.originalEnd, deltaDays);
        }

        setDraggedBar(prev => prev ? {
            ...prev,
            hasMoved: true, // Mark as moved
            currentStart: newStartDate,
            currentEnd: newEndDate
        } : null);
    };

    const handleMouseUp = () => {
        if (draggedBar) {
            if (!draggedBar.hasMoved) {
                // It was a click!
                onTaskClick(draggedBar.taskReference);
            } else if (onTaskReorder && !readOnly) {
                // It was a drag, save changes
                const taskIndex = tasks.findIndex(t => t.id === draggedBar.parentId);
                if (taskIndex !== -1) {
                    const task = tasks[taskIndex];
                    const newAssignments = task.assignments.map(a => {
                        if (a.id === draggedBar.assignmentId) {
                            return {
                                ...a,
                                startDate: draggedBar.currentStart,
                                endDate: draggedBar.currentEnd
                            };
                        }
                        return a;
                    });
                    
                    const newTasks = [...tasks];
                    newTasks[taskIndex] = { ...task, assignments: newAssignments };
                    onTaskReorder(newTasks);
                }
            }
        }
        setDraggedBar(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggedBar, tasks, onTaskReorder, onTaskClick, readOnly]);


  // 3. Process Data for Rendering based on GroupBy
  const rows: RenderRow[] = useMemo(() => {
    const result: RenderRow[] = [];

    if (groupBy === GroupBy.None) {
      tasks.forEach(task => {
        result.push({
          uniqueId: `feature-${task.id}`,
          label: task.name,
          isHeader: true,
          originalTask: task
        });

        task.assignments.forEach(assign => {
          const isDragging = draggedBar && draggedBar.assignmentId === assign.id;
          
          result.push({
            uniqueId: `assign-${assign.id}`,
            label: assign.role || '未指派', 
            subLabel: assign.subLabel || '',
            isHeader: false,
            startDate: isDragging ? draggedBar.currentStart : assign.startDate,
            endDate: isDragging ? draggedBar.currentEnd : assign.endDate,
            progress: assign.progress,
            color: assign.color,
            originalTask: task,
            originalAssignment: assign
          });
        });
      });

    } else {
      const groups: Record<string, Array<{task: Task, assign: TaskAssignment}>> = {};
      
      const addToGroup = (groupName: string, item: {task: Task, assign: TaskAssignment}) => {
        if (!groups[groupName]) groups[groupName] = [];
        groups[groupName].push(item);
      };

      tasks.forEach(task => {
        task.assignments.forEach(assign => {
          const rawRole = assign.role || '未指派';
          const r = rawRole.trim().toUpperCase();
          
          if (r === 'RD') {
             addToGroup('FE', { task, assign });
             addToGroup('BE', { task, assign });
          } else if (r === 'ALL' || r === '全體') {
             ['FE', 'BE', 'UI', 'UX', 'PM'].forEach(targetRole => {
                addToGroup(targetRole, { task, assign });
             });
          } else {
             addToGroup(rawRole.trim(), { task, assign });
          }
        });
      });

      const sortedKeys = Object.keys(groups).sort((a, b) => {
         const cleanA = a.trim();
         const cleanB = b.trim();
         const priorityRoles = ['內部最後階段', 'Last Phase', 'PM', 'UI', 'UX', 'FE', 'BE', 'QA', 'RD'];
         
         const idxA = priorityRoles.findIndex(p => p.toLowerCase() === cleanA.toLowerCase());
         const idxB = priorityRoles.findIndex(p => p.toLowerCase() === cleanB.toLowerCase());

         if (idxA !== -1 && idxB !== -1) return idxA - idxB;
         if (idxA !== -1) return -1;
         if (idxB !== -1) return 1;

         const numA = cleanA.match(/^(\d+)/);
         const numB = cleanB.match(/^(\d+)/);

         if (numA && numB) return parseInt(numA[1]) - parseInt(numB[1]);
         if (numA) return -1;
         if (numB) return 1;

         return cleanA.localeCompare(cleanB, 'zh-TW');
      });

      sortedKeys.forEach((roleName) => {
        const items = groups[roleName];
        if (items.length === 0) return;

        result.push({
          uniqueId: `role-group-${roleName}`,
          label: roleName,
          subLabel: `${items.length} 項任務`,
          isHeader: true,
          originalTask: items[0].task // fallback
        });

        items.forEach(({ task, assign }) => {
          const r = (assign.role || '').toUpperCase();
          const isSpecial = r === 'RD' || r === 'ALL' || r === '全體';
          const prefix = isSpecial ? `[${assign.role}] ` : '';
          const displayLabel = `${prefix}${task.name}`;
          
          const isDragging = draggedBar && draggedBar.assignmentId === assign.id;

          result.push({
            uniqueId: `role-item-${roleName}-${assign.id}-${Math.random()}`, 
            label: displayLabel, 
            subLabel: assign.subLabel || '',
            isHeader: false,
            startDate: isDragging ? draggedBar.currentStart : assign.startDate,
            endDate: isDragging ? draggedBar.currentEnd : assign.endDate,
            progress: assign.progress,
            color: assign.color,
            originalTask: task,
            originalAssignment: assign
          });
        });
      });
    }

    return result;
  }, [tasks, groupBy, draggedBar]);

  const getOffset = (dateStr: string) => {
    const d = new Date(dateStr);
    const diffTime = d.getTime() - minDate.getTime();
    const days = diffTime / (1000 * 3600 * 24);
    return days * DAY_WIDTH;
  };

  const getWidth = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    const diff = (e.getTime() - s.getTime()) / (1000 * 3600 * 24) + 1;
    return diff * DAY_WIDTH;
  };

  const handleDragStart = (e: React.DragEvent, row: RenderRow) => {
      if (readOnly || draggedBar) {
          e.preventDefault();
          return;
      }
      if (row.isHeader) {
          setDraggedItem({ type: 'TASK', id: row.originalTask.id });
      } else if (row.originalAssignment) {
          setDraggedItem({ 
              type: 'ASSIGNMENT', 
              id: row.originalAssignment.id, 
              parentId: row.originalTask.id 
          });
      }
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault(); 
      e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetRow: RenderRow) => {
      e.preventDefault();
      if (readOnly || !draggedItem || !onTaskReorder) return;

      if (draggedItem.type === 'TASK' && targetRow.isHeader) {
          if (draggedItem.id === targetRow.originalTask.id) return;
          const fromIndex = tasks.findIndex(t => t.id === draggedItem.id);
          const toIndex = tasks.findIndex(t => t.id === targetRow.originalTask.id);
          if (fromIndex === -1 || toIndex === -1) return;

          const newTasks = [...tasks];
          const [removed] = newTasks.splice(fromIndex, 1);
          newTasks.splice(toIndex, 0, removed);
          onTaskReorder(newTasks);
      } 
      else if (draggedItem.type === 'ASSIGNMENT' && !targetRow.isHeader && targetRow.originalAssignment) {
          if (draggedItem.parentId !== targetRow.originalTask.id) return;
          if (draggedItem.id === targetRow.originalAssignment.id) return;

          const taskIndex = tasks.findIndex(t => t.id === draggedItem.parentId);
          if (taskIndex === -1) return;

          const task = tasks[taskIndex];
          const assignments = [...task.assignments];
          const fromIndex = assignments.findIndex(a => a.id === draggedItem.id);
          const toIndex = assignments.findIndex(a => a.id === targetRow.originalAssignment!.id);

          if (fromIndex === -1 || toIndex === -1) return;

          const [removed] = assignments.splice(fromIndex, 1);
          assignments.splice(toIndex, 0, removed);

          const updatedTask = { ...task, assignments };
          const newTasks = [...tasks];
          newTasks[taskIndex] = updatedTask;
          onTaskReorder(newTasks);
      }
      setDraggedItem(null);
  };

  const handleBarMouseDown = (e: React.MouseEvent, row: RenderRow) => {
     if (!row.originalAssignment || !row.startDate || !row.endDate) return;
     
     // IMPORTANT: Stop propagation to prevent row drag start or other events, 
     // BUT we handle the "click" logic manually in mouseUp.
     e.stopPropagation();

     if (readOnly) {
         // Just a click, no drag logic, but wait for mouse up to trigger click event
         const workingDays = calculateWorkingDays(row.startDate, row.endDate);
         setDraggedBar({
             assignmentId: row.originalAssignment.id,
             parentId: row.originalTask.id,
             startX: e.clientX,
             originalStart: row.startDate,
             originalEnd: row.endDate,
             originalWorkingDays: workingDays,
             currentStart: row.startDate,
             currentEnd: row.endDate,
             hasMoved: false,
             taskReference: row.originalTask
         });
         return;
     }

     const workingDays = calculateWorkingDays(row.startDate, row.endDate);
     
     setDraggedBar({
         assignmentId: row.originalAssignment.id,
         parentId: row.originalTask.id,
         startX: e.clientX,
         originalStart: row.startDate,
         originalEnd: row.endDate,
         originalWorkingDays: workingDays,
         currentStart: row.startDate,
         currentEnd: row.endDate,
         hasMoved: false, // Initial state: hasn't moved yet (it's a click so far)
         taskReference: row.originalTask
     });
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 rounded-xl shadow-inner border border-gray-200 dark:border-gray-700 overflow-hidden">
      
      <div className="overflow-x-auto overflow-y-auto flex-1 relative custom-scrollbar">
        <div style={{ width: `${dates.length * DAY_WIDTH + LEFT_COL_WIDTH}px` }} className="min-w-full">
          
          <div className="sticky top-0 z-30 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex h-[88px]">
            <div 
              className="sticky left-0 z-40 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4 font-semibold text-gray-700 dark:text-gray-200 flex items-center shadow-md h-full"
              style={{ width: `${LEFT_COL_WIDTH}px` }}
            >
              {groupBy === GroupBy.None ? '功能 / 角色' : '角色 / 功能任務'}
              {groupBy === GroupBy.None && !readOnly && <span className="text-xs text-gray-400 ml-2 font-normal">(可拖曳排序)</span>}
            </div>

            <div className="flex flex-col">
                <div className="flex h-8">
                    {weekChunks.map((chunk, i) => (
                        <div 
                            key={`wk-${i}`}
                            className="flex items-center justify-center bg-indigo-600 border-r border-indigo-500 text-white text-xs font-bold tracking-wider"
                            style={{ width: `${chunk.days * DAY_WIDTH}px` }}
                        >
                            WEEK {chunk.week}
                        </div>
                    ))}
                </div>
                <div className="flex h-[56px]">
                  {dates.map((date, i) => {
                     const dateStr = date.toISOString().split('T')[0];
                     const isWknd = date.getDay() === 0 || date.getDay() === 6;
                     const isHol = isHoliday(dateStr);
                     let bgClass = '';
                     if (isHol) bgClass = 'bg-red-50 dark:bg-red-900/20';
                     else if (isWknd) bgClass = 'bg-gray-100/50 dark:bg-gray-800/50';

                     return (
                      <div 
                        key={i} 
                        className={`flex-shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center text-xs ${bgClass}`}
                        style={{ width: `${DAY_WIDTH}px` }}
                        title={isHol ? '國定假日' : undefined}
                      >
                        <span className={`font-bold text-sm ${isHol ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-300'}`}>
                          {date.getDate()}
                        </span>
                        <span className={`${isHol ? 'text-red-400 dark:text-red-500' : 'text-gray-400 dark:text-gray-500'} text-[10px]`}>
                          {getDayName(date)}
                        </span>
                      </div>
                     );
                  })}
                </div>
            </div>
          </div>

          <div className="relative">
             <div 
                className="absolute inset-0 pointer-events-none flex z-0 h-full"
                style={{ left: `${LEFT_COL_WIDTH}px` }}
             >
                 {dates.map((date, i) => {
                    const dateStr = date.toISOString().split('T')[0];
                    const isWknd = date.getDay() === 0 || date.getDay() === 6;
                    const isHol = isHoliday(dateStr);

                    let bgClass = '';
                    if (isHol) bgClass = 'bg-red-50/50 dark:bg-red-900/10';
                    else if (isWknd) bgClass = 'bg-gray-50/50 dark:bg-gray-800/30';

                    return (
                      <div 
                        key={i} 
                        className={`border-r border-dashed border-gray-100 dark:border-gray-700/50 h-full flex-shrink-0 ${bgClass}`}
                        style={{ width: `${DAY_WIDTH}px` }} 
                      />
                    );
                 })}
             </div>

             {rows.map((row) => {
               const isDraggable = groupBy === GroupBy.None && !readOnly;

               if (row.isHeader) {
                 return (
                   <div 
                     key={row.uniqueId} 
                     className={`sticky left-0 w-full z-20 flex bg-gray-100 dark:bg-gray-800 border-y border-gray-200 dark:border-gray-700 h-10 items-center ${isDraggable ? 'cursor-move hover:bg-gray-200 dark:hover:bg-gray-700' : ''}`}
                     draggable={isDraggable}
                     onDragStart={(e) => isDraggable && handleDragStart(e, row)}
                     onDragOver={isDraggable ? handleDragOver : undefined}
                     onDrop={(e) => isDraggable && handleDrop(e, row)}
                   >
                     <div 
                        className="sticky left-0 px-4 font-bold text-sm text-gray-800 dark:text-gray-100 flex items-center cursor-pointer"
                        style={{ width: `${LEFT_COL_WIDTH}px` }}
                        onClick={() => onTaskClick(row.originalTask)}
                     >
                       {isDraggable && (
                         <span className="text-gray-400 mr-2 cursor-grab active:cursor-grabbing">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z"/>
                           </svg>
                         </span>
                       )}
                       <span className="truncate flex-1 hover:text-indigo-600 dark:hover:text-indigo-400">{row.label}</span>
                       {row.subLabel && <span className="text-xs font-normal text-gray-500 ml-2">{row.subLabel}</span>}
                     </div>
                     <div className="flex-1"></div>
                   </div>
                 );
               }

               const left = row.startDate ? getOffset(row.startDate) : 0;
               const width = (row.startDate && row.endDate) ? getWidth(row.startDate, row.endDate) : 0;
               const workDays = (row.startDate && row.endDate) ? calculateWorkingDays(row.startDate, row.endDate) : 0;
               
               const isLightColor = row.color?.includes('white') || row.color?.includes('bg-gray-100') || row.color?.includes('bg-yellow-100');
               const textColorClass = isLightColor 
                    ? (width > 80 ? 'right-2 text-gray-700 font-bold' : 'left-full ml-2 text-gray-500')
                    : (width > 80 ? 'right-2 text-white/90' : 'left-full ml-2 text-gray-500');
               
               // In read only, cursor is default, not grab
               const barCursorClass = readOnly ? 'cursor-pointer hover:brightness-105' : 'cursor-grab active:cursor-grabbing hover:brightness-110';

               return (
                 <div 
                    key={row.uniqueId} 
                    className="flex group hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors h-[56px] border-b border-gray-100 dark:border-gray-800"
                 >
                    
                    {/* Left Column Label - Ensure onClick works here */}
                    <div 
                      className={`sticky left-0 z-10 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 p-2 flex flex-col justify-center transition-colors group-hover:bg-gray-50 dark:group-hover:bg-gray-800 ${isDraggable ? 'cursor-move' : 'cursor-pointer'}`}
                      style={{ width: `${LEFT_COL_WIDTH}px` }}
                      onClick={(e) => {
                          if (draggedItem || draggedBar) return;
                          onTaskClick(row.originalTask);
                      }}
                      draggable={isDraggable}
                      onDragStart={(e) => {
                          e.stopPropagation(); 
                          if (isDraggable) handleDragStart(e, row);
                      }}
                      onDragOver={isDraggable ? handleDragOver : undefined}
                      onDrop={(e) => isDraggable && handleDrop(e, row)}
                    >
                        {groupBy === GroupBy.None ? (
                            // Default View
                            <div className="flex flex-col pl-4">
                                <div className="flex items-center">
                                    {isDraggable && (
                                        <span className="text-gray-300 dark:text-gray-600 mr-2 -ml-2 cursor-grab active:cursor-grabbing hover:text-gray-500">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z"/>
                                            </svg>
                                        </span>
                                    )}
                                    <div className={`w-2.5 h-2.5 rounded-full ${row.color || 'bg-gray-400'} mr-2 flex-shrink-0`}></div>
                                    <span className="truncate text-gray-900 dark:text-gray-100 font-bold text-sm">{row.label}</span>
                                </div>
                                {row.subLabel && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate pl-[18px]">
                                        {row.subLabel}
                                    </div>
                                )}
                            </div>
                        ) : (
                            // Role View
                            <div className="flex flex-col px-2" onClick={() => onTaskClick(row.originalTask)}>
                                <div className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate" title={row.label}>
                                    {row.label}
                                </div>
                                {row.subLabel && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center mt-1 truncate">
                                        <span className="text-gray-300 dark:text-gray-600 mr-1">:</span>
                                        {row.subLabel}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="relative flex-1 h-full">
                      {row.startDate && row.endDate && (
                        <div 
                          className={`absolute top-1/2 -translate-y-1/2 h-7 rounded-md shadow-sm transition-all ${row.color || 'bg-gray-400'} flex items-center overflow-hidden hover:shadow-md ${barCursorClass}`}
                          style={{ left: `${left}px`, width: `${width}px` }}
                          onMouseDown={(e) => handleBarMouseDown(e, row)}
                          title={`${row.label} ${row.subLabel ? '- ' + row.subLabel : ''}: ${workDays} 工作天 (${row.startDate} ~ ${row.endDate})`}
                        >
                          <div className={`absolute ${textColorClass} text-[10px] font-medium whitespace-nowrap pointer-events-none`}>
                             {workDays} 天
                          </div>
                        </div>
                      )}
                    </div>
                 </div>
               );
             })}

             {rows.length === 0 && (
               <div className="p-10 text-center text-gray-400">
                 沒有符合的任務
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GanttChart;
