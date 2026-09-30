export const en = {
  localRoute: 'Local Route Proxy',
  localRouteDesc: 'Proxies external OpenAI/Anthropic requests to models configured in Harness.',
  localRouteEnabled: 'Enable local route',
  localRoutePort: 'Port',
  localRouteAddress: 'http://127.0.0.1:{port}',
  localRouteStart: 'Start local route',
  localRouteStop: 'Stop local route',
  localRouteRunning: 'Running',
  localRouteStopped: 'Stopped',
  localRouteApplying: 'Applying…',
  localRoutePortInvalid: 'Enter a port from 1024 to 65535.',
} as const

export const zh = {
  localRoute: '本地路由代理',
  localRouteDesc: '将外部 OpenAI / Anthropic 协议请求代理转发至当前已配置的模型。',
  localRouteEnabled: '启用本地路由',
  localRoutePort: '监听端口',
  localRouteAddress: 'http://127.0.0.1:{port}',
  localRouteStart: '启动本地路由',
  localRouteStop: '停止本地路由',
  localRouteRunning: '已启用',
  localRouteStopped: '已停止',
  localRouteApplying: '应用中…',
  localRoutePortInvalid: '请输入 1024 到 65535 之间的有效端口。',
} as const

export type ModelsKey = keyof typeof en
