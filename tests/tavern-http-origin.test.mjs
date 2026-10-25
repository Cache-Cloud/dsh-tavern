import test from 'node:test'
import assert from 'node:assert/strict'
import { registerTavernHttpRoutes } from '../tavern-plugin/lib/http/routes.js'

// 只为了拿到 handleTavernRequest：registerTavernHttpRoutes 在没有 webServer 时
// 只做一次 exposeHandler 回调，不注册任何路由，也不读取其它依赖。
function handle() {
  let handler
  const ctx = { get: () => undefined, effect: () => {} }
  registerTavernHttpRoutes({
    ctx,
    dispatch: async () => {},
    fileResources: {}, helperHistoryAccess: {}, mobileCardImport: {},
    performanceDiagnostics: {}, runtimeGeneration: 1, runtimeReadiness: {},
    sceneIllustrations: {}, readPluginMediaFile: async () => {},
    pluginAssets: {}, sessionResources: { read: async () => '{}' },
    str: String, tavernRemoteAssets: {}, tavernStaticResources: {},
    castAssets: {}, assetLibrary: undefined, speech: {},
    exportCardFile: async () => {}, assetPacks: {}, uploads: {},
    exposeHandler: (fn) => { handler = fn },
  })
  return handler
}

function capture() {
  const res = { status: 0, headers: {}, body: '' }
  res.writeHead = (status, headers) => { res.status = status; if (headers) res.headers = headers }
  res.end = (body) => { res.body = body === undefined ? '' : String(body) }
  return res
}

async function call(handler, { origin, host, method = 'GET', url = '/api/dsh-tavern/runtime-generation' }) {
  const res = capture()
  const headers = {}
  if (host !== undefined) headers.host = host
  if (origin !== undefined) headers.origin = origin
  await handler({ method, url, headers }, res)
  return res
}

const PUBLIC = 'noval-wang.kutina.cn'

test('反向代理下同源 Origin 放行：Origin 与请求 Host 一致时不再 403', async () => {
  const handler = handle()
  // 隧道/反代场景：浏览器发 Origin=https://<公网域名>，Host 也是该域名。
  const res = await call(handler, { host: PUBLIC, origin: `https://${PUBLIC}` })
  assert.equal(res.status, 200, '同源 Origin 不应被 Origin 围栏拦下')
  assert.match(res.body, /runtimeGeneration|ok/)
})

test('loopback 形式与空 Origin 仍然放行（原有行为不变）', async () => {
  const handler = handle()
  for (const origin of [undefined, '', 'http://127.0.0.1:3081', 'http://localhost:3081']) {
    const res = await call(handler, { host: PUBLIC, origin })
    assert.equal(res.status, 200, `Origin=${String(origin)} 应保持放行`)
  }
})

test('跨站 Origin 仍然被拒绝，放行范围没有被放宽', async () => {
  const handler = handle()
  for (const origin of [
    'https://evil.example.com',
    'https://noval-wang.kutina.cn.evil.example.com',
    'http://noval-wang.kutina.cn.attacker.test',
  ]) {
    const res = await call(handler, { host: PUBLIC, origin })
    assert.equal(res.status, 403, `Origin=${origin} 必须仍被拒绝`)
    assert.equal(res.body, 'forbidden')
  }
})

test('Origin 协议与 Host 不匹配时仍拒绝（http/https 不能互相冒充）', async () => {
  const handler = handle()
  const res = await call(handler, { host: PUBLIC, origin: `https://${PUBLIC}:8443` })
  assert.equal(res.status, 403, '端口不同不算同源')
})
