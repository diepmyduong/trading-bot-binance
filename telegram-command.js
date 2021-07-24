const { uniq, get, set, take, takeRight, sumBy, sortBy, keyBy } = require("lodash");
const TelegramBot = require("node-telegram-bot-api");
const { ReplyManager } = require("node-telegram-operation-manager");
const pm2 = require("pm2");
const { binanceClient } = require("./binance");
const { config } = require("./config");
const { table } = require("table");
const moment = require("moment-timezone");
const nodeHtmlToImage = require("node-html-to-image");
const fs = require("fs");

moment.tz.setDefault("Asia/Ho_Chi_Minh");

const bot = new TelegramBot(config.telegramCommandToken, { polling: true });
bot.on("polling_error", (msg) => console.log(msg));

const reply = new ReplyManager();
bot.on("message", (msg) => {
  if (!hasEntity("bot_command", msg.entities) && reply.expects(msg.from.id)) {
    let { text, entities } = msg;
    reply.execute(msg.from.id, { text, entities });
  }
});

function hasEntity(entity, entities) {
  if (!entities || !entities.length) {
    return false;
  }

  return entities.some((e) => e.type === entity);
}

bot.onText(/^\/status$/, async (msg) => {
  pm2.list(async (err, list) => {
    const apps = list.filter((a) => a.pm2_env.BOT_NAME);
    if (apps.length == 0) return bot.sendMessage(msg.chat.id, `Chưa có bot nào được tạo.`);
    const tableMsg = table([
      ["STT", "BOT", "Symbol", "Vốn", "TimeFrame", "Status"],
      ...apps.map((app, index) => [
        index + 1,
        app.pm2_env.BOT_NAME,
        `${app.pm2_env.ASSET}/${app.pm2_env.BASE}`,
        `${app.pm2_env.CAPITAL}$`,
        `${app.pm2_env.TF_LONG}:${app.pm2_env.TF_SHORT}`,
        app.pm2_env.status,
      ]),
    ]);
    const image = await nodeHtmlToImage({
      html: `<html><head><style>body { width: 800px }</style></head><body><pre>${tableMsg}</pre></body></html>`,
    });
    return bot.sendPhoto(msg.chat.id, image);
  });
});

bot.onText(/^\/stop (\S+)$/, (msg, match) => {
  const name = match[1];
  pm2.stop(name, (err) => {
    if (err) return bot.sendMessage(msg.chat.id, err.message);
    bot.sendMessage(msg.chat.id, `Đã tắt bot ${name}`);
  });
});

