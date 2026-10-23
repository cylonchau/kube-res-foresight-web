# KubeForecast 管理界面

面向 Kubernetes 资源预测、Pod 弹性扩容与容量规划的管理基础框架。

沿用 Vue 3、Naive UI、Pinia、Elegant Router 和共享列表组件。
只保留工作流引擎、系统管理、授权管理、任务中心四个菜单模块。
个人中心是隐藏的登录自助页面。后端通过动态权限接口返回菜单。

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm test:unit
pnpm build
```

构建结果位于 `dist/`，由后端打包流程嵌入。
本地后端代理配置写入忽略的 `.env.test.local` 文件。
本界面基于 Soybean Admin，保留其 MIT 许可证及共享组件架构。
