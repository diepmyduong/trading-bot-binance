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
      if (change.change_24h < 0 && newChange.change_24h > 0) {
        bot.sendMessage(
          config.telegramChatId,
          "BITCOIN Thay đổi tăng trong 24h qua, có thể trade rồi!!!!!"
        );
      }
    }
    writeJSON(newChange);
  });
setInterval(() => updateBTCChange(), 1000 * 60);
updateBTCChange();

function writeJSON(data, cb) {
  const writeStream = fs.createWriteStream("btc_change.json");
  writeStream.write(Buffer.from(JSON.stringify(data, null, 2)), cb);
}