bot.onText(/^\/delete (\S+)$/, (msg, match) => {
  const name = match[1];
  pm2.delete(name, (err) => {
    if (err) return bot.sendMessage(msg.chat.id, err.message);
    const data = require("./data.json");
    delete data.markets[name];
    writeJSON(data);
    bot.sendMessage(msg.chat.id, `Đã xoá bot ${name}`);
  });
});
bot.onText(/^\/restart (\S+)$/, (msg, match) => {
  const name = match[1];
  pm2.restart(name, (err) => {
    if (err) return bot.sendMessage(msg.chat.id, err.message);
    bot.sendMessage(msg.chat.id, `Đã restart bot ${name}`);
  });
});
bot.onText(/^\/restartall$/, async (msg, match) => {
  console.log("START TO RESTART ALL APP");
  const apps = await getApps();
  console.log("APP COUNT", apps.length);
  const restartApp = (index) => {
    const app = apps[index];
    if (app) {
      bot.sendMessage(msg.chat.id, `restart bot ${app.name}`);
      pm2.restart(app.name, (err) => {
        if (err) return bot.sendMessage(msg.chat.id, err.message);
        setTimeout(() => restartApp(index + 1), 20000);
      });
    } else {
      bot.sendMessage(msg.chat.id, `Đã restart tất cả`);
    }
  };
  restartApp(0);
});
bot.onText(/^\/add$/, async (msg, match) => {
  const apps = await getApps();
  bot.sendMessage(msg.chat.id, `Hãy đặt tên cho Bot?`);
  reply
    .register(msg.from.id, (data) => {
      config;
      const app = apps.find((a) => a.pm2_env.BOT_NAME == data.text);
      if (app) {
        bot.sendMessage(msg.chat.id, `Tên bot đã tồn tại.`);
        return { repeat: true };
      }
      bot.sendMessage(msg.chat.id, `Asset?`);
      return { botName: data.text };
    })
    .register(msg.from.id, (data) => {
      bot.sendMessage(msg.chat.id, "Base?");
      return { ...data.previousData, asset: data.text };
    })
    .register(msg.from.id, (data) => {
      bot.sendMessage(msg.chat.id, "Vốn?");
      return { ...data.previousData, base: data.text };
    })
    .register(msg.from.id, (data) => {
      bot.sendMessage(msg.chat.id, "Khung thời gian lớn (1d)?");
      return { ...data.previousData, capital: data.text };
    })
    .register(msg.from.id, (data) => {
      bot.sendMessage(msg.chat.id, "Khung thời gian nhỏ (1h)?");
      return { ...data.previousData, tfLong: data.text };
    })
    .register(msg.from.id, (data) => {
      const config = {
        ...data.previousData,
        tfShort: data.text,
      };
      pm2.start({
        env: {
          BOT_NAME: config.botName,
          ASSET: config.asset,
          BASE: config.base,
          CAPITAL: config.capital,
          TF_LONG: config.tfLong,
          TF_SHORT: config.tfShort,
        },
        script: "trade.js",
        name: config.botName,
      });
    });
});
bot.onText(/^\/add2$/, async (msg, match) => {
  const apps = await getApps();
  bot.sendMessage(msg.chat.id, `Hãy đặt tên cho Bot?`);
  reply
    .register(msg.from.id, (data) => {
      config;
      const app = apps.find((a) => a.pm2_env.BOT_NAME == data.text);
      if (app) {
        bot.sendMessage(msg.chat.id, `Tên bot đã tồn tại.`);
        return { repeat: true };
      }
      bot.sendMessage(msg.chat.id, `Asset?`);
      return { botName: data.text };
    })
    .register(msg.from.id, (data) => {
      bot.sendMessage(msg.chat.id, "Base?");
      return { ...data.previousData, asset: data.text };
    })
    .register(msg.from.id, (data) => {
      bot.sendMessage(msg.chat.id, "Vốn?");
      return { ...data.previousData, base: data.text };
    })
    .register(msg.from.id, (data) => {
      bot.sendMessage(msg.chat.id, "Khung thời gian lớn (1d)?");
      return { ...data.previousData, capital: data.text };
    })
    .register(msg.from.id, (data) => {
      bot.sendMessage(msg.chat.id, "Khung thời gian nhỏ (1h)?");
      return { ...data.previousData, tfLong: data.text };
    })
    .register(msg.from.id, (data) => {
      const config = {
        ...data.previousData,
        tfShort: data.text,
      };
      pm2.start({
        env: {
          BOT_NAME: config.botName,
          ASSET: config.asset,
          BASE: config.base,
          CAPITAL: config.capital,
          TF_LONG: config.tfLong,
          TF_SHORT: config.tfShort,
        },
        script: "trade-v2.js",
        name: config.botName,
      });
    });
});
bot.onText(/^\/setup$/, async (msg, match) => {
  const data = require("./data.json");
  const apps = await getApps().then((a) => keyBy(a, "pm2_env.BOT_NAME"));
  const markets = sortBy(Object.values(data.markets), "asset");
  console.log("marketes", markets.length);
  const setup = (index) => {
    console.log("setup index", index);
    var market = markets[index];
    if (!market) return bot.sendMessage(msg.chat.id, "Đã setup hết");
    const botName = `${market.asset}${market.base}`;
    if (apps[botName]) return setup(index + 1);
    bot.sendMessage(msg.chat.id, `Setup up bot ${botName}`);
    pm2.stop(botName);
    pm2.start({
      env: {
        BOT_NAME: botName,
        ASSET: market.asset,
        BASE: market.base,
        CAPITAL: market.capital.toString(),
        TF_LONG: "1d",
        TF_SHORT: "1h",
      },
      script: "trade.js",
      name: botName,
    });
    setTimeout(() => {
      setup(index + 1);
    }, 15000);
  };
  setup(0);
});

bot.onText(/^\/balance$/, async (msg, match) => {
  const tableMsg = await getBalanceTableText();
  return bot.sendMessage(msg.chat.id, `<pre>${tableMsg}</pre>`, { parse_mode: "HTML" });
});

bot.onText(/^\/balance2$/, async (msg, match) => {
  const tableMsg = await getBalanceTableText();
  const image = await nodeHtmlToImage({
    html: `<html><head><style>body { width: 350px }</style></head><body><pre>${tableMsg}</pre></body></html>`,
  });
  return bot.sendPhoto(msg.chat.id, image);
});

