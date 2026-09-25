import React, { useState, useMemo } from 'react';
import { ChevronDown, BarChart2 } from 'lucide-react';
import { useDashboard } from '../../context/DashboardContext';

export const TicketFlowTrendChart: React.FC = () => {
  const { currentSiteObj, trendData } = useDashboard();
  const [timeRange, setTimeRange] = useState('Last 90 Days');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Dynamic trend data per selected site
  const siteBarsData = useMemo(() => {
    if (trendData && trendData.length > 0) {
      return trendData;
    }

    const weekLabels = [
      'Feb 24', 'Mar 03', 'Mar 10', 'Mar 17', 'Mar 24', 'Mar 31',
      'Apr 07', 'Apr 14', 'Apr 21', 'Apr 28', 'May 05', 'May 12', 'May 19'
    ];
    const seed = currentSiteObj ? currentSiteObj.name.length : 12;

    return weekLabels.map((label, idx) => {
      const red = Math.max(1, (seed * (idx + 1)) % 6 + 1);
      const yellow = Math.max(2, (seed * 2 + idx) % 14 + 3);
      const blue = Math.max(6, (seed * 3 + idx) % 16 + 6);
      const green = Math.max(25, 60 - red - yellow - blue + ((idx * 3) % 10));
      return { label, green, blue, yellow, red };
    });
  }, [currentSiteObj, trendData]);

  return (
    <div className="surface-card rounded-xl p-2 sm:p-2.5 flex flex-col justify-between shadow-lg h-full min-h-0">
      
      {/* Header & Filter Dropdown */}
      <div>
        <div className="flex items-center justify-between pb-1 border-b border-[#232A39]">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-3.5 h-3.5 text-[#FF7A00]" />
            <span className="font-mono font-bold text-xs uppercase tracking-wider text-white">
              Incident Trend ({timeRange})
            </span>
          </div>

          <div className="relative">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="appearance-none bg-[#141923] hover:bg-[#1D2433] text-gray-200 text-[10px] font-mono font-semibold pl-2 pr-6 py-0.5 rounded-lg border border-[#283144] hover:border-[#FF7A00]/50 focus:outline-none cursor-pointer transition-colors"
            >
              <option value="Last 30 Days">Last 30 Days</option>
              <option value="Last 90 Days">Last 90 Days</option>
              <option value="Last 1 Year">Last 1 Year</option>
            </select>
            <ChevronDown className="w-3 h-3 text-[#7B869D] absolute right-1.5 top-1.5 pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center justify-between pt-0.5 text-[9px] font-mono text-[#76839A]">
          <span>Site Trend: <strong className="text-[#FF7A00]">{currentSiteObj?.name || 'Selected'}</strong></span>
          <span>Window: <strong className="text-gray-200">13 Weeks Telemetry</strong></span>
        </div>
      </div>

      {/* Chart Canvas with Y-Axis and Stacked Bars */}
      <div className="flex items-stretch gap-2 my-0.5 flex-1 min-h-0">
        
        {/* Y-Axis Labels */}
        <div className="flex flex-col justify-between text-[9px] font-mono text-[#5C667A] select-none text-right w-5 pb-4">
          <span>100</span>
          <span>80</span>
          <span>60</span>
          <span>40</span>
          <span>20</span>
          <span>0</span>
        </div>

        {/* Chart Area */}
        <div className="flex-1 flex flex-col justify-between relative border-l border-b border-[#232A39] pl-1.5 pb-4">
          
          {/* Subtle Grid Lines */}
          <div className="absolute inset-0 bottom-4 flex flex-col justify-between pointer-events-none opacity-15">
            <div className="border-b border-[#3E4A62] w-full" />
            <div className="border-b border-[#3E4A62] w-full" />
            <div className="border-b border-[#3E4A62] w-full" />
            <div className="border-b border-[#3E4A62] w-full" />
            <div className="border-b border-[#3E4A62] w-full" />
            <div className="border-b border-[#3E4A62] w-full" />
          </div>

          {/* Stacked Bars */}
          <div className="flex items-end justify-between gap-1.5 h-full w-full z-10">
            {siteBarsData.map((bar: any, i: number) => {
              const total = (bar.green || 0) + (bar.blue || 0) + (bar.yellow || 0) + (bar.red || 0);
              const heightPct = Math.min(100, (total / 100) * 100);

              const greenPct = total > 0 ? (bar.green / total) * 100 : 0;
              const bluePct = total > 0 ? (bar.blue / total) * 100 : 0;
              const yellowPct = total > 0 ? (bar.yellow / total) * 100 : 0;
              const redPct = total > 0 ? (bar.red / total) * 100 : 0;

              return (
                <div
                  key={i}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  className="flex-1 flex flex-col items-center justify-end h-full group relative cursor-pointer"
                >
                  {/* Tooltip on Hover */}
                  {hoveredIndex === i && (
                    <div className="absolute -top-14 bg-[#0E121A]/95 text-white text-[10px] font-mono p-2 rounded-lg shadow-2xl border border-[#FF7A00]/50 z-20 whitespace-nowrap animate-in fade-in">
                      <div className="font-bold text-[#FF7A00]">{bar.label} — Cases: {total}</div>
                      <div className="text-gray-300">
                        🔴 SEV1: {bar.red} | 🟡 SEV2: {bar.yellow} | 🔵 SEV3: {bar.blue}
                      </div>
                    </div>
                  )}

                  {/* Stacked Column */}
                  <div
                    style={{ height: `${heightPct}%` }}
                    className="w-full rounded-xs flex flex-col-reverse overflow-hidden transition-all duration-150 group-hover:brightness-125 group-hover:scale-y-102"
                  >
                    <div style={{ height: `${greenPct}%` }} className="w-full bg-[#10B981]" />
                    <div style={{ height: `${bluePct}%` }} className="w-full bg-[#3B82F6]" />
                    <div style={{ height: `${yellowPct}%` }} className="w-full bg-[#F59E0B]" />
                    <div style={{ height: `${redPct}%` }} className="w-full bg-[#EF4444]" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* X-Axis Date Labels */}
          <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[8.5px] font-mono text-[#5C667A] pl-1.5 pt-0.5">
            <span>Feb 24</span>
            <span>Mar 10</span>
            <span>Mar 24</span>
            <span>Apr 07</span>
            <span>Apr 21</span>
            <span>May 05</span>
            <span>May 19</span>
          </div>
        </div>

      </div>

      {/* Bottom Severity Legend */}
      <div className="flex items-center justify-between pt-1 border-t border-[#232A39] text-[8px] sm:text-[8.5px] font-mono shrink-0">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-sm bg-[#EF4444] shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
          <span className="text-[#8B96AC]">SEV 1 (Critical)</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-sm bg-[#F59E0B] shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
          <span className="text-[#8B96AC]">SEV 2 (Major)</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-sm bg-[#3B82F6] shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
          <span className="text-[#8B96AC]">SEV 3 (Minor)</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-sm bg-[#10B981] shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
          <span className="text-[#8B96AC]">Green (Normal)</span>
        </div>
      </div>

    </div>
  );
};
