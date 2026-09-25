export type SiteCategory = 'RTP_TTP' | 'RMS' | 'RA' | 'RIL' | 'CASE_PICK';

export interface EnterpriseSite {
  id: string;
  code: string;
  name: string;
  category: SiteCategory;
  categoryLabel: string;
  region: string;
  timezone: string;
  isActive: boolean;
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

export const ALL_ENTERPRISE_SITES = ENTERPRISE_SITES;

export function getSitesByCategory() {
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

export function findSiteById(id: string): EnterpriseSite | undefined {
  const lower = id.toLowerCase();
  return ENTERPRISE_SITES.find(
    s => s.id.toLowerCase() === lower || s.code.toLowerCase() === lower || s.name.toLowerCase() === lower
  );
}

export const getSiteByIdOrName = findSiteById;
