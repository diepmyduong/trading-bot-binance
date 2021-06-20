const { config } = require("./config");

const TradingBot = require("./" + config.version);

(async function run() {
  const config = {
    botName: process.env.BOT_NAME,
    asset: process.env.ASSET,
    base: process.env.BASE,
    capital: process.env.CAPITAL,
    tfLong: process.env.TF_LONG,
    tfShort: process.env.TF_SHORT,
  };
  const bot = new TradingBot(config);
  await bot.start();
  bot.on("error", (err) => {
    console.log("BOT ERROR", err);
  });
})();
