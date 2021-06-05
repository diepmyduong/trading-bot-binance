const winston = require("winston");
const { binanceClient, fetchKline, BinanceSocket, BinanceOrderWatcher } = require("./binance");
const { SMA, sma } = require("technicalindicators");
const { last, takeRight, get } = require("lodash");

const logger = winston.createLogger({
  format: winston.format.simple(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: `logs/${process.env.BOT_NAME}.log`,
    }),
  ],
});

const tradeLogger = winston.createLogger({
  format: winston.format.simple(),
  transports: [
    new winston.transports.File({
      filename: `logs/${process.env.BOT_NAME}-trade.log`,
    }),
  ],
});

const klineLogger = winston.createLogger({
  format: winston.format.simple(),
  transports: [
    new winston.transports.File({
      filename: `logs/${process.env.BOT_NAME}-kline.log`,
    }),
  ],
});

(async function run() {
  const config = setConfig();
  var isHolding = false;
  var buyOrder;
  var sellOrder;
  var capital = config.capital;
  // Validate Symbol
  await validateConfigTicker(config);
  // Load account balance
  await validateAccountBalance(config);
  const symbol = `${config.asset}${config.base}`.toUpperCase();

  const { barsLong, barsShort } = await fetchInitBarData(symbol, config);
  var tfLongSocket = new BinanceSocket(`${config.asset}${config.base}`, config.tfLong);
  var tfShortSocket = new BinanceSocket(`${config.asset}${config.base}`, config.tfShort);
  tfLongSocket.on("data", (bar) => {
    if (last(barsLong).time == bar.time) {
      barsLong[barsLong.length - 1] = bar;
    } else {
      const lastBar = last(barsLong);
      barsLong.push(bar);
    }
  });
  tfShortSocket.on("data", async (bar) => {
    // logBar(bar);
    if (last(barsShort).time == bar.time) {
      barsShort[barsShort.length - 1] = bar;
    } else {
      const lastBar = last(barsShort);
      logBar(lastBar);
      barsShort.push(bar);
      var barLong = last(barsLong);
      var [preBar, barShort] = takeRight(barsShort, 2);
      var [smaLong] = sma({
        period: 10,
        values: takeRight(barsLong, 10).map((b) => b.close),
      });
      var [smaShort1, smaShort2] = sma({
        period: 10,
        values: takeRight(barsShort, 11).map((b) => b.close),
      });
      if (!isHolding) {
        // Buy
        const cond1 = barLong.close > smaLong;
        const cond2 = preBar.open < smaShort1 && preBar.close > smaShort1;
        if (cond1 & cond2) {
          logger.info(`
Ready to Buy With Info
Bar Long Close: ${barLong.close} > SMA Long: ${smaLong}
Pre Bar Open: ${preBar.open} < SMA Short: ${smaShort1} < Pre Bar Close: ${preBar.close}
            `);
          if (sellOrder) {
            const fetchSellOrder = await binanceClient.fetchOrder(sellOrder.id, config.symbol);
            if (fetchSellOrder.status == "open") {
              await binanceClient.cancelOrder(fetchSellOrder.id).catch((err) => {});
            }
            sellOrder = null;
          }
          const price = barShort.close;
          const qty = config.capital / barShort.close;
          buyOrder = await binanceClient.createLimitBuyOrder(config.symbol, qty, price);
          var wacher = new BinanceOrderWatcher(buyOrder);
          wacher.on("data", async (order) => {
            logTrading(order);
            await validateAccountBalance(config);
          });
          isHolding = true;
          logger.info(`
          [${buyOrder.id}] Buy Order Qty: ${buyOrder.amount} - Price: ${buyOrder.price} - Filled: ${buyOrder.filled} - Cost: ${buyOrder.cost}
          `);
        }
      } else {
        // Sell
        if (preBar && preBar.close < smaShort2) {
          logger.info(`
Ready to Sell With Info
Pre Bar Close: ${preBar.close} < SMA Short: ${smaShort2}
            `);
          const fetchBuyOrder = await binanceClient.fetchOrder(buyOrder.id, config.symbol);
          if (fetchBuyOrder.status == "open") {
            await binanceClient.cancelOrder(fetchBuyOrder.id).catch((err) => {});
          }
          const buyCost = fetchBuyOrder.cost;
          const buyQty = fetchBuyOrder.filled;
          const buyAvgPrice = fetchBuyOrder.average;
          const price = barShort.close;
          capital = capital - buyCost;
          if (buyQty == 0) {
            logger.info(`Nothing to sell: Prev Buy Order Filled Qty is Zero`);
          } else {
            sellOrder = await binanceClient.createLimitSellOrder(config.symbol, buyQty, price);
            var wacher = new BinanceOrderWatcher(sellOrder);
            wacher.on("data", async (order) => {
              const profit = ((order.price - buyAvgPrice) / buyAvgPrice) * 100;
              logTrading(order, profit.toFixed(4));
              await validateAccountBalance(config);
            });
            logger.info(`
[${sellOrder.id}] Sell Order Qty: ${sellOrder.amount} - Price: ${sellOrder.price} - Filled: ${sellOrder.filled} - Cost: ${sellOrder.cost}
            `);
            buyOrder = null;
          }
          isHolding = false;
        }
      }
    }
  });
})();

