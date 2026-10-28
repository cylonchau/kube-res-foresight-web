import { request } from '../request';

const base = '/api/v1';

export function fetchGetForecastModules(params?: Api.Forecast.ModuleSearchParams) {
  return request<Api.Forecast.ModuleList>({ url: `${base}/modules`, method: 'get', params });
}

export function fetchCreateForecastModule(data: Api.Forecast.ModulePayload) {
  return request<Api.Forecast.Module>({ url: `${base}/modules`, method: 'post', data });
}

export function fetchUpdateForecastModule(id: number, data: Api.Forecast.ModulePayload) {
  return request<Api.Forecast.Module>({ url: `${base}/modules/${id}`, method: 'put', data });
}

export function fetchDeleteForecastModule(id: number) {
  return request({ url: `${base}/modules/${id}`, method: 'delete' });
}

/** the catalog with the platform-wide setting of each algorithm, paged */
export function fetchGetAlgorithms(params?: Api.Forecast.AlgorithmSearchParams) {
  return request<Api.Forecast.Paged<Api.Forecast.Algorithm>>({ url: `${base}/algorithms`, method: 'get', params });
}

export function fetchGetAlgorithm(id: string) {
  return request<Api.Forecast.Algorithm>({ url: `${base}/algorithms/${id}`, method: 'get' });
}

/** change the setting of an algorithm; it applies to every module on the next cycle */
export function fetchUpdateAlgorithm(id: string, data: Api.Forecast.AlgorithmPayload) {
  return request<Api.Forecast.Algorithm>({ url: `${base}/algorithms/${id}`, method: 'put', data });
}

/** add a custom algorithm: an id, a parameter schema and a formula */
export function fetchCreateAlgorithm(data: Api.Forecast.AlgorithmCreatePayload) {
  return request<Api.Forecast.Algorithm>({ url: `${base}/algorithms`, method: 'post', data });
}

/** delete a custom algorithm (a built-in one is only disabled) */
export function fetchDeleteAlgorithm(id: string) {
  return request({ url: `${base}/algorithms/${id}`, method: 'delete' });
}

/** compile a formula and forecast a synthetic series with it, without storing anything */
export function fetchCheckFormula(data: Api.Forecast.FormulaCheckPayload) {
  return request<Api.Forecast.FormulaCheckResult>({ url: `${base}/algorithm-formulas/check`, method: 'post', data });
}

export function fetchGetFormulaHelp() {
  return request<Api.Forecast.FormulaHelp>({ url: `${base}/algorithm-formulas/functions`, method: 'get' });
}

/** the training records, paged */
export function fetchGetTrainingRuns(params: {
  page: number;
  page_size: number;
  module_id?: number;
  metric?: string;
  algorithm_id?: string;
  status?: string;
  from?: string;
  to?: string;
}) {
  return request<Api.Forecast.Paged<Api.Forecast.TrainingRun>>({ url: `${base}/training-runs`, method: 'get', params });
}

/** how the training records of a filter ended, per algorithm, and why runs did not produce a forecast */
/** the samples of the history window of a training record and the forecast it wrote */
export function fetchGetTrainingData(id: number) {
  return request<Api.Forecast.TrainingData>({ url: `${base}/training-runs/${id}/data`, method: 'get' });
}

export function fetchGetTrainingSummary(params: {
  module_id?: number;
  metric?: string;
  algorithm_id?: string;
  status?: string;
  from?: string;
  to?: string;
}) {
  return request<Api.Forecast.TrainingSummary>({ url: `${base}/training-runs/summary`, method: 'get', params });
}

/** the categories, kinds, aggregations and periods a dataset can be made of */
export function fetchGetDatasetCatalog() {
  return request<Api.Forecast.DatasetCatalog>({ url: `${base}/dataset/catalog`, method: 'get' });
}

/** what each enabled algorithm needs of the dataset of a module, and whether the history range holds it */
export function fetchGetModuleRequirements(moduleId: number) {
  return request<Api.Forecast.Requirement[]>({ url: `${base}/modules/${moduleId}/requirements`, method: 'get' });
}