bot.onText(/^\/order (\S+)$/, async (msg, match) => {
  const name = match[1];
  const apps = await getApps();
  const app = apps.find((a) => a.pm2_env.BOT_NAME == name);
  if (!app) return bot.sendMessage(msg.chat.id, `Tên bot không tồn tại.`);
  const tableMsg = await getOrderTableText(app);
  return bot.sendMessage(msg.chat.id, `<pre>${tableMsg}</pre>`, { parse_mode: "HTML" });
});
bot.onText(/^\/order2 (\S+)$/, async (msg, match) => {
  const name = match[1];
  const apps = await getApps();
  const app = apps.find((a) => a.pm2_env.BOT_NAME == name);
  if (!app) return bot.sendMessage(msg.chat.id, `Tên bot không tồn tại.`);
  const tableMsg = await getOrderTableText(app, { full: true });
  const image = await nodeHtmlToImage({
    html: `<html><head><style>body { width: 800px }</style></head><body><pre>${tableMsg}</pre></body></html>`,
  });
  return bot.sendPhoto(msg.chat.id, image);
});

bot.onText(/^\/stats$/, async (msg, match) => {
  const apps = await getApps();
  var buy = 0;
  var sell = 0;
  var orderCount = 0;
  var profit = 0;
  var row = [];

  for (var i = 0; i < apps.length; i++) {
    var app = apps[i];
    var asset = app.pm2_env.ASSET;
    var base = app.pm2_env.BASE;
    var capital = parseFloat(app.pm2_env.CAPITAL);
    var botName = app.pm2_env.BOT_NAME;
    var market = await getMarket(botName, asset, base, capital);
  }
  const data = require("./data.json");
  const stickers = await binanceClient.fetchTickers(
    Object.values(data.markets).map((m) => `${m.asset}/${m.base}`)
  );
  const markets = sortBy(Object.values(data.markets), "asset");
  for (var i = 0; i < markets.length; i++) {
    var market = markets[i];
    var marketProfit = market.sellCost - market.buyCost + market.holdingCost;
    buy += market.buyCost;
    sell += market.sellCost;
    profit += marketProfit;
    orderCount += market.orderCount;

    row.push([
      i + 1,
      market.asset,
      market.orderCount,
      market.buyCost.toFixed(4),
      market.sellCost.toFixed(4),
      marketProfit.toFixed(4),
      market.capital,
      ((marketProfit / capital) * 100).toFixed(4),
      get(market, "buyPrice", 0).toFixed(4),
      ((stickers[`${market.asset}/${market.base}`].last / market.buyPrice - 1) * 100).toFixed(4),
    ]);
  }
  const tableMsg = table(
    [
      [
        "STT",
        "BOT",
        "Order",
        "Buy($)",
        "Sell($)",
        "Profit($)",
        "Vốn($)",
        "Profit(%)",
        "Holding Price($)",
        "Holding Profit(%)",
      ],
      ...row,
    ],
    {
      header: {
        alignment: "center",
        content: `Thống kê Lãi lỗ\nMua ($): ${buy}$\nBán ($): ${sell}$\nProfit ($): ${profit}`,
      },
    }
  );
  const image = await nodeHtmlToImage({
    html: `<html><head><style>body { width: 1000px }</style></head><body><pre>${tableMsg}</pre></body></html>`,
  });
  return bot.sendPhoto(msg.chat.id, image);
});

bot.onText(/^\/stats from (\S+)$/, async (msg, match) => {
  const time = moment(match[1], "YYYY:MM:DD:HH:mm").toDate().getTime();
  var data = require("./data.json");
  for (var botName of Object.keys(data.markets)) {
    var market = data.markets[botName];
    market.buyCost = 0;
    market.sellCost = 0;
    market.orderCount = 0;
    market.holdingCost = 0;
    market.isHolding = false;
    market.timestamp = time;
    set(data.markets, botName, market);
  }
  writeJSON(data);

  bot.sendMessage(
    msg.chat.id,
    `Đã cập nhật thống kê bắt đầu từ thời gian ${moment(
      match[1],
      "YYYY:MM:DD:HH:mm"
    ).toLocaleString()}`
  );
});

