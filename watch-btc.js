const { getCoin } = require("./coin360");
const TelegramBot = require("node-telegram-bot-api");
const { config } = require("./config");
const fs = require("fs");

const bot = new TelegramBot(config.telegramCommandToken, { polling: false });
bot.on("polling_error", (msg) => console.log(msg));

bot.sendMessage(config.telegramChatId, "Start BOT THEO DÕI % thay đổi của BITCOIN");
const updateBTCChange = () =>
  getCoin("BTC", "USD").then((data) => {
    var change = require("./btc_change.json");
    var newChange = data.BTC;
    if (change) {
      // if (change.change_1h < 0 && newChange.change_1h > 0) {
      //   bot.sendMessage(
      //     config.telegramChatId,
      //     `BITCOIN Thay đổi tăng ${change.change_1h.toFixed(
      //       2
      //     )}% trong 1h qua, có thể trade rồi!!!!!`
      //   );
      // }
    }
    newChange = {
      ...newChange,
      change_24h: parseFloat(newChange.change_24h.toFixed(1)),
      change_1h: parseFloat(newChange.change_1h.toFixed(1)),
    };
    writeJSON(newChange);
  });
setInterval(() => updateBTCChange(), 1000 * 60);
updateBTCChange();

function writeJSON(data, cb) {
  const writeStream = fs.createWriteStream("btc_change.json");
  writeStream.write(Buffer.from(JSON.stringify(data, null, 2)), cb);
}
