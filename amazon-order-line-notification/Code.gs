const TARGET_LABEL_NAME = 'Amazon注文通知';
const DONE_LABEL_NAME = 'Amazon注文LINE通知済';
const AMAZON_FROM_ADDRESS = 'seller-notification@amazon.co.jp';
const ORDER_SUBJECT_KEYWORD = '注文確定';
const SELLER_CENTRAL_URL = 'https://sellercentral.amazon.co.jp/';
const LINE_PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push';
const CHECK_FUNCTION_NAME = 'checkAmazonOrderEmails';
const MAX_MESSAGES_PER_RUN = 10;
// Gmailのラベルはメール単位ではなくスレッド全体に付くため、通知済みラベルを
// 検索条件から除外しない。各メールのメッセージIDで通知済みかを判定することで、
// 同じスレッドに複数の注文メールがある場合も1通ずつ通知できる。
const SEARCH_QUERY = 'label:Amazon注文通知 newer_than:7d';
const NOTIFIED_MESSAGE_IDS_PROPERTY = 'AMAZON_ORDER_LINE_NOTIFIED_MESSAGE_IDS';
const MAX_STORED_MESSAGE_IDS = 150;

function checkAmazonOrderEmails() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    Logger.log('別の処理が実行中のため、今回のチェックをスキップしました。');
    return;
  }

  try {
    const doneLabel = getOrCreateGmailLabel(DONE_LABEL_NAME);
    const notifiedMessageIds = loadNotifiedMessageIds_();
    const threads = GmailApp.search(SEARCH_QUERY, 0, MAX_MESSAGES_PER_RUN * 3);
    let notifiedCount = 0;
    let checkedCount = 0;

    Logger.log('Amazon注文メールの検索を開始しました。検索条件: %s', SEARCH_QUERY);
    Logger.log('検索で取得したスレッド数: %s', threads.length);

    for (let threadIndex = 0; threadIndex < threads.length; threadIndex++) {
      if (notifiedCount >= MAX_MESSAGES_PER_RUN) {
        break;
      }

      const thread = threads[threadIndex];
      const messages = thread.getMessages();

      for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
        if (notifiedCount >= MAX_MESSAGES_PER_RUN) {
          break;
        }

        const message = messages[messageIndex];
        const messageId = message.getId();
        const subject = message.getSubject() || '';
        const from = message.getFrom() || '';

        checkedCount++;

        if (notifiedMessageIds[messageId]) {
          Logger.log('通知済みメッセージIDのためスキップしました。messageId=%s', messageId);
          continue;
        }

        if (!isTargetAmazonOrderMessage_(from, subject)) {
          Logger.log('対象外メールのためスキップしました。messageId=%s, subject=%s', messageId, subject);
          continue;
        }

        try {
          const receivedDate = message.getDate();
          const body = getNormalizedMessageBody_(message);
          const orderInfo = extractOrderInformation(subject, body, receivedDate);
          const lineMessage = buildLineMessage_(orderInfo);
          const sent = sendLineMessage(lineMessage);

          if (!sent) {
            Logger.log('LINE送信に失敗したため、通知済みラベルは付けません。messageId=%s', messageId);
            continue;
          }

          thread.addLabel(doneLabel);
          notifiedMessageIds[messageId] = new Date().toISOString();
          saveNotifiedMessageIds_(notifiedMessageIds);
          notifiedCount++;

          Logger.log('LINE通知に成功しました。messageId=%s, subject=%s', messageId, subject);
        } catch (messageError) {
          Logger.log(
            'メール1件の処理中にエラーが発生しました。messageId=%s, error=%s',
            messageId,
            messageError && messageError.stack ? messageError.stack : messageError
          );
        }
      }
    }

    Logger.log('Amazon注文メールのチェックが完了しました。確認メッセージ数=%s, LINE通知数=%s', checkedCount, notifiedCount);
  } catch (error) {
    Logger.log('Amazon注文メールチェック全体でエラーが発生しました。error=%s', error && error.stack ? error.stack : error);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function sendLineMessage(message) {
  const properties = PropertiesService.getScriptProperties();
  const channelAccessToken = properties.getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  const lineUserId = properties.getProperty('LINE_USER_ID');

  if (!channelAccessToken) {
    throw new Error('スクリプト プロパティ LINE_CHANNEL_ACCESS_TOKEN が未設定です。');
  }

  if (!lineUserId) {
    throw new Error('スクリプト プロパティ LINE_USER_ID が未設定です。');
  }

  const payload = {
    to: lineUserId,
    messages: [
      {
        type: 'text',
        text: message
      }
    ]
  };

  const response = UrlFetchApp.fetch(LINE_PUSH_ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + channelAccessToken
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const statusCode = response.getResponseCode();

  if (statusCode >= 200 && statusCode < 300) {
    Logger.log('LINE Messaging APIへの送信に成功しました。status=%s', statusCode);
    return true;
  }

  Logger.log(
    'LINE Messaging APIへの送信に失敗しました。status=%s, response=%s',
    statusCode,
    truncateForLog_(response.getContentText(), 500)
  );
  return false;
}

function extractOrderInformation(subject, body, receivedDate) {
  const normalizedBody = normalizeText_(body || '');

  return {
    subject: subject || '',
    productName: extractProductName_(normalizedBody),
    orderNumber: extractOrderNumber_(normalizedBody),
    shipByDate: extractShipByDate_(normalizedBody, receivedDate),
    receivedAt: formatDateTime_(receivedDate)
  };
}

function createMinuteTrigger() {
  deleteAmazonOrderTriggers();

  ScriptApp.newTrigger(CHECK_FUNCTION_NAME)
    .timeBased()
    .everyMinutes(1)
    .create();

  Logger.log('%s を1分間隔で実行するトリガーを作成しました。', CHECK_FUNCTION_NAME);
}

function deleteAmazonOrderTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;

  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === CHECK_FUNCTION_NAME) {
      ScriptApp.deleteTrigger(trigger);
      deletedCount++;
    }
  });

  Logger.log('%s の既存トリガーを %s 件削除しました。', CHECK_FUNCTION_NAME, deletedCount);
}