bot.onText(/^\/stats (\S+) from (\S+)$/, async (msg, match) => {
  const botName = match[1];
  const time = moment(match[2], "YYYY:MM:DD:HH:mm").toDate().getTime();
  var data = require("./data.json");
  var market = data.markets[botName];
  if (!market) {
    return bot.sendMessage(msg.chat.id, "Không tìm thấy dữ liệu hoặc sai tên bot");
  }
  market.buyCost = 0;
  market.sellCost = 0;
  market.orderCount = 0;
  market.holdingCost = 0;
  market.isHolding = false;
  market.timestamp = time;
  set(data.markets, botName, market);
  writeJSON(data);

  bot.sendMessage(
    msg.chat.id,
    `Đã cập nhật thống kê bắt đầu từ thời gian ${moment(
      match[1],
      "YYYY:MM:DD:HH:mm"
    ).toLocaleString()}`
  );
});

async function getMarket(botName, asset, base, capital) {
  var data = require("./data.json");
  var market = get(data.markets, botName);
  if (!market) {
    market = {
      asset: asset,
      base: base,
      buyCost: 0,
      sellCost: 0,
      orderCount: 0,
      fromOrderId: null,
      timestamp: null,
      isHolding: false,
      holdingCost: 0,
      capital: capital,
    };
    set(data.markets, botName, market);
  }
  set(data.markets, botName + ".capital", capital);
  writeJSON(data);
  const orders = market.timestamp
    ? await binanceClient.fetchOrders(`${asset}/${base}`, market.timestamp + 1)
    : await binanceClient.fetchOrders(`${asset}/${base}`);
  var lastOrder;
  for (const o of orders) {
    if (o.status == "open") break;
    lastOrder = o;
    market.orderCount++;
    market.fromOrderId = o.id;
    market.timestamp = o.timestamp;
    if (o.side == "buy") {
      market.buyCost += o.cost + get(o, "fee.cost", 0);
    } else {
      market.sellCost += o.cost + get(o, "fee.cost", 0);
    }
  }

  if (lastOrder) {
    if (lastOrder.side == "buy") {
      market.isHolding = true;
      market.holdingCost = lastOrder.cost;
      market.buyPrice = lastOrder.price;
    } else {
      market.isHolding = false;
      market.holdingCost = 0;
      market.buyPrice = 0;
    }
  }

  writeJSON(data);
  return market;
}

async function getOrderTableText(app, opts = {}) {
  const symbol = `${app.pm2_env.ASSET}/${app.pm2_env.BASE}`;
  const orders = await binanceClient.fetchOrders(symbol);
  let buyOrder;
  const rows = orders.map((o) => {
    let profit = 0;
    if (o.side == "buy") {
      buyOrder = o;
    } else {
      profit = ((o.cost - buyOrder.cost) / buyOrder.cost) * 100;
    }
    return [
      moment(o.timestamp).format("YYYY/MM/DD HH:mm"),
      o.side,
      o.price,
      `${o.filled}/${o.amount}`,
      o.cost,
      get(o, "fee.cost", 0),
      profit.toFixed(2),
      o.status,
    ];
  });

  const sumProfit = sumBy(rows, (r) => (r[7] == "closed" ? parseFloat(r[6]) : 0));
  const tableMsg = table(
    [
      ["Thời gian", "Lệnh", "Giá", "Khớp / SL", "USD", "Fee", "Profit", "Trạng thái"],
      ...(opts.full ? rows : takeRight(rows, 10)),
    ],
    {
      header: {
        alignment: "center",
        content: `Lịch sử đặt lệnh ${symbol}\nSố lệnh: ${rows.length}\nProfit: ${sumProfit}%`,
      },
      columns: [
        {
          width: 20,
          truncate: 100,
        },
      ],
    }
  );
  return tableMsg;
}

async function getBalanceTableText() {
  const apps = await getApps();
  const assets = uniq([...apps.map((a) => a.pm2_env.ASSET), ...apps.map((a) => a.pm2_env.BASE)]);
  const balances = await binanceClient.fetchBalance();
  const tableMsg = table([
    ["STT", "Asset", "Free", "Locked"],
    ...sortBy(
      balances.info.balances.filter((b) => assets.includes(b.asset)),
      "asset"
    ).map((a, index) => [index + 1, a.asset, a.free, a.locked]),
  ]);
  return tableMsg;
}

async function getApps() {
  return await new Promise((resolve, reject) => pm2.list((err, list) => resolve(list)))
    .then((list) => list.filter((a) => a.pm2_env.BOT_NAME))
    .then((res) => sortBy(res, "pm2_env.BOT_NAME"));
}

function writeJSON(data, cb) {
  const writeStream = fs.createWriteStream("data.json");
  writeStream.write(Buffer.from(JSON.stringify(data, null, 2)), cb);
}
