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
      'Feb 24', 'Mar 10', 'Mar 24', 'Apr 07', 'Apr 21', 'May 05', 'May 19'
    ];
    const seed = currentSiteObj ? currentSiteObj.name.length : 12;

    return weekLabels.map((label, idx) => {
      const red = Math.max(3, (seed * (idx + 1)) % 10 + 4);       // SEV 1: Orange
      const yellow = Math.max(8, (seed * 2 + idx) % 18 + 12);     // SEV 2: Dark Grey
      const blue = Math.max(6, (seed * 3 + idx) % 14 + 8);        // SEV 3: Light Grey
      const green = Math.max(20, 70 - red - yellow - blue + ((idx * 2) % 6)); // No Ticket: Greyish White
      return { label, green, blue, yellow, red };
    });
  }, [currentSiteObj, trendData]);

  return (
    <div className="surface-card rounded-xl p-2.5 sm:p-3 flex flex-col justify-between h-full min-h-0 border border-[#1E2430] bg-[#0F1218]">
      
      {/* Header & Filter Dropdown */}
      <div>
        <div className="flex items-center justify-between pb-1.5 border-b border-[#1E2430]">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-3.5 h-3.5 text-[#FF5E00]" />
            <span className="font-bold text-xs uppercase tracking-wider text-white">
              Incident Trend ({timeRange})
            </span>
          </div>

          <div className="relative">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="appearance-none bg-[#131722] hover:bg-[#181D2B] text-gray-200 text-[10px] font-semibold pl-2.5 pr-6 py-1 rounded-lg border border-[#1E2430] hover:border-[#FF5E00]/50 focus:outline-none cursor-pointer transition-colors"
            >
              <option value="Last 30 Days">Last 30 Days</option>
              <option value="Last 90 Days">Last 90 Days</option>
              <option value="Last 1 Year">Last 1 Year</option>
            </select>
            <ChevronDown className="w-3 h-3 text-[#7B869D] absolute right-2 top-1.5 pointer-events-none" />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 text-[9px] text-[#76839A]">
          <span>Site: <strong className="text-[#FF5E00]">{currentSiteObj?.name || 'Sam\'s ATL'}</strong></span>
          <span>Window: <strong className="text-gray-200 font-mono">13 Weeks Telemetry</strong></span>
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
        <div className="flex-1 flex flex-col justify-between relative border-l border-b border-[#1E2430] pl-1.5 pb-4">
          
          {/* Subtle Grid Lines */}
          <div className="absolute inset-0 bottom-4 flex flex-col justify-between pointer-events-none opacity-20">
            <div className="border-b border-[#1E2430] w-full" />
            <div className="border-b border-[#1E2430] w-full" />
            <div className="border-b border-[#1E2430] w-full" />
            <div className="border-b border-[#1E2430] w-full" />
            <div className="border-b border-[#1E2430] w-full" />
            <div className="border-b border-[#1E2430] w-full" />
          </div>

          {/* Stacked Bars with Color Schema: SEV 1 Orange, SEV 2 Dark Grey, SEV 3 Light Grey */}
          <div className="flex items-end justify-around gap-2 h-full w-full z-10 px-1">
            {siteBarsData.map((bar: any, i: number) => {
              const total = (bar.green || 0) + (bar.blue || 0) + (bar.yellow || 0) + (bar.red || 0);
              const heightPct = Math.min(100, Math.max(30, (total / 90) * 100));

              const sev2Pct = total > 0 ? (bar.yellow / total) * 100 : 0;
              const sev1Pct = total > 0 ? (bar.red / total) * 100 : 0;
              const sev3Pct = total > 0 ? (bar.blue / total) * 100 : 0;

              return (
                <div
                  key={i}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  className="flex-1 flex flex-col items-center justify-end h-full group relative cursor-pointer max-w-[28px]"
                >
                  {/* Tooltip on Hover */}
                  {hoveredIndex === i && (
                    <div className="absolute -top-14 bg-[#090A0E] text-white text-[10px] font-mono p-2 rounded-lg border border-[#1E2430] z-20 whitespace-nowrap animate-in fade-in">
                      <div className="font-bold text-[#FF5E00]">{bar.label} — Incidents: {total}</div>
                      <div className="text-gray-300">
                        🟠 SEV 1: {bar.red} | ⚫ SEV 2: {bar.yellow} | ⚪ SEV 3: {bar.blue}
                      </div>
                    </div>
                  )}

                  {/* Stacked Column matching Image 3 (Bottom: Dark Grey, Middle: Orange, Top: Light Grey) */}
                  <div
                    style={{ height: `${heightPct}%` }}
                    className="w-full flex flex-col-reverse overflow-hidden transition-all duration-150 group-hover:brightness-110"
                  >
                    {/* Bottom: SEV 2 Dark Grey */}
                    <div style={{ height: `${sev2Pct}%` }} className="w-full bg-[#384252]" />
                    {/* Middle: SEV 1 Orange */}
                    <div style={{ height: `${sev1Pct}%` }} className="w-full bg-[#FF5E00]" />
                    {/* Top: SEV 3 Light Grey */}
                    <div style={{ height: `${sev3Pct}%` }} className="w-full bg-[#707D93]" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* X-Axis Date Labels matching Image 3 */}
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

      {/* Bottom Severity Legend matching Image 3 and User Schema */}
      <div className="flex items-center justify-between pt-1 border-t border-[#1E2430] text-[8px] sm:text-[8.5px] font-mono shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF5E00]" />
          <span className="text-[#8B96AC]">SEV 1 (Critical)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#384252] border border-[#556379]" />
          <span className="text-[#8B96AC]">SEV 2 (Major)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#707D93]" />
          <span className="text-[#8B96AC]">SEV 3 (Minor)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#CBD5E1]" />
          <span className="text-[#8B96AC]">Green (Normal)</span>
        </div>
      </div>

    </div>
  );
};
