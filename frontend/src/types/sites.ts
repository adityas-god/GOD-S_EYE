export type SiteCategory = 'RTP_TTP' | 'RMS' | 'RA' | 'RIL' | 'CASE_PICK';

export interface SiteVM {
  id: string;
  hostname: string;
  ip: string;
  role: string;
  status: 'ONLINE' | 'STANDBY' | 'MAINTENANCE' | 'DEGRADED';
  specs?: string;
}

export interface SiteDeployment {
  version: string;
  deployedAt: string;
  deployedBy: string;
  commitHash: string;
  environment: string;
  notes: string;
}

export interface SiteCEM {
  name: string;
  email: string;
  phone: string;
  slack: string;
}

export interface SiteDashboardLink {
  id: string;
  title: string;
  url: string;
  category: string;
  description?: string;
}

export interface SiteAlert {
  id: string;
  alertKey: string;
  title: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  subsystem: string;
  sourceComponent: string;
  status: 'FIRING' | 'ACKNOWLEDGED' | 'RESOLVED' | 'SILENCED';
  timestamp: string;
  value: string;
  metricValue?: string;
  threshold?: string;
  description: string;
  remediation?: string;
  acknowledgedBy?: string;
  runbookUrl?: string;
}

export interface SiteIntelligence {
  siteId: string;
  code: string;
  name: string;
  category: SiteCategory;
  categoryLabel: string;
  region: string;
  timezone: string;
  isActive: boolean;
  slackChannelName: string;
  slackChannelUrl: string;
  warRoomUrl?: string;
  warRoomName?: string;
  warRoomMeetingId?: string;
  warRoomPasscode?: string;
  cem: SiteCEM;
  recentDeployment: SiteDeployment;
  vmIps: SiteVM[];
  dashboardLinks: SiteDashboardLink[];
  siteNotes: string;
  alerts: SiteAlert[];
}

export interface EnterpriseSite {
  id: string;
  code: string;
  name: string;
  category: SiteCategory;
  categoryLabel: string;
  region: string;
  timezone: string;
  isActive: boolean;
  slackChannelName?: string;
  slackChannelUrl?: string;
  warRoomUrl?: string;
  warRoomName?: string;
}