function sendTestLineMessage() {
  const message = [
    '📦 Amazon注文通知のテストです',
    '',
    'Google Apps ScriptからLINE Messaging APIへの送信確認です。',
    '',
    '受信日時：',
    formatDateTime_(new Date()),
    '',
    'Gmailを確認して、注文内容と出荷期限を確認してください。',
    '',
    SELLER_CENTRAL_URL
  ].join('\n');

  const sent = sendLineMessage(message);

  if (!sent) {
    throw new Error('テストメッセージのLINE送信に失敗しました。実行ログを確認してください。');
  }

  Logger.log('テストメッセージのLINE送信に成功しました。');
}

function getOrCreateGmailLabel(labelName) {
  const existingLabel = GmailApp.getUserLabelByName(labelName);

  if (existingLabel) {
    return existingLabel;
  }

  Logger.log('Gmailラベルを作成しました。labelName=%s', labelName);
  return GmailApp.createLabel(labelName);
}

function isTargetAmazonOrderMessage_(from, subject) {
  return String(from).toLowerCase().indexOf(AMAZON_FROM_ADDRESS) !== -1 &&
    String(subject).indexOf(ORDER_SUBJECT_KEYWORD) !== -1;
}

function getNormalizedMessageBody_(message) {
  const plainBody = message.getPlainBody ? message.getPlainBody() : '';
  const htmlBody = message.getBody ? message.getBody() : '';
  const htmlText = htmlToText_(htmlBody);

  return normalizeText_([plainBody, htmlText].join('\n'));
}

