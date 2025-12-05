
export interface TaskAssignment {
  id: string;
  role: string;
  subLabel?: string; // New: The specific task detail (e.g. "畫面設計")
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  progress: number; // 0-100
  color: string;
}

export interface Task {
  id: string;
  name: string; // The Feature Name
  assignments: TaskAssignment[];
}

export interface ProjectMetadata {
  id: string;
  name: string;
  description: string;
  lastUpdated: string;
  taskCount: number;
}

export enum ViewMode {
  Timeline = 'TIMELINE',
  List = 'LIST'
}

export enum GroupBy {
  None = 'NONE', // Equivalent to "By Feature"
  Assignee = 'ASSIGNEE' // Equivalent to "By Role"
}

export const TAILWIND_COLORS = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-indigo-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-purple-500',
  'bg-cyan-500',
  'bg-fuchsia-500',
  'bg-orange-500',
  'bg-teal-500',
  'bg-gray-500', // New Grey Color
  'bg-white border border-gray-300 shadow-sm',
];

// Consistent Color Mapping based on Role Name
export const getColorForRole = (role: string): string => {
  const r = role.toLowerCase().trim();
  
  if (r.includes('ui') || r.includes('設計') || r.includes('design') || r.includes('art')) return 'bg-rose-500'; // Pink for Design
  if (r.includes('fe') || r.includes('front') || r.includes('前端') || r.includes('app') || r.includes('web')) return 'bg-blue-500'; // Blue for Frontend
  if (r.includes('be') || r.includes('back') || r.includes('後端') || r.includes('api') || r.includes('server')) return 'bg-emerald-500'; // Green for Backend
  if (r.includes('pm') || r.includes('product') || r.includes('專案') || r.includes('manager')) return 'bg-purple-500'; // Purple for PM
  if (r.includes('qa') || r.includes('test') || r.includes('測試')) return 'bg-orange-500'; // Orange for QA
  if (r.includes('ux') || r.includes('brief') || r.includes('research') || r.includes('研究')) return 'bg-amber-500'; // Amber for UX/Brief
  if (r.includes('data') || r.includes('資料')) return 'bg-cyan-500';
  if (r === 'rd' || r === 'all' || r === '全體') return 'bg-gray-500'; // Grey for RD/All
  
  // Hash for others to keep it consistent
  let hash = 0;
  for (let i = 0; i < role.length; i++) {
    hash = role.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % TAILWIND_COLORS.length;
  return TAILWIND_COLORS[index];
};

// Helper to get today's date string
const today = new Date().toISOString().split('T')[0];
const addDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

export const MOCK_TASKS: Task[] = [
  {
    id: '1',
    name: '會員登入註冊功能',
    assignments: [
      {
        id: '1-1',
        role: 'UI',
        subLabel: '畫面設計',
        startDate: today,
        endDate: addDays(2),
        progress: 100,
        color: 'bg-rose-500'
      },
      {
        id: '1-2',
        role: 'FE',
        subLabel: '切版與串接',
        startDate: addDays(3),
        endDate: addDays(7),
        progress: 40,
        color: 'bg-blue-500'
      },
      {
        id: '1-3',
        role: 'BE',
        subLabel: 'API 開發',
        startDate: addDays(3),
        endDate: addDays(6),
        progress: 60,
        color: 'bg-emerald-500'
      }
    ]
  },
  {
    id: '2',
    name: '購物車結帳流程',
    assignments: [
      {
        id: '2-1',
        role: 'PM',
        subLabel: '撰寫 PRD',
        startDate: addDays(1),
        endDate: addDays(2),
        progress: 100,
        color: 'bg-purple-500'
      },
      {
        id: '2-2',
        role: 'UI',
        subLabel: '介面優化',
        startDate: addDays(3),
        endDate: addDays(5),
        progress: 20,
        color: 'bg-rose-500'
      }
    ]
  }
];