/** the error, accuracy and weight of every source and the composite per algorithm, against the actuals */
export function fetchGetMetricScores(moduleId: number, params?: { since_hours?: number; from?: string; to?: string }) {
  return request<Api.Forecast.MetricScores>({
    url: `${base}/modules/${moduleId}/metric-scores`,
    method: 'get',
    params
  });
}

export function fetchGetCurrentRankings(params: {
  page: number;
  page_size: number;
  module_id?: number;
  keyword?: string;
}) {
  return request<Api.Forecast.Paged<Api.Forecast.CurrentRanking>>({
    url: `${base}/algorithm-rankings/current`,
    method: 'get',
    params
  });
}

export function fetchGetHistoryRankings(params: {
  page: number;
  page_size: number;
  module_id?: number;
  algorithm?: string;
  from?: string;
  to?: string;
}) {
  return request<Api.Forecast.Paged<Api.Forecast.HistoryRanking>>({
    url: `${base}/algorithm-rankings/history`,
    method: 'get',
    params
  });
}

/** the metric sources of a module */
export function fetchGetModuleSources(moduleId: number) {
  return request<Api.Forecast.DatasetSource[]>({ url: `${base}/modules/${moduleId}/sources`, method: 'get' });
}

export function fetchCreateModuleSource(moduleId: number, data: Api.Forecast.SourcePayload) {
  return request<Api.Forecast.Source>({ url: `${base}/modules/${moduleId}/sources`, method: 'post', data });
}

export function fetchUpdateModuleSource(moduleId: number, id: number, data: Api.Forecast.SourcePayload) {
  return request<Api.Forecast.Source>({ url: `${base}/modules/${moduleId}/sources/${id}`, method: 'put', data });
}

export function fetchDeleteModuleSource(moduleId: number, id: number) {
  return request({ url: `${base}/modules/${moduleId}/sources/${id}`, method: 'delete' });
}

export function fetchGetPeriods(moduleId: number) {
  return request<Api.Forecast.Period[]>({ url: `${base}/modules/${moduleId}/overrides`, method: 'get' });
}

export function fetchCreatePeriod(moduleId: number, data: Api.Forecast.PeriodPayload) {
  return request<Api.Forecast.Period>({ url: `${base}/modules/${moduleId}/overrides`, method: 'post', data });
}

export function fetchUpdatePeriod(moduleId: number, id: number, data: Api.Forecast.PeriodPayload) {
  return request<Api.Forecast.Period>({ url: `${base}/modules/${moduleId}/overrides/${id}`, method: 'put', data });
}

export function fetchDeletePeriod(moduleId: number, id: number) {
  return request({ url: `${base}/modules/${moduleId}/overrides/${id}`, method: 'delete' });
}

export function fetchGetModuleHistory(
  moduleId: number,
  params: { metric: string; from?: string; to?: string; max_points?: number }
) {
  return request<Api.Forecast.History>({ url: `${base}/modules/${moduleId}/history`, method: 'get', params });
}

export function fetchCollectModule(moduleId: number) {
  return request<Api.Forecast.CollectResult[]>({ url: `${base}/modules/${moduleId}/collect`, method: 'post' });
}

/** every enabled algorithm forecasts every forecast source of the module */
export function fetchPredictModule(moduleId: number) {
  return request<Api.Forecast.PredictOutcome[]>({ url: `${base}/modules/${moduleId}/predict`, method: 'post' });
}

/** collect, then predict */
export function fetchRunModule(moduleId: number) {
  return request({ url: `${base}/modules/${moduleId}/run`, method: 'post' });
}

export function fetchBacktestModule(moduleId: number, data: { metric: string; cutoffs?: number }) {
  return request<Api.Forecast.BacktestRun[]>({ url: `${base}/modules/${moduleId}/backtest`, method: 'post', data });
}

export function fetchEvaluateModule(moduleId: number) {
  return request<Array<{ metric: string; evaluated: number; pending: number }>>({
    url: `${base}/modules/${moduleId}/evaluate`,
    method: 'post'
  });
}