export const ENTERPRISE_SITES: EnterpriseSite[] = [
  // --- 1. RTP / TTP Sites ---
  { id: 'rtp_dhl', code: 'DHL-01', name: 'DHL', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'Global', timezone: 'America/New_York', isActive: true },
  { id: 'rtp_jysk', code: 'JYSK-01', name: 'JYSK', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'Europe', timezone: 'Europe/Copenhagen', isActive: true },
  { id: 'rtp_goldbond', code: 'GB-01', name: 'Goldbond', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-EAST', timezone: 'America/New_York', isActive: true },
  { id: 'rtp_ikea', code: 'IKEA-01', name: 'IKEA', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'Europe', timezone: 'Europe/Stockholm', isActive: true },
  { id: 'rtp_farmacia_tei', code: 'FTEI-01', name: 'Farmacia -Tei', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'Europe', timezone: 'Europe/Bucharest', isActive: true },
  { id: 'rtp_apotek', code: 'APOT-01', name: 'Apotek', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'Europe', timezone: 'Europe/Oslo', isActive: true },
  { id: 'rtp_coupang_incheon', code: 'CPG-ICN', name: 'Coupang Incheon', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'APAC', timezone: 'Asia/Seoul', isActive: true },
  { id: 'rtp_coupang_daegu', code: 'CPG-TAE', name: 'Coupang Daegu', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'APAC', timezone: 'Asia/Seoul', isActive: true },
  { id: 'rtp_mitsubishi_wa', code: 'MIT-WA', name: 'Mitsubishi WA Shoes', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'APAC', timezone: 'Asia/Tokyo', isActive: true },
  { id: 'rtp_mitsubishi_nippon', code: 'MIT-NP', name: 'Mitsubishi Nippon Konpo', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'APAC', timezone: 'Asia/Tokyo', isActive: true },
  { id: 'rtp_mitsubishi_lixil', code: 'MIT-LX', name: 'Mitsubishi Lixil', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'APAC', timezone: 'Asia/Tokyo', isActive: true },
  { id: 'rtp_mitsubishi_fujirebio_chill', code: 'MIT-FBC', name: 'Mitsubishi FujiRebio-Chill', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'APAC', timezone: 'Asia/Tokyo', isActive: true },
  { id: 'rtp_mitsubishi_fujirebio_amb', code: 'MIT-FBA', name: 'Mitsubishi FujiRebio-Ambient', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'APAC', timezone: 'Asia/Tokyo', isActive: true },
  { id: 'rtp_mitsubishi_nishikawa', code: 'MIT-NS', name: 'Mitsubishi Nishikawa', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'APAC', timezone: 'Asia/Tokyo', isActive: true },
  { id: 'rtp_trusco_saitama', code: 'TRS-SAI', name: 'Trusco Saitama', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'APAC', timezone: 'Asia/Tokyo', isActive: true },
  { id: 'rtp_trusco_tohoku', code: 'TRS-TOH', name: 'Trusco Tohoku', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'APAC', timezone: 'Asia/Tokyo', isActive: true },
  { id: 'rtp_sbs_chile', code: 'SBS-CL', name: 'SBS Chile', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'LATAM', timezone: 'America/Santiago', isActive: true },
  { id: 'rtp_sodimac_colombia', code: 'SDM-CO', name: 'Sodimac Colombia', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'LATAM', timezone: 'America/Bogota', isActive: true },
  { id: 'rtp_sodimac_funza', code: 'SDM-FNZ', name: 'Sodimac Funza', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'LATAM', timezone: 'America/Bogota', isActive: true },
  { id: 'rtp_click_collect_1', code: 'CNC-01', name: 'Santiago Hub', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'LATAM', timezone: 'America/Santiago', isActive: true },
  { id: 'rtp_click_collect_2_fl', code: 'CNC-02', name: 'Florida', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-EAST', timezone: 'America/New_York', isActive: true },
  { id: 'rtp_click_collect_3_condes', code: 'CNC-03', name: 'Las Condes', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'LATAM', timezone: 'America/Santiago', isActive: true },
  { id: 'rtp_click_collect_4_maipu', code: 'CNC-04', name: 'Maipu', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'LATAM', timezone: 'America/Santiago', isActive: true },
  { id: 'rtp_click_collect_5_puerto', code: 'CNC-05', name: 'Puerto Montt', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'LATAM', timezone: 'America/Santiago', isActive: true },
  { id: 'rtp_click_collect_7_tumaco', code: 'CNC-07', name: 'Tumaco', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'LATAM', timezone: 'America/Bogota', isActive: true },
  { id: 'rtp_click_collect_8_talca', code: 'CNC-08', name: 'Talca', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'LATAM', timezone: 'America/Santiago', isActive: true },
  { id: 'rtp_click_collect_9_biobio', code: 'CNC-09', name: 'Biobio', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'LATAM', timezone: 'America/Santiago', isActive: true },
  { id: 'rtp_hm_robbinsville', code: 'HM-RBV', name: 'H&M Robbinsville Project-1', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-EAST', timezone: 'America/New_York', isActive: true },
  { id: 'rtp_robinson', code: 'ROB-01', name: 'Robinson', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-MIDWEST', timezone: 'America/Chicago', isActive: true },
  { id: 'rtp_hm_canada', code: 'HM-CA', name: 'H&M Canada', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'Canada', timezone: 'America/Toronto', isActive: true },
  { id: 'rtp_sams_lax', code: 'SAM-LAX', name: "Sam's LAX", category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-WEST', timezone: 'America/Los_Angeles', isActive: true },
  { id: 'rtp_macys', code: 'MCY-01', name: "Macy's", category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-EAST', timezone: 'America/New_York', isActive: true },
  { id: 'rtp_walmart_calgary', code: 'WMT-CGY', name: 'Walmart Calgary', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'Canada', timezone: 'America/Edmonton', isActive: true },
  { id: 'rtp_walmart_mexico', code: 'WMT-MX', name: 'Walmart Mexico', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'LATAM', timezone: 'America/Mexico_City', isActive: true },
  { id: 'rtp_dillards', code: 'DIL-01', name: "Dillard's", category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-SOUTH', timezone: 'America/Chicago', isActive: true },
  { id: 'rtp_evergreen_richmond', code: 'EVG-RCH', name: 'EverGreen Richmond', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-EAST', timezone: 'America/New_York', isActive: true },
  { id: 'rtp_gxo_nike', code: 'GXO-NKE', name: 'GXO-Nike', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-MIDWEST', timezone: 'America/Chicago', isActive: true },
  { id: 'rtp_gxo_verizon', code: 'GXO-VRZ', name: 'GXO-Verizon', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-EAST', timezone: 'America/New_York', isActive: true },
  { id: 'rtp_gxo_hager', code: 'GXO-HGR', name: 'GXO-Hager', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-EAST', timezone: 'America/New_York', isActive: true },
  { id: 'rtp_eddie_bauer', code: 'EB-01', name: 'Eddie Bauer', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-MIDWEST', timezone: 'America/Chicago', isActive: true },
  { id: 'rtp_ryder_whiplash', code: 'RYD-WHP', name: 'Ryder Whiplash', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-WEST', timezone: 'America/Los_Angeles', isActive: true },
  { id: 'rtp_sams_atl', code: 'SAM-ATL', name: "Sam's ATL", category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-EAST', timezone: 'America/New_York', isActive: true },
  { id: 'rtp_ykk', code: 'YKK-01', name: 'YKK', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-EAST', timezone: 'America/New_York', isActive: true },
  { id: 'rtp_dhl_figs', code: 'DHL-FIG', name: 'DHL Figs', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-WEST', timezone: 'America/Phoenix', isActive: true },
  { id: 'rtp_coupang_inc14', code: 'CPG-14', name: 'Coupang INC-14', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'APAC', timezone: 'Asia/Seoul', isActive: true },
  { id: 'rtp_stryker', code: 'STR-01', name: 'Stryker', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-MIDWEST', timezone: 'America/Chicago', isActive: true },
  { id: 'rtp_luxottica_fhr', code: 'LUX-FHR', name: 'Luxottica FHR', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'Europe', timezone: 'Europe/Rome', isActive: true },
  { id: 'rtp_luxottica_sedico', code: 'LUX-SED', name: 'Luxottica Sedico', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'Europe', timezone: 'Europe/Rome', isActive: true },
  { id: 'rtp_cardinal_health', code: 'CRD-HLT', name: 'Cardinal Health', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-MIDWEST', timezone: 'America/Chicago', isActive: true },
  { id: 'rtp_wayfair', code: 'WAY-01', name: 'Wayfair', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-EAST', timezone: 'America/New_York', isActive: true },
  { id: 'rtp_lakeside', code: 'LKS-01', name: 'Lakeside', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-MIDWEST', timezone: 'America/Chicago', isActive: true },
  { id: 'rtp_meli', code: 'MELI-01', name: 'Mercado Libre(MeLi)', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'LATAM', timezone: 'America/Buenos_Aires', isActive: true },
  { id: 'rtp_aritzia', code: 'ART-01', name: 'Aritizia', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'Canada', timezone: 'America/Vancouver', isActive: true },
  { id: 'rtp_ryder_maryland', code: 'RYD-MD', name: 'Ryder Maryland', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-EAST', timezone: 'America/New_York', isActive: true },
  { id: 'rtp_el_columbus', code: 'EL-CMB', name: 'EL-Columbus', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-MIDWEST', timezone: 'America/New_York', isActive: true },
  { id: 'rtp_meli_sp04', code: 'MELI-SP4', name: 'MeL SP04', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'LATAM', timezone: 'America/Sao_Paulo', isActive: true },
  { id: 'rtp_gxo_apple_new', code: 'GXO-APL', name: 'GXO Apple New', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-MIDWEST', timezone: 'America/Chicago', isActive: true },
  { id: 'rtp_gxo_af_new', code: 'GXO-AF', name: 'GXO A&F New', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-MIDWEST', timezone: 'America/New_York', isActive: true },
  { id: 'rtp_gxo_hm_new', code: 'GXO-HM', name: 'GXO H&M New', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-EAST', timezone: 'America/New_York', isActive: true },
  { id: 'rtp_casey_missouri', code: 'CSY-MO', name: 'Casey Missouri', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'US-MIDWEST', timezone: 'America/Chicago', isActive: true },
  { id: 'rtp_meli_mx13', code: 'MELI-MX13', name: 'Meli MX13', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'LATAM', timezone: 'America/Mexico_City', isActive: true },
  { id: 'rtp_exol', code: 'EXOL-01', name: 'EXOL', category: 'RTP_TTP', categoryLabel: 'RTP / TTP Sites', region: 'Europe', timezone: 'Europe/London', isActive: true },

  // --- 2. RMS (Ranger Mobile System) ---
  { id: 'rms_active_ants_nd', code: 'RMS-AA-ND', name: 'Active Ants ND', category: 'RMS', categoryLabel: 'RMS (Ranger Mobile System)', region: 'Europe', timezone: 'Europe/Amsterdam', isActive: true },
  { id: 'rms_active_ants_belgium', code: 'RMS-AA-BE', name: 'Active Ants Belgium', category: 'RMS', categoryLabel: 'RMS (Ranger Mobile System)', region: 'Europe', timezone: 'Europe/Brussels', isActive: true },
  { id: 'rms_active_ants_germany', code: 'RMS-AA-DE', name: 'Active Ants Germany', category: 'RMS', categoryLabel: 'RMS (Ranger Mobile System)', region: 'Europe', timezone: 'Europe/Berlin', isActive: true },
  { id: 'rms_active_ants_uk', code: 'RMS-AA-UK', name: 'Active Ants UK', category: 'RMS', categoryLabel: 'RMS (Ranger Mobile System)', region: 'Europe', timezone: 'Europe/London', isActive: true },
  { id: 'rms_hm_project_1', code: 'RMS-HM-P1', name: 'H&M Project-1', category: 'RMS', categoryLabel: 'RMS (Ranger Mobile System)', region: 'US-EAST', timezone: 'America/New_York', isActive: true },
  { id: 'rms_rex_brown', code: 'RMS-RB', name: 'Rex Brown', category: 'RMS', categoryLabel: 'RMS (Ranger Mobile System)', region: 'Europe', timezone: 'Europe/London', isActive: true },
  { id: 'rms_walmart_canada', code: 'RMS-WMT-CA', name: 'Walmart Canada', category: 'RMS', categoryLabel: 'RMS (Ranger Mobile System)', region: 'Canada', timezone: 'America/Toronto', isActive: true },
  { id: 'rms_dafiti', code: 'RMS-DFI', name: 'Dafiti', category: 'RMS', categoryLabel: 'RMS (Ranger Mobile System)', region: 'LATAM', timezone: 'America/Sao_Paulo', isActive: true },
  { id: 'rms_gxo_ricoh', code: 'RMS-GXO-RCH', name: 'GXO Ricoh', category: 'RMS', categoryLabel: 'RMS (Ranger Mobile System)', region: 'US-EAST', timezone: 'America/New_York', isActive: true },
  { id: 'rms_gxo_lacoste', code: 'RMS-GXO-LCT', name: 'GXO-Lacoste', category: 'RMS', categoryLabel: 'RMS (Ranger Mobile System)', region: 'US-EAST', timezone: 'America/New_York', isActive: true },
  { id: 'rms_hm_canada', code: 'RMS-HM-CA', name: 'H&M Canada', category: 'RMS', categoryLabel: 'RMS (Ranger Mobile System)', region: 'Canada', timezone: 'America/Toronto', isActive: true },
  { id: 'rms_apple_express', code: 'RMS-APL-EXP', name: 'Apple Express', category: 'RMS', categoryLabel: 'RMS (Ranger Mobile System)', region: 'US-WEST', timezone: 'America/Los_Angeles', isActive: true },
  { id: 'rms_dhl_figs_phx', code: 'RMS-DHL-FIG', name: 'DHL Figs (Pheonix, US)', category: 'RMS', categoryLabel: 'RMS (Ranger Mobile System)', region: 'US-WEST', timezone: 'America/Phoenix', isActive: true },
  { id: 'rms_dhl_figs_ob', code: 'RMS-DHL-OB', name: 'DHL Figs-OB', category: 'RMS', categoryLabel: 'RMS (Ranger Mobile System)', region: 'US-WEST', timezone: 'America/Phoenix', isActive: true },

  // --- 3. RA (Ranger Autonomous) ---
  { id: 'ra_dbs', code: 'RA-DBS', name: 'DBS', category: 'RA', categoryLabel: 'RA (Ranger Autonomous)', region: 'APAC', timezone: 'Asia/Singapore', isActive: true },
  { id: 'ra_walmart_canada', code: 'RA-WMT-CA', name: 'Walmart Canada', category: 'RA', categoryLabel: 'RA (Ranger Autonomous)', region: 'Canada', timezone: 'America/Toronto', isActive: true },
  { id: 'ra_seko', code: 'RA-SEKO', name: 'SEKO', category: 'RA', categoryLabel: 'RA (Ranger Autonomous)', region: 'US-MIDWEST', timezone: 'America/Chicago', isActive: true },

  // --- 4. RIL (Ranger In-Line) ---
  { id: 'ril_dorman', code: 'RIL-DOR', name: 'Dorman', category: 'RIL', categoryLabel: 'RIL (Ranger In-Line)', region: 'US-EAST', timezone: 'America/New_York', isActive: true },
  { id: 'ril_sbs', code: 'RIL-SBS', name: 'SBS', category: 'RIL', categoryLabel: 'RIL (Ranger In-Line)', region: 'LATAM', timezone: 'America/Santiago', isActive: true },
  { id: 'ril_walmart_edwards', code: 'RIL-WMT-EDW', name: 'Walmart Edwards', category: 'RIL', categoryLabel: 'RIL (Ranger In-Line)', region: 'US-MIDWEST', timezone: 'America/Chicago', isActive: true },
  { id: 'ril_sodimac_santiago', code: 'RIL-SDM-STG', name: 'Sodimac, Santiago, Chile', category: 'RIL', categoryLabel: 'RIL (Ranger In-Line)', region: 'LATAM', timezone: 'America/Santiago', isActive: true },
  { id: 'ril_sams_atl', code: 'RIL-SAM-ATL', name: 'SAMS ATL', category: 'RIL', categoryLabel: 'RIL (Ranger In-Line)', region: 'US-EAST', timezone: 'America/New_York', isActive: true },
  { id: 'ril_dish', code: 'RIL-DISH', name: 'Dish', category: 'RIL', categoryLabel: 'RIL (Ranger In-Line)', region: 'US-WEST', timezone: 'America/Denver', isActive: true },
  { id: 'ril_hm_canada', code: 'RIL-HM-CA', name: 'H&M Canada', category: 'RIL', categoryLabel: 'RIL (Ranger In-Line)', region: 'Canada', timezone: 'America/Toronto', isActive: true },
  { id: 'ril_kenco_goodyear', code: 'RIL-KNC-GY', name: 'Kenco-Goodyear', category: 'RIL', categoryLabel: 'RIL (Ranger In-Line)', region: 'US-WEST', timezone: 'America/Phoenix', isActive: true },
  { id: 'ril_kenco_kansas', code: 'RIL-KNC-KS', name: 'Kenco-Kansas', category: 'RIL', categoryLabel: 'RIL (Ranger In-Line)', region: 'US-MIDWEST', timezone: 'America/Chicago', isActive: true },
  { id: 'ril_ykk', code: 'RIL-YKK', name: 'YKK', category: 'RIL', categoryLabel: 'RIL (Ranger In-Line)', region: 'US-EAST', timezone: 'America/New_York', isActive: true },
  { id: 'ril_dorman_warsaw', code: 'RIL-DOR-WR', name: 'Dorman Warsaw', category: 'RIL', categoryLabel: 'RIL (Ranger In-Line)', region: 'Europe', timezone: 'Europe/Warsaw', isActive: true },
  { id: 'ril_adams_beverages', code: 'RIL-ADM-BEV', name: 'Adams Beverages', category: 'RIL', categoryLabel: 'RIL (Ranger In-Line)', region: 'US-SOUTH', timezone: 'America/Chicago', isActive: true },

  // --- 5. Case Pick ---
  { id: 'cp_kenco_goodyear', code: 'CP-KNC-GY', name: 'Kenco-Goodyear', category: 'CASE_PICK', categoryLabel: 'Case Pick', region: 'US-WEST', timezone: 'America/Phoenix', isActive: true },
  { id: 'cp_kellanova_rialto', code: 'CP-KLN-RLT', name: 'Kellanova Rialto', category: 'CASE_PICK', categoryLabel: 'Case Pick', region: 'US-WEST', timezone: 'America/Los_Angeles', isActive: true }
];

export function getSitesGroupedByCategory() {
  const grouped: Record<SiteCategory, EnterpriseSite[]> = {
    RTP_TTP: [],
    RMS: [],
    RA: [],
    RIL: [],
    CASE_PICK: []
  };

  ENTERPRISE_SITES.forEach((site) => {
    grouped[site.category].push(site);
  });

  return grouped;
}

export function getSiteByIdOrName(query: string): EnterpriseSite | undefined {
  const lower = query.toLowerCase();
  return ENTERPRISE_SITES.find(
    s => s.id.toLowerCase() === lower || s.code.toLowerCase() === lower || s.name.toLowerCase() === lower
  );
}

const CEMS_POOL = [
  { name: 'Marcus Vance', email: 'mvance@greyorange.com', phone: '+1 (404) 555-0192', slack: '@marcus.vance' },
  { name: 'Sarah Chen', email: 'schen@greyorange.com', phone: '+1 (312) 555-0144', slack: '@sarah.chen' },
  { name: 'Elena Rostova', email: 'erostova@greyorange.com', phone: '+1 (212) 555-0188', slack: '@elena.rostova' },
  { name: 'David Kim', email: 'dkim@greyorange.com', phone: '+1 (206) 555-0137', slack: '@david.kim' },
  { name: 'Alejandro Morales', email: 'amorales@greyorange.com', phone: '+56 (2) 555-0129', slack: '@alejandro.m' },
  { name: 'Kenji Sato', email: 'ksato@greyorange.com', phone: '+81 (3) 555-0193', slack: '@kenji.sato' },
  { name: 'Nathalie Dupont', email: 'ndupont@greyorange.com', phone: '+33 (1) 555-0182', slack: '@nathalie.d' },
  { name: 'Rajesh Sharma', email: 'rsharma@greyorange.com', phone: '+91 (124) 555-0165', slack: '@rajesh.s' },
];

export function generateDefaultSiteIntelligence(s: EnterpriseSite): SiteIntelligence {
  const hash = s.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const cleanCode = (s.code || 'SITE').toLowerCase().replace(/[^a-z0-9]/g, '-');
  const cleanId = (s.id || 'site').replace(/[^a-z0-9]/g, '-');
  const cem = CEMS_POOL[hash % CEMS_POOL.length];

  const octet2 = 100 + (hash % 150);
  const octet3 = 10 + (hash % 80);

  const vmIps: SiteVM[] = [
    {
      id: `${cleanId}-vm-1`,
      hostname: `${cleanCode}-app-prod-01`,
      ip: `10.${octet2}.${octet3}.11`,
      role: 'Application Cluster Primary',
      status: 'ONLINE',
      specs: 'Ubuntu 22.04 LTS (16 vCPU, 64GB RAM, 500GB NVMe)'
    },
    {
      id: `${cleanId}-vm-2`,
      hostname: `${cleanCode}-app-prod-02`,
      ip: `10.${octet2}.${octet3}.12`,
      role: 'Application Cluster Secondary',
      status: 'ONLINE',
      specs: 'Ubuntu 22.04 LTS (16 vCPU, 64GB RAM, 500GB NVMe)'
    },
    {
      id: `${cleanId}-vm-3`,
      hostname: `${cleanCode}-db-pg-master`,
      ip: `10.${octet2}.${octet3}.20`,
      role: 'PostgreSQL Primary Database',
      status: 'ONLINE',
      specs: 'Debian 12 (32 vCPU, 128GB RAM, 2TB SSD RAID-10)'
    },
    {
      id: `${cleanId}-vm-4`,
      hostname: `${cleanCode}-sorter-ctrl-01`,
      ip: `10.${octet2}.${octet3}.31`,
      role: 'Sorter Matrix PLC Controller',
      status: 'ONLINE',
      specs: 'Industrial Embedded Linux (8 vCPU, 32GB RAM)'
    },
    {
      id: `${cleanId}-vm-5`,
      hostname: `${cleanCode}-edge-gateway-01`,
      ip: `10.${octet2}.${octet3}.45`,
      role: 'Edge Hardware IoT Gateway',
      status: 'ONLINE',
      specs: 'Alpine Linux Edge (4 vCPU, 16GB RAM)'
    },
    {
      id: `${cleanId}-vm-6`,
      hostname: `${cleanCode}-telemetry-agent-01`,
      ip: `10.${octet2}.${octet3}.55`,
      role: 'InfluxDB Telemetry Stream Agent',
      status: hash % 7 === 0 ? 'MAINTENANCE' : 'ONLINE',
      specs: 'Ubuntu 22.04 LTS (8 vCPU, 32GB RAM)'
    }
  ];

  const versions = ['v4.19.2-patch.1', 'v4.19.1', 'v4.18.6-hotfix', 'v4.20.0-rc.3', 'v4.19.0'];
  const deployers = ['DevOps Pipeline (GitHub Actions)', 'Marcus Vance (Lead Automation)', 'Sarah Chen (Robotics Tech)', 'Automated Release Bot v2.4'];
  const commitHashes = ['7f8e91a', 'b42c89d', '910fa3e', 'e719c02', '3a98dc5'];

  const recentDeployment: SiteDeployment = {
    version: versions[hash % versions.length],
    deployedAt: `2026-09-${String(10 + (hash % 5)).padStart(2, '0')} 03:30 UTC`,
    deployedBy: deployers[hash % deployers.length],
    commitHash: commitHashes[hash % commitHashes.length],
    environment: `${s.region} Production Cluster`,
    notes: `Deployed optimized Ranger AGV trajectory scheduler and patched inverter sensor polling timeout. Verification tests passed with 0 telemetry degradation.`
  };

  const dashboardLinks: SiteDashboardLink[] = [
    {
      id: 'dash_grafana_core',
      title: 'Grafana Telemetry & Sorter Metrics',
      url: `https://cloudwatch.greymatter.greyorange.com/d-solo/LyR7MASDk/process-service-metrics-dashboard-v1?orgId=1&var-site=${s.code}`,
      category: 'Metrics',
      description: 'Live real-time telemetry from facility induction lines, sorters, and motor drivers.'
    },
    {
      id: 'dash_greymatter_ops',
      title: 'GreyMatter Platform Operations Portal',
      url: `https://greymatter.greyorange.com/facilities/${s.id}`,
      category: 'Platform',
      description: 'Central fleet overview, WMS warehouse integrations, and SKU throughput counters.'
    },
    {
      id: 'dash_kibana_logs',
      title: 'Kibana Centralized Incident Logs',
      url: `https://kibana.internal.greyorange.com/app/discover?site=${s.id}`,
      category: 'Logs',
      description: 'Distributed log ingestion pipeline filtered for warning and critical traces.'
    },
    {
      id: 'dash_butler_fleet',
      title: 'Ranger AGV Fleet Dispatcher',
      url: `https://butler.internal.greyorange.com/fleet/${s.code}`,
      category: 'Robotics',
      description: 'Grid coordinate heatmaps, rack collision avoidance status, and bot battery charge.'
    },
    {
      id: 'dash_cloudwatch_alarms',
      title: 'AWS CloudWatch Health & Alarms',
      url: `https://console.aws.amazon.com/cloudwatch/home?region=${s.region === 'LATAM' ? 'sa-east-1' : s.region === 'Europe' ? 'eu-central-1' : 'us-east-1'}#dashboards:name=${s.code}-core`,
      category: 'Infrastructure',
      description: 'Cloud compute latency, database connection pool, and network interface metrics.'
    },
    {
      id: 'dash_influx_telemetry',
      title: 'InfluxDB Raw Telemetry Stream',
      url: `https://influx.internal.greyorange.com/orgs/ops/buckets/${s.id}`,
      category: 'Telemetry',
      description: 'Sub-second motor vibration, optical scanner reflection, and thermal sensors.'
    }
  ];

  const slackChannelName = `#ops-${cleanCode}`;
  const slackChannelUrl = `https://slack.com/app_redirect?channel=${cleanCode}`;

  const warRoomMeetingId = `${800 + (hash % 199)} ${100 + (hash % 899)} ${1000 + (hash % 8999)}`;
  const warRoomPasscode = `NOC-${cleanCode.toUpperCase()}`;
  const warRoomName = `${s.name} NOC War Room`;
  const warRoomUrl = `https://greyorange.zoom.us/j/${warRoomMeetingId.replace(/\s/g, '')}?pwd=${warRoomPasscode}`;

  const siteNotes = `### Operational Handover & Site Runbook: ${s.name} (${s.code})

**Facility Profile:**
- **Target Peak Throughput:** 18,500 Units Per Hour (UPH)
- **Active Grid Footprint:** 320,000 sq ft automation zone
- **Assigned CEM Lead:** ${cem.name} (${cem.email})

**Critical Shift Protocols:**
1. **Induction Line 2 Maintenance Window:** Daily 04:00 - 05:30 Local Time. Never trigger sorter diagnostics during peak pick hours (10:00 - 18:00).
2. **Ranger AGV Battery Management:** Ensure charging station bay #3 through #8 maintain >= 95% active charger uptime.
3. **Escalation Path:** For SEV-1 incidents, alert the Slack channel \`${slackChannelName}\`, join the [Zoom Incident War Room](${warRoomUrl}) (ID: \`${warRoomMeetingId}\`, Passcode: \`${warRoomPasscode}\`), and page ${cem.name} immediately via ${cem.phone}.
`;

  const alerts: SiteAlert[] = [
    {
      id: `${cleanId}-alt-1`,
      alertKey: `ALT-${s.code}-901`,
      title: 'Butler AGV Drive Motor Over-Temperature Threshold Exceeded',
      severity: 'CRITICAL',
      subsystem: 'Butler Fleet',
      sourceComponent: `BOT-${100 + (hash % 80)}`,
      status: 'FIRING',
      timestamp: '04:18 AM EDT',
      value: `${78 + (hash % 6)}.4°C (Limit: 75.0°C)`,
      description: 'Internal thermal sensor on drive wheel assembly #2 triggered safety throttle. Bot slowed to 0.4m/s; heat dissipation cycle required.',
      acknowledgedBy: '',
      runbookUrl: 'https://greymatter.internal.greyorange.com/runbooks/bot-thermal'
    },
    {
      id: `${cleanId}-alt-2`,
      alertKey: `ALT-${s.code}-902`,
      title: 'Sorter CAN-Bus PLC Transceiver Intermittent Frame Drop',
      severity: 'WARNING',
      subsystem: 'Sorter Bridge',
      sourceComponent: 'PLC-CAN-02',
      status: 'FIRING',
      timestamp: '04:05 AM EDT',
      value: '3.8% Packet Jitter (Limit: 1.0%)',
      description: 'CRC parity re-transmissions detected on CAN-Bus channel B. Optical isolator reporting voltage ripple above normal threshold.',
      acknowledgedBy: '',
      runbookUrl: 'https://greymatter.internal.greyorange.com/runbooks/canbus-jitter'
    },
    {
      id: `${cleanId}-alt-3`,
      alertKey: `ALT-${s.code}-903`,
      title: 'Optical Induction Scanner Focal Lens Contrast Saturation',
      severity: 'WARNING',
      subsystem: 'Optics Scanner',
      sourceComponent: 'SCAN-HEAD-04',
      status: 'ACKNOWLEDGED',
      timestamp: '03:42 AM EDT',
      value: '84.2% Read Rate (Limit: 96.0%)',
      description: 'High-speed camera sensor saturation on Induct Line #4. Lens dust cleaning cycle pending; auto-contrast algorithm compensates partially.',
      acknowledgedBy: cem.name,
      runbookUrl: 'https://greymatter.internal.greyorange.com/runbooks/optical-cleaning'
    },
    {
      id: `${cleanId}-alt-4`,
      alertKey: `ALT-${s.code}-904`,
      title: 'Platform Transaction Ingestion Queue Buffer Warning',
      severity: 'CRITICAL',
      subsystem: 'Platform',
      sourceComponent: 'GREYMATTER-INGEST',
      status: 'FIRING',
      timestamp: '03:15 AM EDT',
      value: '82% Queue Fill (Limit: 70%)',
      description: 'Burst of SKU scan events caused temporary queuing in message broker. Scale-up worker daemon provisioned.',
      acknowledgedBy: '',
      runbookUrl: 'https://greymatter.internal.greyorange.com/runbooks/queue-pressure'
    },
    {
      id: `${cleanId}-alt-5`,
      alertKey: `ALT-${s.code}-905`,
      title: 'InfluxDB Time-Series Batch Ingestion Latency Elevation',
      severity: 'INFO',
      subsystem: 'InfluxDB',
      sourceComponent: 'INFLUX-AGENT-01',
      status: 'RESOLVED',
      timestamp: '02:50 AM EDT',
      value: '42ms Write Latency (Norm: 12ms)',
      description: 'Storage partition compaction momentarily increased write latency. Disk I/O normalized.',
      acknowledgedBy: 'Automation Watchdog',
      runbookUrl: 'https://greymatter.internal.greyorange.com/runbooks/influx-compaction'
    },
    {
      id: `${cleanId}-alt-6`,
      alertKey: `ALT-${s.code}-906`,
      title: 'Ranger AGV Fast-Charging Station Bay #5 Current Ripple',
      severity: 'WARNING',
      subsystem: 'Battery Systems',
      sourceComponent: 'BAY-CHG-05',
      status: 'SILENCED',
      timestamp: '01:20 AM EDT',
      value: '14.2A RMS Jitter (Limit: 8.0A)',
      description: 'Ground contact pad wear detected on charging pin #2. Silenced pending scheduled technician inspection window.',
      acknowledgedBy: cem.name,
      runbookUrl: 'https://greymatter.internal.greyorange.com/runbooks/charger-pad'
    }
  ];

  return {
    siteId: s.id,
    code: s.code,
    name: s.name,
    category: s.category,
    categoryLabel: s.categoryLabel,
    region: s.region,
    timezone: s.timezone,
    isActive: s.isActive,
    slackChannelName,
    slackChannelUrl,
    warRoomUrl,
    warRoomName,
    warRoomMeetingId,
    warRoomPasscode,
    cem,
    recentDeployment,
    vmIps,
    dashboardLinks,
    siteNotes,
    alerts
  };
}
