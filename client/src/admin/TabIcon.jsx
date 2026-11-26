// Telefondaki alt çubuğun ve "Daha fazla" penceresinin ikonları. Kütüphane yok: her biri birkaç satırlık SVG.
// Çizgi rengi yazı renginden gelir (currentColor), seçili sekmede kendiliğinden ana renge döner.
// Etiket her zaman ikonun yanında yazılı; ikon tek başına anlam taşımaz, bu yüzden ekran okuyucudan gizli.
const PATHS = {
  today: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  dashboard: <path d="M5 20V12M10 20V6M15 20v-9M20 20V4M3 20h18" />,
  customers: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 5.2a3.4 3.4 0 0 1 0 6.6M18.5 14.8c1.7.8 2.7 2.5 3 5.2" />
    </>
  ),
  groups: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </>
  ),
  instructors: (
    <>
      <circle cx="12" cy="7.5" r="3.5" />
      <path d="M5 20.5c.7-4 3.5-6 7-6s6.3 2 7 6M12 14.5v3" />
    </>
  ),
  payments: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="3" />
      <path d="M2.5 10h19M6.5 15h4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
    </>
  ),
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="18.5" cy="12" r="1.4" />
    </>
  ),
};

export default function TabIcon({ id }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[id] ?? PATHS.more}
    </svg>
  );
}