export function fetchRecommendModule(moduleId: number) {
  return request<{ recommendation: Api.Forecast.Recommendation; detail: unknown }>({
    url: `${base}/modules/${moduleId}/recommend`,
    method: 'post'
  });
}

/** every kind of list the audit pages share: server paging, a time window and one whitelisted sort */
interface ListWindow {
  page: number;
  page_size: number;
  from?: string;
  to?: string;
  sort_by?: string;
  sort_order?: string;
}

export function fetchSearchBacktests(
  params: ListWindow & {
    module_id?: number;
    metric?: string;
    algorithm_id?: string;
    promoted?: boolean;
  }
) {
  return request<Api.Forecast.Paged<Api.Forecast.BacktestRun>>({ url: `${base}/backtests`, method: 'get', params });
}

export function fetchGetLeaderboard(
  moduleId: number,
  params: { kind: string; since_hours?: number; from?: string; to?: string }
) {
  return request<Api.Forecast.LeaderboardEntry[]>({
    url: `${base}/modules/${moduleId}/leaderboard`,
    method: 'get',
    params
  });
}

export function fetchGetEvaluations(
  params: ListWindow & { module_id?: number; metric?: string; algorithm_id?: string; since_hours?: number }
) {
  return request<Api.Forecast.Paged<Api.Forecast.Evaluation>>({ url: `${base}/evaluations`, method: 'get', params });
}

export function fetchGetRecommendations(
  params: ListWindow & {
    module_id?: number;
    mode?: string;
    version?: number;
    source?: string;
    degraded?: boolean;
    oom_floor?: boolean;
    /** one snapshot per module: the current one */
    latest?: boolean;
  }
) {
  return request<Api.Forecast.Paged<Api.Forecast.Recommendation>>({
    url: `${base}/recommendations`,
    method: 'get',
    params
  });
}

export function fetchGetSnapshots(
  params: ListWindow & { module_id?: number; state?: string; covers_version?: number }
) {
  return request<Api.Forecast.Paged<Api.Forecast.Snapshot>>({ url: `${base}/snapshots`, method: 'get', params });
}

export function fetchGetSnapshot(id: number) {
  return request<Api.Forecast.Snapshot>({ url: `${base}/snapshots/${id}`, method: 'get' });
}

export function fetchGetFallbacks(
  params: ListWindow & { module_id?: number; reason?: string; kind?: Api.Forecast.FallbackKind }
) {
  return request<Api.Forecast.Paged<Api.Forecast.FallbackRecord>>({ url: `${base}/fallbacks`, method: 'get', params });
}

export function fetchGetScaleOutcomes(params: ListWindow & { module_id?: number; verdict?: string }) {
  return request<Api.Forecast.Paged<Api.Forecast.ScaleOutcome>>({
    url: `${base}/scale-outcomes`,
    method: 'get',
    params
  });
}

export function fetchGetExecutions(
  params: ListWindow & { module_id?: number; result?: string; action?: string; keyword?: string }
) {
  return request<Api.Forecast.Paged<Api.Forecast.Execution>>({
    url: `${base}/scaling-decisions`,
    method: 'get',
    params
  });
}

export function fetchBypassModule(moduleId: number, reason: string) {
  return request({ url: `${base}/controls/${moduleId}/bypass`, method: 'post', data: { reason } });
}

export function fetchResumeModule(moduleId: number) {
  return request({ url: `${base}/controls/${moduleId}/resume`, method: 'post' });
}

export function fetchGetLdapSettings() {
  return request<Api.Ldap.Settings>({ url: `${base}/ldap/settings`, method: 'get' });
}

export function fetchUpdateLdapSettings(data: Api.Ldap.SettingsPayload) {
  return request<Api.Ldap.Settings>({ url: `${base}/ldap/settings`, method: 'put', data });
}

export function fetchTestLdap(data: { username?: string }) {
  return request<Api.Ldap.TestResult>({ url: `${base}/ldap/test`, method: 'post', data });
}

