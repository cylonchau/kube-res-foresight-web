# KubeForecast Admin

Management foundation for Kubernetes resource forecasting, Pod scaling orchestration
and capacity planning.

The admin preserves the Vue 3, Naive UI, Pinia and Elegant Router architecture.
Supported modules: Data Sources, Forecast, Task Center, System Management and
Authorization Management. The profile is a hidden self-service route.

Run pnpm install --frozen-lockfile, then pnpm dev for development.
Validate with pnpm typecheck, pnpm test:unit and pnpm build.
Build output is packaged into the backend from dist/.
Local API proxy overrides belong in the ignored .env.test.local file.

Based on Soybean Admin; its MIT license and shared component architecture remain.
