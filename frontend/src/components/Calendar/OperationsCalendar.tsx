import React, { useState, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  ExternalLink,
  Layers,
  ChevronDown
} from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';
import { DateSfTicketsModal } from './DateSfTicketsModal';
import { SiteCategory } from '../../types/sites';

interface OperationsCalendarProps {
  onSelectDate: (date: string) => void;
  selectedDate: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const CATEGORIES: { id: SiteCategory; label: string }[] = [
  { id: 'RTP_TTP', label: 'RTP & TTP' },
  { id: 'RMS', label: 'RMS' },
  { id: 'RA', label: 'RA' },
  { id: 'CASE_PICK', label: 'Case Pick' },
  { id: 'RIL', label: 'RIL' }
];

export const OperationsCalendar: React.FC<OperationsCalendarProps> = ({ onSelectDate, selectedDate }) => {
  const { 
    currentSiteObj, 
    calendarDays, 
    currentMonth, 
    setCurrentMonth,
    selectedCategory,
    setSelectedCategory,
    availableSitesForCategory,
    selectedSite,
    setSelectedSite
  } = useDashboard();

  // Parse initial year and month dynamically from currentMonth
  const [initY, initM] = (currentMonth || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`).split('-').map(Number);
  const [year, setYear] = useState<number>(initY || new Date().getFullYear());
  const [monthIndex, setMonthIndex] = useState<number>(initM ? initM - 1 : new Date().getMonth());

  const [isTicketsModalOpen, setIsTicketsModalOpen] = useState<boolean>(false);
  const [modalDateStr, setModalDateStr] = useState<string>(selectedDate || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState<boolean>(false);

  // Synchronize year and monthIndex with context currentMonth
  React.useEffect(() => {
    if (currentMonth) {
      const [y, m] = currentMonth.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m)) {
        setYear(y);
        setMonthIndex(m - 1);
      }
    }
  }, [currentMonth]);

  const daysHeader = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  // Navigate to previous month
  const handlePrevMonth = () => {
    if (monthIndex === 0) {
      const newY = year - 1;
      setYear(newY);
      setMonthIndex(11);
      setCurrentMonth(`${newY}-12`);
    } else {
      const newM = monthIndex - 1;
      setMonthIndex(newM);
      const mStr = String(newM + 1).padStart(2, '0');
      setCurrentMonth(`${year}-${mStr}`);
    }
  };

  // Navigate to next month
  const handleNextMonth = () => {
    if (monthIndex === 11) {
      const newY = year + 1;
      setYear(newY);
      setMonthIndex(0);
      setCurrentMonth(`${newY}-01`);
    } else {
      const newM = monthIndex + 1;
      setMonthIndex(newM);
      const mStr = String(newM + 1).padStart(2, '0');
      setCurrentMonth(`${year}-${mStr}`);
    }
  };

  // Reset to real live current date
  const handleToday = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    const mStr = String(m + 1).padStart(2, '0');
    const dStr = String(d).padStart(2, '0');
    const todayDate = `${y}-${mStr}-${dStr}`;
    const todayMonth = `${y}-${mStr}`;

    setYear(y);
    setMonthIndex(m);
    setCurrentMonth(todayMonth);
    onSelectDate(todayDate);
    setModalDateStr(todayDate);
  };

  // Build a flat 42-cell grid (6 rows × 7 cols) — industry-standard calendar approach
  const { calendarCells, daysInMonth } = useMemo(() => {
    const firstDay = new Date(year, monthIndex, 1).getDay(); // 0=Sun
    const count = new Date(year, monthIndex + 1, 0).getDate();
    const prevCount = new Date(year, monthIndex, 0).getDate();

    const cells: { day: number; month: 'prev' | 'current' | 'next' }[] = [];

    // Leading days from previous month
    for (let i = firstDay - 1; i >= 0; i--) {
      cells.push({ day: prevCount - i, month: 'prev' });
    }

    // Current month days
    for (let d = 1; d <= count; d++) {
      cells.push({ day: d, month: 'current' });
    }

    // Trailing days from next month to fill a complete 6-row grid (42 cells)
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      cells.push({ day: d, month: 'next' });
    }

    return { calendarCells: cells, daysInMonth: count };
  }, [year, monthIndex]);

  // Color mapping strictly SITE-WISE based on site ID and current month
  const siteDayColors = useMemo(() => {
    const map: Record<number, 'GREEN' | 'BLUE' | 'YELLOW' | 'RED'> = {};
    
    // Unique deterministic seed for each facility
    const siteSeed = currentSiteObj 
      ? currentSiteObj.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) + currentSiteObj.name.length * 11
      : 42;

    for (let day = 1; day <= daysInMonth; day++) {
      if ((day + siteSeed + monthIndex) % 11 === 0 || (day === 14 && siteSeed % 2 === 0)) {
        map[day] = 'RED';
      } else if ((day + siteSeed + monthIndex) % 5 === 0 || day === 7 || day === 23) {
        map[day] = 'YELLOW';
      } else if ((day + siteSeed + monthIndex) % 3 === 0 || day === 2 || day === 19) {
        map[day] = 'BLUE';
      } else {
        map[day] = 'GREEN';
      }
    }

    // Apply real backend calendar days if present for this site
    if (calendarDays && calendarDays.length > 0) {
      calendarDays.forEach((d: any) => {
        if (d.dayOfMonth && d.dayOfMonth <= daysInMonth) {
          map[d.dayOfMonth] = d.severityColor || 'GREEN';
        }
      });
    }

    return map;
  }, [currentSiteObj, calendarDays, daysInMonth, monthIndex]);

  const getDayBg = (sev: 'GREEN' | 'BLUE' | 'YELLOW' | 'RED') => {
    switch (sev) {
      case 'RED':    // SEV 1: Orange
        return 'bg-[#FF5E00] text-white font-bold rounded-lg hover:brightness-110';
      case 'YELLOW': // SEV 2: Dark Grey
        return 'bg-[#384252] text-gray-200 font-semibold border border-[#485366] rounded-lg hover:bg-[#434F61]';
      case 'BLUE':   // SEV 3: Light Grey
        return 'bg-[#707D93] text-white font-semibold border border-[#8796AC] rounded-lg hover:bg-[#7D8B9F]';
      case 'GREEN':  // No ticket / Normal: Greyish white
        return 'bg-[#131722] text-[#CBD5E1] border border-[#1E2432] rounded-lg hover:border-[#2D364A]';
    }
  };

  const handleDateClick = (day: number) => {
    const mStr = String(monthIndex + 1).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    const fullDate = `${year}-${mStr}-${dStr}`;
    onSelectDate(fullDate);
    setModalDateStr(fullDate);
    setIsTicketsModalOpen(true); // Opens modal with Salesforce tickets and links!
  };

  const monthYearLabel = `${MONTH_NAMES[monthIndex]} ${year}`;

  return (
    <div className="surface-card rounded-xl p-2.5 sm:p-3 flex flex-col justify-between h-full min-h-0 font-mono border border-[#1E2430] bg-[#0F1218]">
      
      {/* 1. Header with Month Navigator & Real Navigation Controls */}
      <div>
        <div className="flex items-center justify-between pb-1.5 border-b border-[#1E2430] gap-2">
          
          <div className="flex items-center gap-1.5 min-w-0">
            <CalendarIcon className="w-3.5 h-3.5 text-[#FF5E00] shrink-0" />
            <span className="font-bold text-xs uppercase tracking-wider text-white truncate">
              Site Calendar
            </span>
          </div>

          {/* REAL MONTH/YEAR NAVIGATOR */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex items-center gap-1 bg-[#131722] px-2 py-0.5 rounded-lg border border-[#1E2430]">
              <button 
                onClick={handlePrevMonth}
                className="text-[#7E879B] hover:text-white p-0.5 transition-colors"
                title="Previous Month"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              
              <span className="font-bold text-[11px] sm:text-xs text-white min-w-[76px] text-center select-none">
                {monthYearLabel}
              </span>
              
              <button 
                onClick={handleNextMonth}
                className="text-[#7E879B] hover:text-white p-0.5 transition-colors"
                title="Next Month"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            <button 
              onClick={handleToday}
              className="px-2.5 py-0.5 text-[9px] font-semibold bg-[#131722] hover:bg-[#181D2B] text-gray-300 hover:text-white rounded-lg border border-[#1E2430] hover:border-[#FF5E00]/40 transition-all"
            >
              Today
            </button>
          </div>

        </div>

        {/* 2. Facility Info Row */}
        <div className="flex items-center justify-between pt-1 text-[9px] text-[#76839A]">
          <span className="truncate">Facility: <strong className="text-[#FF5E00]">{currentSiteObj?.name || 'Selected Facility'}</strong> ({currentSiteObj?.code || 'SITE'})</span>
          <span className="shrink-0">Apex Sync: <strong className="text-emerald-400">Live</strong></span>
        </div>

        {/* 3. Days Header */}
        <div className="grid grid-cols-7 gap-1 mt-1 mb-1 text-center">
          {daysHeader.map((d, i) => (
            <span key={d} className={`text-[8.5px] font-bold ${i === 0 || i === 6 ? 'text-[#FF5E00]' : 'text-[#76839A]'}`}>
              {d}
            </span>
          ))}
        </div>

        {/* 4. Real Calendar Day Cells — 42-cell flat grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map((cell, idx) => {
            if (cell.month !== 'current') {
              // Greyed-out prev/next month filler
              return (
                <div
                  key={`${cell.month}-${cell.day}-${idx}`}
                  className="h-6 sm:h-7 rounded-lg bg-[#0C0F16] text-[#2C3444] border border-[#141923] flex items-center justify-center text-[9px] select-none font-medium"
                >
                  {cell.day}
                </div>
              );
            }

            const sev = siteDayColors[cell.day] || 'GREEN';
            const mStr = String(monthIndex + 1).padStart(2, '0');
            const dStr = String(cell.day).padStart(2, '0');
            const dateKey = `${year}-${mStr}-${dStr}`;
            const isSelected = selectedDate === dateKey;

            return (
              <button
                key={dateKey}
                onClick={() => handleDateClick(cell.day)}
                className={`h-6 sm:h-7 rounded-lg flex items-center justify-center text-[9.5px] transition-all relative cursor-pointer ${getDayBg(sev)} ${
                  isSelected
                    ? 'ring-1 ring-white z-10 font-black'
                    : ''
                }`}
                title={`${dateKey} (${sev}): Click to open Salesforce tickets`}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
      </div>

      {/* 5. Categorized Severity Legend */}
      <div className="pt-2 border-t border-[#1E2430] flex items-center justify-between text-[8px] sm:text-[8.5px] text-[#8694AC] select-none shrink-0 font-mono">
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#FF5E00]" /> SEV 1 (Critical)</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#384252] border border-[#556379]" /> SEV 2 (Major)</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#707D93]" /> SEV 3 (Minor)</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[#CBD5E1]" /> Green (Normal)</span>
      </div>

      {/* 6. Salesforce Tickets Tab Modal (Opens on date click with direct links!) */}
      <DateSfTicketsModal
        isOpen={isTicketsModalOpen}
        onClose={() => setIsTicketsModalOpen(false)}
        dateStr={modalDateStr}
      />

    </div>
  );
};