export function fetchSyncLdap() {
  return request<Api.Ldap.SyncResult>({ url: `${base}/ldap/sync`, method: 'post' });
}

export function fetchGetForecastMetricCatalog() {
  return request<{ list: Api.Forecast.MetricDef[] }>({ url: `${base}/forecast-metrics/catalog`, method: 'get' });
}

export function fetchQueryForecastMetric(params: Api.Forecast.MetricQueryParams) {
  return request<Api.Forecast.MetricQueryResult>({ url: `${base}/forecast-metrics/query`, method: 'get', params });
}

export function fetchGetAlgorithmUsage(id: string) {
  return request<Api.Forecast.AlgorithmUsage>({ url: `${base}/algorithms/${id}/usage`, method: 'get' });
}

export function fetchGetModuleTrace(moduleId: number, algorithm: string, source?: string) {
  return request<Api.Forecast.Trace>({
    url: `${base}/modules/${moduleId}/trace`,
    method: 'get',
    params: { algorithm, source }
  });
}

export function fetchScoreModule(moduleId: number) {
  return request<Api.Forecast.AlgorithmScore[]>({ url: `${base}/modules/${moduleId}/score`, method: 'post' });
}

export function fetchGetRanking(moduleId: number) {
  return request<Api.Forecast.Ranking>({ url: `${base}/modules/${moduleId}/ranking`, method: 'get' });
}

export function fetchGetAlgorithmScores(
  params: ListWindow & { module_id?: number; algorithm?: string; selected?: boolean }
) {
  return request<Api.Forecast.Paged<Api.Forecast.AlgorithmScore>>({
    url: `${base}/algorithm-scores`,
    method: 'get',
    params
  });
}

/** the newest score of every algorithm of every module (or one), one row per resource */
export function fetchGetLatestScores(params: {
  page: number;
  page_size: number;
  module_id?: number;
  algorithm?: string;
  metric?: string;
}) {
  return request<Api.Forecast.Paged<Api.Forecast.ScoreRow>>({
    url: `${base}/algorithm-scores/latest`,
    method: 'get',
    params
  });
}

export function fetchGetAdmissions(params: ListWindow & { module_id?: number; applied?: boolean; keyword?: string }) {
  return request<Api.Forecast.Paged<Api.Forecast.Admission>>({ url: `${base}/admissions`, method: 'get', params });
}

/** enable, disable or delete several modules; items that cannot be done come back with their reason */
export function fetchBatchModules(data: { action: 'enable' | 'disable' | 'delete'; ids: number[] }) {
  return request<Api.Forecast.BatchResult>({ url: `${base}/modules/batch`, method: 'post', data });
}

/** enable, disable or delete several algorithms (only user-defined ones, once disabled, can be deleted) */
export function fetchBatchAlgorithms(data: { action: 'enable' | 'disable' | 'delete'; ids: string[] }) {
  return request<Api.Forecast.BatchResult>({ url: `${base}/algorithms/batch`, method: 'post', data });
}

/** delete rows of a record list: scores, backtests, evaluations, trainings, executions or admissions */
export function fetchBatchDeleteRecords(data: { kind: Api.Forecast.RecordKind; ids: number[] }) {
  return request<{ done: number }>({ url: `${base}/records/batch-delete`, method: 'post', data });
}

/** the actual values of a metric from Prometheus next to the forecasts of the algorithms, on one time grid */
export function fetchCompareModule(
  moduleId: number,
  params: {
    metric: string;
    from?: string;
    to?: string;
    algorithms?: string;
    max_points?: number;
    predictions?: boolean;
  }
) {
  return request<Api.Forecast.Compare>({ url: `${base}/modules/${moduleId}/compare`, method: 'get', params });
}

/** validate a PromQL and run it against its datasource for a short window; nothing is stored */
export function fetchTestMetricQuery(data: Api.Forecast.QueryTestRequest) {
  return request<Api.Forecast.QueryTestResult>({ url: `${base}/metric-queries/test`, method: 'post', data });
}
