const { sma } = require("technicalindicators");
const { BinanceSocket } = require("./binance");
const { BotModel } = require("./mongo/models/bot.model");

async function run() {
  const configs = await BotModel.find({});
  const bots = [];
  for (const config of configs) {
    bots.push(await startBot(config));
  }
}
function startBot(config) {
  return new Promise((resolve, reject) => {
    const bot = new Bot(config);
    setTimeout(() => {
      resolve(bot);
    }, 5000);
  });
}

class Bot {
  constructor(config) {
    this.config = config;
    this.symbol2 = `${config.asset}${config.base}`;
    this.setup();
  }
  async setup() {
    const { barsLong, barsShort } = await this.fetchInitBarData({
      longLimit: 100,
      shortLimit: 100,
    });
    this.barsLong = barsLong;
    this.barsShort = barsShort;
    this.tfLongSocket = new BinanceSocket(this.symbol2, config.tfLong);
    this.tfShortSocket = new BinanceSocket(this.symbol2, config.tfShort);
    this.tfLongSocket.on("data", (bar) => {
      if (last(this.barsLong).time == bar.time) {
        this.barsLong[this.barsLong.length - 1] = bar;
      } else {
        this.barsLong.shift(1);
        this.barsLong.push(bar);
      }
      const longMA = sma();
      this.config.updateOne({ $set: {} });
    });
  }
}
