const { uniq, get, take, takeRight, sumBy } = require("lodash");
const TelegramBot = require("node-telegram-bot-api");
const { ReplyManager } = require("node-telegram-operation-manager");
const pm2 = require("pm2");
const { binanceClient } = require("./binance");
const { config } = require("./config");
const { table } = require("table");
const moment = require("moment-timezone");

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

bot.onText(/^\/status$/, (msg) => {
  pm2.list((err, list) => {
    const apps = list.filter((a) => a.pm2_env.BOT_NAME);
    if (apps.length == 0) return bot.sendMessage(msg.chat.id, `Chưa có bot nào được tạo.`);
    bot.sendMessage(
      msg.chat.id,
      apps
        .map(
          (app) => `
    BOT: ${app.pm2_env.BOT_NAME}
    Symbol: ${app.pm2_env.ASSET}/${app.pm2_env.BASE}
    Vốn: ${app.pm2_env.CAPITAL}$
    TimeFrame: ${app.pm2_env.TF_LONG}:${app.pm2_env.TF_SHORT}
    Status: ${app.pm2_env.status}`
        )
        .join("\n")
    );
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
    bot.sendMessage(msg.chat.id, `Đã xoá bot ${name}`);
  });
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
        script: "trade-v2.js",
        name: config.botName,
      });
    });
});

bot.onText(/^\/balance$/, async (msg, match) => {
  const apps = await getApps();
  const assets = uniq([...apps.map((a) => a.pm2_env.ASSET), ...apps.map((a) => a.pm2_env.BASE)]);
  const balances = await binanceClient.fetchBalance();
  return bot.sendMessage(
    msg.chat.id,
    balances.info.balances
      .filter((b) => assets.includes(b.asset))
      .map((a) => `${a.asset}: Free (${a.free}) - Locked: (${a.locked})`)
      .join("\n")
  );
});

bot.onText(/^\/order (\S+)$/, async (msg, match) => {
  const name = match[1];
  const apps = await getApps();
  const app = apps.find((a) => a.pm2_env.BOT_NAME == name);
  if (!app) return bot.sendMessage(msg.chat.id, `Tên bot không tồn tại.`);
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

  const sumProfit = sumBy(rows, (r) => parseFloat(r[6]));
  const tableMsg = table(
    [
      ["Thời gian", "Lệnh", "Giá", "Khớp / SL", "USD", "Fee", "Profit", "Trạng thái"],
      ...takeRight(rows, 10),
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
  console.log("tableMsg", tableMsg);
  return bot.sendMessage(msg.chat.id, `<pre>${tableMsg}</pre>`, { parse_mode: "HTML" });
});

async function getApps() {
  return await new Promise((resolve, reject) => pm2.list((err, list) => resolve(list))).then(
    (list) => list.filter((a) => a.pm2_env.BOT_NAME)
  );
}
