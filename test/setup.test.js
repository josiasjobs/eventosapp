const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.EVENTOS_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'eventos-setup-test-')), 'test.db');
const { setupHandler } = require('../server');
const { queries } = require('../db');
const { comparePin } = require('../auth');
const defaultEventTemplate = require('../seed/default-event.json');

function response() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test('configuração inicial valida e cria o evento padrão com sessão de administrador', async () => {
  const invalidRes = response();
  await setupHandler({ body: { eventName: '', directorPin: '123', adminPin: '9999' }, ip: '127.0.0.1' }, invalidRes);
  assert.equal(invalidRes.statusCode, 400);
  assert.equal(queries.getActiveEvent(), undefined);

  const res = response();
  await setupHandler({
    body: { eventName: '  Teste  ', category: '  Congresso  ', directorPin: '1234', adminPin: '9999' },
    ip: '127.0.0.1'
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.role, 'admin');

  const event = queries.getActiveEvent();
  assert.equal(event.id, res.body.eventId);
  assert.equal(event.name, 'Teste');
  assert.equal(event.category, 'Congresso');
  assert.equal(await comparePin('1234', event.director_pin_hash), true);
  assert.equal(await comparePin('9999', event.admin_pin_hash), true);

  const days = queries.getDaysByEvent(event.id);
  assert.equal(days.length, defaultEventTemplate.days.length);
  assert.equal(days[0].id, res.body.dayId);

  const shifts = queries.getShiftsByDay(days[0].id);
  assert.equal(shifts.length, defaultEventTemplate.days[0].shifts.length);
  assert.equal(shifts[0].id, res.body.shiftId);

  const items = queries.getItemsByShift(shifts[0].id);
  assert.equal(items.length, defaultEventTemplate.days[0].shifts[0].items.length);
  assert.equal(shifts[0].current_item_id, items[0].id);
  assert.equal(queries.getMediasByItem(items[0].id).length, defaultEventTemplate.days[0].shifts[0].items[0].medias.length);

  const session = queries.getSession(res.body.token);
  assert.equal(session.role, 'admin');
  assert.equal(session.ip_address, '127.0.0.1');

  const duplicateRes = response();
  await setupHandler({
    body: { eventName: 'Outro', directorPin: '1234', adminPin: '9999' },
    ip: '127.0.0.1'
  }, duplicateRes);
  assert.equal(duplicateRes.statusCode, 400);
  assert.equal(queries.getActiveEvent().id, event.id);
});
