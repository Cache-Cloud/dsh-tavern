import assert from 'node:assert/strict'
import test from 'node:test'

import { Session } from './fixtures/dsh-session-host.mjs'
import { sessionEvents } from '../tavern-plugin/lib/domain/session-events.js'
import { prependSystemInstruction } from '../tavern-plugin/lib/domain/system-append.js'
import { ensureSessionVariableDirectory } from '../tavern-plugin/lib/domain/session-variable-directory.js'
import { ensureSessionStablePrefix, sessionStablePrefixSections, withCurrentWorldbook } from '../tavern-plugin/lib/domain/session-stable-prefix.js'

// Card data may name a stat_data key with a SillyTavern macro; the host
// interpolates {{name}} strictly and rejects every unregistered name. Tavern
// therefore marks its data sections literal, and must keep doing so for events
// recorded before the mark existed.
const LITERAL = '【故事设定 · 人物卡】\n名字: 测试人物\n\n设定: {{user}} 表示玩家。\n\n【常驻世界书】\n{{char}} 把钥匙交给 {{user}}。'

test('新变量目录段落标记为字面文本，宏路径原样保留', async () => {
  const session = Session.create('braces-directory')
  const chat = { mode: 'story', messages: [{ swipeId: 0, variables: [{ stat_data: { '{{user}}': { 穿搭: { 上身: '衬衫' } }, 世界: { 当前时间: '08:00' } } }] }] }
  assert.ok(ensureSessionVariableDirectory(session, chat))
  const section = sessionEvents(session).flatMap(event => event.data?.source?.sections || []).find(item => item.name === 'tavern:variable-directory')
  assert.equal(section.interpolate, false)
  assert.match(section.text, /"\/\{\{user\}\}\/穿搭\/上身"/)
  assert.ok(sessionStablePrefixSections(session).every(item => item.interpolate === false))
})

test('存量快照在读取出口补上字面标记，且不改写已落盘事件', async () => {
  const session = Session.create('braces-legacy')
  await ensureSessionStablePrefix(session, LITERAL)
  const before = JSON.stringify(sessionEvents(session))
  const sections = sessionStablePrefixSections(session)
  assert.ok(sections.length >= 2)
  assert.ok(sections.every(section => section.interpolate === false))
  assert.ok(sections.some(section => section.text.includes('{{user}} 表示玩家')))
  assert.equal(JSON.stringify(sessionEvents(session)), before)
})

test('动态世界书投影同样按字面文本装配', () => {
  const sections = withCurrentWorldbook([{ name: 'tavern:character-card', text: '设定' }], '{{char}} 说：{{user}} 回来了。')
  assert.equal(sections[0].name, 'tavern:constant-worldbook')
  assert.equal(sections[0].interpolate, false)
  assert.match(sections[0].text, /\{\{char\}\}/)
  assert.equal(sections[1].name, 'tavern:character-card')
})

test('玩家手写的追加指令不参与变量插值', () => {
  const assembly = prependSystemInstruction({ sections: [] }, '  用 {{user}} 称呼玩家  ')
  assert.deepEqual(assembly.sections.map(section => section.name), ['tavern:system-append'])
  assert.equal(assembly.sections[0].interpolate, false)
  assert.equal(assembly.sections[0].text, '用 {{user}} 称呼玩家')
})
