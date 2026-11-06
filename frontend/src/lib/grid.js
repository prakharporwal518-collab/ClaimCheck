import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community'
import { LicenseManager, MasterDetailModule, RichSelectModule, SetFilterModule, StatusBarModule } from 'ag-grid-enterprise'

ModuleRegistry.registerModules([AllCommunityModule, MasterDetailModule, RichSelectModule, SetFilterModule, StatusBarModule])

const key = import.meta.env.VITE_AG_GRID_LICENSE_KEY
if (key) {
  LicenseManager.setLicenseKey(key)
}

export const gridTheme = themeQuartz.withParams({
  fontFamily: 'Inter, ui-sans-serif, system-ui',
  fontSize: 13,
  headerFontWeight: 600,
  headerBackgroundColor: '#f8fafc',
  headerTextColor: '#475569',
  borderColor: '#e2e8f0',
  rowHoverColor: '#f1f5f9',
  selectedRowBackgroundColor: '#eff6ff',
  accentColor: '#1d4ed8',
  wrapperBorderRadius: 12,
  spacing: 7,
})
