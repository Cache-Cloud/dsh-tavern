import test from 'node:test'
import assert from 'node:assert/strict'
import { createBackgroundNativeRuntime } from './fixtures/background-native-runtime.mjs'
import { createNetworkToolPolicy, installNetworkToolPolicy } from '../tavern-plugin/lib/domain/network-tools.js'
import { installWebAccess } from '../tavern-plugin/lib/tools/web-access.js'

test('真实 DSH 工具调用通过异步联网门禁，关掉开关后调用不触网', { skip: !process.env.DSH_BOOT_MODULE }, async t => {
  let host, enabled = true, fetchEnabled = false, requests = 0
  const runtime = await createBackgroundNativeRuntime(process.env.DSH_BOOT_MODULE, { setupHost(ctx) {
    host = ctx
    ctx.provide('web', {
      config: { searchProvider: { get: () => 'custom-provider' } },
      registerSearchProvider() { return () => {} },
      async fetch() { requests++; return { url: 'https://example.com/work', statusCode: 200, body: { kind: 'html', content: '<article>核对过的作品资料</article>' }, truncated: false } }
    })
    installWebAccess({ ctx, getConfig: () => ({ fetchEnabled }) })
    installNetworkToolPolicy(ctx, createNetworkToolPolicy({
      readHeader: async () => ({ mode: 'story', webSearchEnabled: enabled }), backgroundContext: () => null,
      capabilityFor: () => undefined, settings: () => ({ fetchEnabled })
    }))
  } })
  t.after(() => runtime.dispose())
  const call = () => host.tools.execute({ callId: 'test-fetch', name: 'web_fetch', arguments: { url: 'https://example.com/work' }, agent: host.agents.get('scene-parent'), signal: new AbortController().signal })
  const off = await call()
  assert.equal(off.isError, true)
  assert.match(JSON.stringify(off.content), /网页读取已关闭/)
  assert.equal(requests, 0)
  fetchEnabled = true
  const on = await call()
  assert.equal(on.isError, false, JSON.stringify(on))
  assert.match(JSON.stringify(on.content), /核对过的作品资料/)
  assert.equal(requests, 1)
  enabled = false
  assert.equal((await call()).isError, true)
  assert.equal(requests, 1)
})