function logBar(lastBar) {
  klineLogger.info(
    `[${new Date(lastBar.time * 1000)}] O: ${lastBar.open} H: ${lastBar.high} L: ${
      lastBar.low
    } C: ${lastBar.close}`
  );
}

function logConfirmTrading(order, capitalProfit) {
  tradeLogger.info(
    `[Confirm] ${order.side} Price: ${order.average || order.price} Qty: ${order.amount} Filled: ${
      order.filled
    } Cost: ${order.cost} CapitalProfit: ${capitalProfit}`
  );
}

function logTrading(order, profit) {
  tradeLogger.info(
    `[${order.datetime}] ${order.side} Price: ${order.average || order.price} Qty: ${
      order.amount
    } Filled: ${order.filled} Fee: ${get(order, "fee.cost")} Cost: ${order.cost} ID: ${
      order.id
    } Profit: ${profit}`
  );
}

async function fetchInitBarData(symbol, config) {
  const parseData = (r) => ({
    time: r[0] / 1000,
    open: parseFloat(r[1]),
    high: parseFloat(r[2]),
    low: parseFloat(r[3]),
    close: parseFloat(r[4]),
  });
  return await Promise.all([
    fetchKline({
      symbol: symbol,
      interval: config.tfLong,
      limit: 10,
    }).then((res) => res.map(parseData)),
    fetchKline({
      symbol: symbol,
      interval: config.tfShort,
      limit: 10,
    }).then((res) => res.map(parseData)),
  ]).then(([barsLong, barsShort]) => ({
    barsLong,
    barsShort,
  }));
}

async function validateAccountBalance(config) {
  let balance = await binanceClient.fetchBalance();
  let baseBalance = balance[config.base];
  let assetBalance = balance[config.asset];
  logger.info(`
${config.base} Balance: Free (${baseBalance.free}) - Used: (${baseBalance.used} - Total: (${baseBalance.total}))
${config.asset} Balance: Free (${assetBalance.free}) - Used: (${assetBalance.used} - Total: (${assetBalance.total}))
  `);
  if (baseBalance.free < config.capital) {
    throw Error("Số dư tài khoản không đủ so với số vốn");
  }
}

async function validateConfigTicker(config) {
  return await binanceClient.fetchTicker(config.symbol).catch((err) => {
    throw new Error(`Symbol not valid: ${err.message}`);
  });
}

function setConfig() {
  const config = {
    asset: process.env.ASSET,
    base: process.env.BASE,
    capital: process.env.CAPITAL,
    tfLong: process.env.TF_LONG,
    tfShort: process.env.TF_SHORT,
    symbol: process.env.ASSET + "/" + process.env.BASE,
  };
  logger.info(`
Start Bot with symbol ${config.symbol}.
Capital: ${config.capital}
Time Frame: ${config.tfLong} : ${config.tfShort}
  `);
  return config;
}
