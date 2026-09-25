import React, { useState } from 'react';
import { DashboardProvider, useDashboard } from './context/DashboardContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { OperationsCalendar } from './components/Calendar/OperationsCalendar';
import { TicketFlowTrendChart } from './components/Analytics/TicketFlowTrendChart';
import { MetricPillsBar } from './components/Metrics/MetricPillsBar';
import { RecentTicketsTable } from './components/Tickets/RecentTicketsTable';
import { RightServicesBoxes } from './components/Services/RightServicesBoxes';
import { AdminEmbedModal } from './components/Admin/AdminEmbedModal';
import { EditDashboardLinkModal } from './components/Admin/EditDashboardLinkModal';
import { SamsAtlDashboard } from './scenes/SamsAtlDashboard';
import { SiteNotesView } from './components/SiteNotes/SiteNotesView';
import { AlertPoolView } from './components/AlertPool/AlertPoolView';

const DashboardView: React.FC = () => {
  const { selectedDate, setSelectedDate } = useDashboard();
  const [activeNav, setActiveNav] = useState<string>('overview');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState<boolean>(false);

  return (
    <div className="h-screen w-screen bg-[#0B0E14] text-[#ECEFF4] flex flex-col font-sans selection:bg-[#FF7A00] selection:text-white overflow-hidden">
      {/* Top Navbar */}
      <Navbar onOpenAdminModal={() => setIsAdminModalOpen(true)} />

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        
        {/* Left Collapsible Navigation Sidebar */}
        <Sidebar 
          activeNav={activeNav} 
          setActiveNav={setActiveNav}
          isCollapsed={isSidebarCollapsed}
          setIsCollapsed={setIsSidebarCollapsed}
          onOpenSettings={() => setIsAdminModalOpen(true)}
        />

        {/* Center Content: Overview Dashboard vs Alert Pool vs Site Notes vs Postgres Telemetry */}
        <main className="flex-1 p-2 sm:p-2.5 overflow-hidden flex flex-col min-h-0">
          {activeNav === 'scenes' ? (
            <div className="h-full flex flex-col overflow-hidden min-h-0">
              <SamsAtlDashboard />
            </div>
          ) : activeNav === 'site-notes' ? (
            <div className="h-full flex flex-col overflow-hidden min-h-0">
              <SiteNotesView />
            </div>
          ) : activeNav === 'alert-pool' ? (
            <div className="h-full flex flex-col overflow-hidden min-h-0">
              <AlertPoolView />
            </div>
          ) : (
            /* Whiteboard Wireframe: Main Area (Left) + 6-panel Grafana Column (Right) */
            <div className="flex-1 flex flex-col xl:flex-row gap-2 sm:gap-2.5 items-stretch overflow-hidden min-h-0 h-full">
              
              {/* LEFT / MAIN SECTION (Calendar, Trend, 6 Metric Pills, Incident Details) */}
              <div className="flex-1 flex flex-col gap-2 min-w-0 w-full overflow-hidden min-h-0 h-full">
                
                {/* Row 1: Site Calendar (Left) + Incident Trend (Right) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-2.5 items-stretch h-[320px] sm:h-[340px] shrink-0">
                  <div className="flex flex-col h-full min-h-0">
                    <OperationsCalendar
                      selectedDate={selectedDate}
                      onSelectDate={(date) => setSelectedDate(date)}
                    />
                  </div>

                  <div className="flex flex-col h-full min-h-0">
                    <TicketFlowTrendChart />
                  </div>
                </div>

                {/* Row 2: 6 Metric Square Panels [ UPH ] [ PPR ] [ R2R ] [ KPI ] [ Disk ] [ Mem ] */}
                <div className="w-full shrink-0">
                  <MetricPillsBar />
                </div>

                {/* Row 3: Incident Details Table / Telemetry — flex remaining height */}
                <div className="mt-auto flex-1 min-h-[185px] flex flex-col overflow-hidden">
                  <RecentTicketsTable />
                </div>

              </div>

              {/* RIGHT COLUMN: 6 panels single column — fixed width, full height */}
              <div className="w-full xl:w-[230px] 2xl:w-[250px] shrink-0 flex flex-col overflow-hidden h-full min-h-0">
                <RightServicesBoxes />
              </div>

            </div>
          )}
        </main>

      </div>

      {/* Modal to Edit Links for any of the 12 Services / Metrics */}
      <EditDashboardLinkModal />

      {/* Admin Embed & Slack Configuration Modal */}
      <AdminEmbedModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
      />
    </div>
  );
};

export default function App() {
  return (
    <DashboardProvider>
      <DashboardView />
    </DashboardProvider>
  );
}