function htmlToText_(html) {
  if (!html) {
    return '';
  }

  return decodeHtmlEntities_(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, '\n')
      .replace(/<style[\s\S]*?<\/style>/gi, '\n')
      .replace(/<(br|\/p|\/div|\/tr|\/li|\/h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  );
}

function decodeHtmlEntities_(text) {
  const entities = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&yen;': '円'
  };

  return String(text)
    .replace(/&(nbsp|amp|lt|gt|quot|apos|yen);|&#39;/gi, function(match) {
      return entities[match.toLowerCase()] || match;
    })
    .replace(/&#(\d+);/g, function(_, code) {
      return String.fromCharCode(parseInt(code, 10));
    })
    .replace(/&#x([0-9a-f]+);/gi, function(_, code) {
      return String.fromCharCode(parseInt(code, 16));
    });
}

function normalizeText_(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractOrderNumber_(text) {
  const patterns = [
    /(?:注文(?:番号|ID|ＩＤ)|Order\s*(?:ID|Number)|注文\s*#)\s*[:：#]?\s*([A-Z0-9][A-Z0-9-]{5,})/i,
    /\b([0-9]{3}-[0-9]{7}-[0-9]{7})\b/,
    /\b([A-Z0-9]{2,4}-[A-Z0-9]{3,8}-[A-Z0-9]{3,8})\b/i
  ];

  return extractFirstMatch_(text, patterns);
}

function extractProductName_(text) {
  const lines = textToLines_(text);
  const labelPatterns = [
    /^(?:商品名|商品|Product\s*name|Product)\s*[:：]\s*(.+)$/i,
    /^(?:商品名|商品|Product\s*name|Product)\s*[:：]?$/i
  ];

  for (let i = 0; i < lines.length; i++) {
    for (let j = 0; j < labelPatterns.length; j++) {
      const match = lines[i].match(labelPatterns[j]);

      if (!match) {
        continue;
      }

      const candidate = match[1] || findNextUsefulLine_(lines, i + 1);
      const normalizedCandidate = normalizeProductCandidate_(candidate);

      if (normalizedCandidate) {
        return normalizedCandidate;
      }
    }
  }

  return '';
}

function extractShipByDate_(text, receivedDate) {
  const patterns = [
    /(?:出荷予定日|出荷期限|発送期限|発送予定日|Ship\s*by|Ship-by\s*date|Latest\s*ship\s*date)\s*[:：]?\s*([0-9]{4}[\/\-年]\s*[0-9]{1,2}[\/\-月]\s*[0-9]{1,2}日?(?:\s*(?:まで|までに))?)/i,
    /([0-9]{4}[\/\-年]\s*[0-9]{1,2}[\/\-月]\s*[0-9]{1,2}日?)\s*(?:まで|までに)\s*(?:出荷|発送)/,
    /(?:出荷予定日|出荷期限|発送期限|発送予定日)\s*[:：]?\s*([0-9]{1,2}月\s*[0-9]{1,2}日(?:\s*(?:まで|までに))?)/
  ];

  const value = extractFirstMatch_(text, patterns);

  if (!value) {
    return '';
  }

  return normalizeDateCandidate_(value, receivedDate);
}

function buildLineMessage_(orderInfo) {
  const lines = [
    '📦 Amazonで新しい注文が入りました',
    ''
  ];

  if (orderInfo.productName) {
    lines.push('商品：', orderInfo.productName, '');
  }

  if (orderInfo.orderNumber) {
    lines.push('注文番号：', orderInfo.orderNumber, '');
  }

  if (orderInfo.shipByDate) {
    lines.push('出荷予定日：', orderInfo.shipByDate, '');
  }

  if (!orderInfo.productName && !orderInfo.orderNumber && !orderInfo.shipByDate && orderInfo.subject) {
    lines.push('件名：', orderInfo.subject, '');
  }

  lines.push('受信日時：', orderInfo.receivedAt, '');
  lines.push('Gmailを確認して、注文内容と出荷期限を確認してください。', '');
  lines.push(SELLER_CENTRAL_URL);

  return lines.join('\n');
}

function textToLines_(text) {
  return String(text || '')
    .split(/\n+/)
    .map(function(line) {
      return line.replace(/[ \t]+/g, ' ').trim();
    })
    .filter(function(line) {
      return line;
    });
}

function findNextUsefulLine_(lines, startIndex) {
  for (let i = startIndex; i < Math.min(lines.length, startIndex + 4); i++) {
    const line = lines[i];

    if (line && !isLikelyLabelOnlyLine_(line)) {
      return line;
    }
  }

  return '';
}

function isLikelyLabelOnlyLine_(line) {
  return /^(?:注文番号|注文ID|出荷予定日|出荷期限|発送期限|数量|価格|金額|小計|配送先|購入者|SKU|ASIN)\s*[:：]?$/i.test(line);
}

function normalizeProductCandidate_(candidate) {
  if (!candidate) {
    return '';
  }

  const value = String(candidate)
    .replace(/\s+/g, ' ')
    .replace(/(?:注文番号|注文ID|出荷予定日|出荷期限|発送期限|数量|価格|金額|小計|配送先|購入者)\s*[:：].*$/i, '')
    .trim();

  if (!value || value.length < 2 || value.length > 160) {
    return '';
  }

  return value;
}

function extractFirstMatch_(text, patterns) {
  for (let i = 0; i < patterns.length; i++) {
    const match = String(text || '').match(patterns[i]);

    if (match && match[1]) {
      return String(match[1]).replace(/\s+/g, ' ').trim();
    }
  }

  return '';
}

function normalizeDateCandidate_(value, receivedDate) {
  const text = String(value || '').replace(/\s+/g, '');
  const fullDateMatch = text.match(/([0-9]{4})[\/\-年]([0-9]{1,2})[\/\-月]([0-9]{1,2})日?/);
  const monthDayMatch = text.match(/([0-9]{1,2})月([0-9]{1,2})日/);
  let year;
  let month;
  let day;

  if (fullDateMatch) {
    year = fullDateMatch[1];
    month = fullDateMatch[2];
    day = fullDateMatch[3];
  } else if (monthDayMatch) {
    year = String((receivedDate || new Date()).getFullYear());
    month = monthDayMatch[1];
    day = monthDayMatch[2];
  } else {
    return value;
  }

  const suffix = /までに?/.test(text) ? 'まで' : '';
  return [
    year,
    pad2_(month),
    pad2_(day)
  ].join('/') + suffix;
}

function pad2_(value) {
  return ('0' + parseInt(value, 10)).slice(-2);
}

function formatDateTime_(date) {
  const timeZone = Session.getScriptTimeZone() || 'Asia/Tokyo';
  return Utilities.formatDate(date || new Date(), timeZone, 'yyyy/MM/dd HH:mm');
}

function loadNotifiedMessageIds_() {
  const rawValue = PropertiesService.getScriptProperties().getProperty(NOTIFIED_MESSAGE_IDS_PROPERTY);

  if (!rawValue) {
    return {};
  }

  try {
    const parsedValue = JSON.parse(rawValue);
    return parsedValue && typeof parsedValue === 'object' ? parsedValue : {};
  } catch (error) {
    Logger.log('通知済みメッセージIDの読み込みに失敗したため、空の状態として扱います。error=%s', error);
    return {};
  }
}

function saveNotifiedMessageIds_(messageIds) {
  const entries = Object.keys(messageIds)
    .map(function(id) {
      return {
        id: id,
        notifiedAt: messageIds[id]
      };
    })
    .sort(function(a, b) {
      return String(b.notifiedAt).localeCompare(String(a.notifiedAt));
    })
    .slice(0, MAX_STORED_MESSAGE_IDS);

  const trimmedMessageIds = {};

  entries.forEach(function(entry) {
    trimmedMessageIds[entry.id] = entry.notifiedAt;
  });

  PropertiesService.getScriptProperties().setProperty(
    NOTIFIED_MESSAGE_IDS_PROPERTY,
    JSON.stringify(trimmedMessageIds)
  );
}

function truncateForLog_(value, maxLength) {
  const text = String(value || '');

  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength) + '...';
}
