import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community'
import { LicenseManager, MasterDetailModule, RichSelectModule, SetFilterModule, StatusBarModule } from 'ag-grid-enterprise'

ModuleRegistry.registerModules([AllCommunityModule, MasterDetailModule, RichSelectModule, SetFilterModule, StatusBarModule])

// AG Grid Enterprise key only (AG Studio reads VITE_AG_STUDIO_LICENSE_KEY in pages/Analytics.jsx).
const key = import.meta.env.VITE_AG_GRID_LICENSE_KEY
if (key) {
  LicenseManager.setLicenseKey(key)
}

// Every colour points at the app's CSS variables, so the grids switch with light/dark mode.
export const gridTheme = themeQuartz.withParams({
  fontFamily: 'Inter, ui-sans-serif, system-ui',
  fontSize: 13,
  backgroundColor: 'var(--card)',
  foregroundColor: 'var(--foreground)',
  textColor: 'var(--foreground)',
  subtleTextColor: 'var(--muted-foreground)',
  chromeBackgroundColor: 'var(--muted)',
  headerBackgroundColor: 'var(--muted)',
  headerTextColor: 'var(--muted-foreground)',
  headerFontWeight: 600,
  borderColor: 'var(--border)',
  rowBorder: { color: 'var(--border)' },
  rowHoverColor: 'var(--accent)',
  selectedRowBackgroundColor: 'var(--accent)',
  oddRowBackgroundColor: 'var(--card)',
  accentColor: 'var(--primary)',
  menuBackgroundColor: 'var(--card)',
  inputBackgroundColor: 'var(--card)',
  inputBorder: { color: 'var(--input)' },
  iconColor: 'var(--muted-foreground)',
  browserColorScheme: 'inherit',
  wrapperBorder: false,
  wrapperBorderRadius: 0,
  spacing: 7,
})
