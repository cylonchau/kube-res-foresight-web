/** The storage namespace */
declare namespace StorageType {
  interface Session {
    /** The theme color */
    themeColor: string;
    // /**
    //  * the theme settings
    //  */
    // themeSettings: App.Theme.ThemeSetting;
  }

  interface Local {
    /** The i18n language */
    lang: App.I18n.LangType;
    /** The token */
    token: string;
    /** Fixed sider with mix-menu */
    mixSiderFixed: CommonType.YesOrNo;
    tableDensity: NaiveUI.RowDensity;
    /**
     * What the history page remembers in this browser, so the choices are not made again at every visit: the module, the metric, the line
     * type, the length of a relative time window and the curves switched off in the chart (null: none was chosen, the default applies).
     */
    compareView: {
      moduleId: number | null;
      metric: string | null;
      lineType: 'line' | 'step' | 'candle';
      relativeMs: number | null;
      hidden: string[] | null;
    };
    /** The refresh token */
    refreshToken: string;
    /** The theme color */
    themeColor: string;
    /** The dark mode */
    darkMode: boolean;
    /** The theme settings */
    themeSettings: App.Theme.ThemeSetting;
    /**
     * The override theme flags
     *
     * The value is the build time of the project
     */
    overrideThemeFlag: string;
    /** The global tabs */
    globalTabs: App.Global.Tab[];
    /** The backup theme setting before is mobile */
    backupThemeSettingBeforeIsMobile: {
      layout: UnionKey.ThemeLayoutMode;
      siderCollapse: boolean;
    };
    /** The last login user id */
    lastLoginUserId: string;
  }
}
