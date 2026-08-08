import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const code = readFileSync(new URL('./Code.gs', import.meta.url), 'utf8');

function createContext(overrides = {}) {
  const propertyValues = {};
  const scriptProperties = {
    getProperty(key) {
      return propertyValues[key] || null;
    },
    setProperty(key, value) {
      propertyValues[key] = value;
    }
  };

  const context = {
    console,
    Logger: { log() {} },
    LockService: {
      getScriptLock() {
        return { tryLock: () => true, releaseLock() {} };
      }
    },
    PropertiesService: { getScriptProperties: () => scriptProperties },
    Session: { getScriptTimeZone: () => 'Asia/Tokyo' },
    Utilities: {
      formatDate(date) {
        const parts = new Intl.DateTimeFormat('ja-JP', {
          timeZone: 'Asia/Tokyo',
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
        }).formatToParts(date);
        const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
        return `${value.year}/${value.month}/${value.day} ${value.hour}:${value.minute}`;
      }
    },
    ...overrides
  };

  vm.createContext(context);
  vm.runInContext(code, context);
  return { context, propertyValues };
}

test('LINE通知の最後にセラーセントラルURLを付ける', () => {
  const { context } = createContext();
  const message = context.buildLineMessage_({
    productName: 'テスト商品',
    orderNumber: '123-1234567-1234567',
    shipByDate: '2026/08/08まで',
    receivedAt: '2026/08/07 10:00',
    subject: '注文確定'
  });

  assert.equal(message.split('\n').at(-1), 'https://sellercentral.amazon.co.jp/');
});

test('同じスレッドの複数注文メールを1件ずつLINE通知する', () => {
  const sentMessages = [];
  let addedLabelCount = 0;
  const makeMessage = (id, product) => ({
    getId: () => id,
    getSubject: () => '注文確定のお知らせ',
    getFrom: () => 'Amazon <seller-notification@amazon.co.jp>',
    getDate: () => new Date('2026-08-07T01:00:00Z'),
    getPlainBody: () => `商品名：${product}\n注文番号：123-1234567-${id.padStart(7, '0')}`,
    getBody: () => ''
  });
  const thread = {
    getMessages: () => [makeMessage('1', '商品A'), makeMessage('2', '商品B')],
    addLabel() { addedLabelCount++; }
  };

  const { context, propertyValues } = createContext({
    GmailApp: {
      search(query) {
        assert.equal(query, 'label:Amazon注文通知 newer_than:7d');
        return [thread];
      },
      getUserLabelByName: () => ({ name: 'done' })
    }
  });
  context.sendLineMessage = (message) => {
    sentMessages.push(message);
    return true;
  };

  context.checkAmazonOrderEmails();

  assert.equal(sentMessages.length, 2);
  assert.match(sentMessages[0], /商品A/);
  assert.match(sentMessages[1], /商品B/);
  assert.equal(addedLabelCount, 2);

  context.checkAmazonOrderEmails();
  assert.equal(sentMessages.length, 2, '同じメッセージIDは再通知しない');
  assert.ok(propertyValues.AMAZON_ORDER_LINE_NOTIFIED_MESSAGE_IDS);
});
