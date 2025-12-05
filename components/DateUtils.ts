
// 定義 2025 (民國114年) 與 2026 (民國115年) 的國定假日 (YYYY-MM-DD)
// 根據使用者提供的行事曆圖片與行政院慣例
const TAIWAN_HOLIDAYS = new Set([
  // --- 2025 (民國114年) ---
  '2025-01-01', // 元旦
  // 農曆春節 (1/25-2/2 假期，其中平日為 1/27-1/31)
  '2025-01-27', '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', 
  '2025-02-28', // 228 和平紀念日
  '2025-04-03', '2025-04-04', // 兒童節與清明節
  '2025-05-30', // 端午節 (5/31週六，5/30週五補假/調整放假)
  '2025-10-06', // 中秋節
  '2025-10-10', // 國慶日

  // --- 2026 (民國115年) 預估 ---
  '2026-01-01', // 元旦
  // 農曆春節 (預估 2/16 除夕前一日? 或 2/17 除夕。通常放假包含前後平日)
  // 假設春節假期平日部分為:
  '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20',
  '2026-02-27', // 228 (2/28週六，2/27週五補假)
  '2026-04-03', '2026-04-06', // 清明/兒童 (4/4週六，4/5週日，週五週一補假)
  '2026-06-19', // 端午節 (6/19週五)
  '2026-09-25', // 中秋節 (9/25週五)
  '2026-10-09', // 國慶日 (10/10週六，10/9週五補假)
]);

export const getDaysArray = (start: Date, end: Date) => {
  const arr = [];
  for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) {
    arr.push(new Date(dt));
  }
  return arr;
};

export const formatDate = (dateString: string) => {
  const options: Intl.DateTimeFormatOptions = { month: 'numeric', day: 'numeric' };
  return new Date(dateString).toLocaleDateString('zh-TW', options);
};

export const getDayName = (date: Date) => {
  // Returns formatted weekday like '週一', '週二'
  return date.toLocaleDateString('zh-TW', { weekday: 'short' });
};

// ISO 8601 Week Number
export const getWeekNumber = (d: Date) => {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Set to nearest Thursday: current date + 4 - current day number
  // Make Sunday's day number 7
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  // Get first day of year
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  // Calculate full weeks to nearest Thursday
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return weekNo;
};

export const diffInDays = (d1: string, d2: string) => {
  const date1 = new Date(d1);
  const date2 = new Date(d2);
  const diffTime = Math.abs(date2.getTime() - date1.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Inclusive
};

export const isWeekend = (dateStr: string) => {
  const d = new Date(dateStr);
  const day = d.getDay();
  return day === 0 || day === 6;
};

export const isHoliday = (dateStr: string) => {
  return TAIWAN_HOLIDAYS.has(dateStr);
};

export const calculateWorkingDays = (start: string, end: string) => {
  let count = 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  const curDate = new Date(startDate);

  while (curDate <= endDate) {
    const dateStr = curDate.toISOString().split('T')[0];
    const dayOfWeek = curDate.getDay();
    
    // Check if weekend (0=Sun, 6=Sat) OR if it is a defined holiday
    const isOffDay = dayOfWeek === 0 || dayOfWeek === 6 || isHoliday(dateStr);
    
    if (!isOffDay) {
      count++;
    }
    curDate.setDate(curDate.getDate() + 1);
  }
  return count;
};

export const addDaysToDate = (dateStr: string, days: number): string => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

/**
 * Calculates the End Date based on a Start Date and a required number of Working Days.
 * It skips weekends and holidays.
 */
export const calculateEndDate = (startDateStr: string, requiredWorkingDays: number): string => {
  // If the requirement is 0 or negative, return start date (or handle as logic error)
  if (requiredWorkingDays <= 0) {
      // Fallback: If original had 0 working days (e.g. was on weekend), just return start date
      return startDateStr;
  }

  let currentDate = new Date(startDateStr);
  let workedDays = 0;
  let lastValidDate = startDateStr;

  // Loop until we satisfy the working days
  // Safety break: 365 days max to prevent infinite loops
  for (let i = 0; i < 365; i++) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const isOff = isWeekend(dateStr) || isHoliday(dateStr);

      if (!isOff) {
          workedDays++;
      }

      lastValidDate = dateStr;

      if (workedDays >= requiredWorkingDays) {
          return lastValidDate;
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
  }
  return lastValidDate;
};
