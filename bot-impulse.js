"use strict";

const winston = require("winston");
const { binanceClient, fetchKline, BinanceSocket, BinanceOrderWatcher } = require("./binance");
const { SMA, sma, ema, macd, EMA, MACD } = require("technicalindicators");
const { last, takeRight, get } = require("lodash");
const { TelegramTransport } = require("./telegram-transport");
const { config } = require("./config");
const { EventEmitter } = require("events");

class ImpulseSystemTradingBot extends EventEmitter {
  isHolding = false;
  buyOrder = null;
  sellOrder = null;
  constructor({ botName, asset, base, capital, tfLong, tfShort }) {
    super();
    this.botName = botName;
    this.asset = asset;
    this.base = base;
    this.capital = capital;
    this.tfLong = tfLong;
    this.tfShort = tfShort;
    this.symbol = `${asset}/${base}`;
    this.symbol2 = `${asset}${base}`;
    this.configLogger();
  }

  configLogger() {
    this.logger = winston.createLogger({
      format: winston.format.simple(),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({
          filename: `logs/${this.botName}.log`,
        }),
        new TelegramTransport({}, { token: config.telegramToken, chatId: config.telegramChatId }),
      ],
    });

    this.tradeLogger = winston.createLogger({
      format: winston.format.simple(),
      transports: [
        new winston.transports.File({
          filename: `logs/${this.botName}-trade.log`,
        }),
        new TelegramTransport({}, { token: config.telegramToken, chatId: config.telegramChatId }),
      ],
    });

    this.klineLogger = winston.createLogger({
      format: winston.format.simple(),
      transports: [
        new winston.transports.File({
          filename: `logs/${this.botName}-kline.log`,
        }),
      ],
    });
  }

  async start() {
    try {
      this.logger.info(`Start Bot with symbol ${this.symbol}.
Capital: ${this.capital}$
Time Frame: ${this.tfLong} : ${this.tfShort}`);
      await this.validateTicker();
      await this.validateInitState();
      const { barsLong, barsShort } = await this.fetchInitBarData();
      this.barsLong = barsLong;
      this.barsShort = barsShort;
      this.tfLongSocket = new BinanceSocket(this.symbol2, this.tfLong);
      this.tfShortSocket = new BinanceSocket(this.symbol2, this.tfShort);
      this.tfLongSocket.on("data", (bar) => this.updateBar("long", bar));
      this.tfShortSocket.on("data", async (bar) => {
        try {
          const isNew = this.updateBar("short", bar);
          if (!isNew) return;
          this.logBar(bar);

          const [preBar, barShort] = takeRight(this.barsShort, 2);
          const [smaLong] = sma({
            period: 10,
            values: takeRight(this.barsLong, 10).map((b) => b.close),
          });
          const [smaShort1, smaShort2] = sma({
            period: 10,
            values: takeRight(this.barsShort, 11).map((b) => b.close),
          });
          if (!this.isHolding) {
            // Buy
            const cond1 = barLong.close > smaLong;
            const cond2 = preBar.open < smaShort1 && preBar.close > smaShort1;
            if (cond1 & cond2) {
              await this.checkBalanceValid();
              this.logBuyOrder(barLong, smaLong, preBar, smaShort1);
              if (this.sellOrder) {
                await this.closeOrder(this.sellOrder);
                this.sellOrder = null;
              }
              const price = barShort.close;
              const qty = this.capital / barShort.close;
              this.buyOrder = await binanceClient.createLimitBuyOrder(this.symbol, qty, price);
              this.watchOrder(this.buyOrder);
              this.logBuyOrderSended(this.buyOrder);
              this.isHolding = true;
            }
          } else {
            // Sell
            if (preBar && preBar.close < smaShort2) {
              this.logSellOrder(preBar, smaShort2);
              const balances = await binanceClient.fetchBalance();
              const sellQty = balances[this.asset].free;
              const sellPrice = barShort.close;
              if (sellQty == 0) {
                this.isHolding = false;
                throw Error("Nothing to sell: Prev Buy Order Filled Qty is Zero");
              }
              let buyPrice = 0;
              if (this.buyOrder) {
                const fetchBuyOrder = await this.closeOrder(this.buyOrder);
                buyPrice = fetchBuyOrder.average;
                this.buyOrder = null;
              }
              this.sellOrder = await binanceClient.createLimitSellOrder(
                this.symbol,
                sellQty,
                sellPrice * 0.9999
              );
              var wacher = new BinanceOrderWatcher(this.sellOrder);
              wacher.on("data", (order) => {
                const profit = buyPrice == 0 ? 0 : ((order.price - buyPrice) / buyPrice) * 100;
                this.logTrading(order, profit.toFixed(4));
                this.logBalance();
              });
              this.logSellOrderSended(this.sellOrder);
              this.isHolding = false;
            }
          }
        } catch (err) {
          console.log("err", err);
          this.logger.info(`[${this.botName}] Error: ${err.message}`);
        }
      });
    } catch (err) {
      this.emit("error", err);
    }
  }

  getBarColor(bars) {
    let ema13 = new EMA({ period: 13, values: bars });
    let macd12 = new MACD({
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMASignal: false,
      SimpleMAOscillator: false,
      values: [],
    });
    // for (const bars )
    const bar15 = takeRight(bars, 15).map((b) => b.close);
    const bar35 = takeRight(bars, 35).map((b) => b.close);
    if (bar35.length != 35) return;
    const [ema13_1, ema13_2] = ema({ period: 13, values: bar14 });
    const [macd_1, macd_2] = takeRight(
      macd({
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMASignal: false,
        SimpleMAOscillator: false,
        values: bar35,
      }),
      2
    );
    const isScreen =
      ema13_2 > ema13_1 && macd_2.histogram > macd_1.histogram && macd_2.MACD > macd_1.MACD;
    const isRed =
      ema13_2 < ema13_1 && macd_2.histogram < macd_1.histogram && macd_2.MACD < macd_1.MACD;
    const isYellow = !isScreen && !isRed;
    const isAqua = isYellow && macd_2.histogram > macd_1.histogram && macd_2.MACD > macd_1.MACD;
    let color = null;
    if (isScreen) {
      color = "screen";
    } else if (isRed) {
      color = "red";
    } else if (isAqua) {
      color = "aqua";
    } else {
      color = "yellow";
    }
    return color;
  }

  async checkBalanceValid() {
    const balances = await binanceClient.fetchBalance();
    if (balances[this.base].free < this.capital) {
      throw Error(
        `NOT Enough Capital. Skip Buy Order. Balance: ${balances[this.base].free} - Capital: ${
          this.capital
        }`
      );
    }
  }
  logSellOrder(preBar, smaShort2) {
    this.logger.info(`[${this.botName}] Ready to Sell With Info
Pre Bar Close: ${preBar.close} < SMA Short: ${smaShort2}`);
  }

  logBuyOrderSended(order) {
    this.logger.info(
      `[${this.botName}][${order.id}] Buy Order Qty: ${order.amount} - Price: ${order.price} - Filled: ${order.filled} - Cost: ${order.cost}`
    );
  }
  logSellOrderSended(order) {
    this.logger.info(
      `[${this.botName}][${order.id}] Sell Order Qty: ${order.amount} - Price: ${order.price} - Filled: ${order.filled} - Cost: ${order.cost}`
    );
  }
  logBuyOrder(barLong, smaLong, preBar, smaShort1) {
    this.logger.info(`[${this.botName}] Ready to Buy With Info
Bar Long Close: ${barLong.close} > SMA Long: ${smaLong}
Pre Bar Open: ${preBar.open} < SMA Short: ${smaShort1} < Pre Bar Close: ${preBar.close}`);
  }

  async closeOrder(order) {
    const fetchedOrder = await binanceClient.fetchOrder(order.id, this.symbol);
    if (fetchedOrder.status == "open") {
      await binanceClient.cancelOrder(fetchedOrder.id).catch((err) => {});
    }
    return fetchedOrder;
  }

  updateBar(type, bar) {
    if (type == "long") {
      if (last(this.barsLong).time == bar.time) {
        this.barsLong[this.barsLong.length - 1] = bar;
        return false;
      } else {
        this.barsLong.push(bar);
        return true;
      }
    } else {
      if (last(this.barsShort).time == bar.time) {
        this.barsShort[this.barsShort.length - 1] = bar;
        return false;
      } else {
        this.barsShort.push(bar);
        return true;
      }
    }
  }

  async validateInitState() {
    const openingOrders = await binanceClient.fetchOpenOrders(this.symbol);
    if (openingOrders.length > 0) {
      const order = openingOrders[0];
      if (order.side == "buy") {
        this.isHolding = true;
        this.buyOrder = order;
        this.watchOrder(order);
      } else {
        this.sellOrder = order;
        this.watchOrder(order);
      }
    } else {
      const balances = await this.logBalance();
      const assetBalance = balances[this.asset];
      if (assetBalance.free > 0) {
        this.isHolding = true;
      }
    }
  }

  watchOrder(order) {
    var wacher = new BinanceOrderWatcher(order);
    wacher.on("data", (order) => {
      this.logTrading(order);
      this.logBalance();
    });
  }

  async logBalance() {
    const balances = await binanceClient.fetchBalance();
    const baseBalance = balances[this.base];
    const assetBalance = balances[this.asset];
    this.logger.info(`
${this.base} Balance: Free (${baseBalance.free}) - Used: (${baseBalance.used} - Total: (${baseBalance.total}))
${this.asset} Balance: Free (${assetBalance.free}) - Used: (${assetBalance.used} - Total: (${assetBalance.total}))
      `);
    return balances;
  }

  async validateTicker() {
    await binanceClient.fetchTicker(this.symbol).catch((err) => {
      throw new Error(`Symbol not valid: ${err.message}`);
    });
  }

  logBar(bar) {
    this.klineLogger.info(
      `[${new Date(bar.time * 1000)}] O: ${bar.open} H: ${bar.high} L: ${bar.low} C: ${bar.close}`
    );
  }

  logTrading(order, profit = 0) {
    this.tradeLogger.info(
      `[${order.symbol}][${order.datetime}] ${order.side} Price: ${
        order.average || order.price
      } Qty: ${order.amount} Filled: ${order.filled} Fee: ${get(order, "fee.cost", 0)} Cost: ${
        order.cost
      } ID: ${order.id} Profit: ${profit}%`
    );
  }
  async fetchInitBarData() {
    const parseData = (r) => ({
      time: r[0] / 1000,
      open: parseFloat(r[1]),
      high: parseFloat(r[2]),
      low: parseFloat(r[3]),
      close: parseFloat(r[4]),
    });
    return await Promise.all([
      fetchKline({
        symbol: this.symbol2,
        interval: this.tfLong,
        limit: 10,
      }).then((res) => res.map(parseData)),
      fetchKline({
        symbol: this.symbol2,
        interval: this.tfShort,
        limit: 10,
      }).then((res) => res.map(parseData)),
    ]).then(([barsLong, barsShort]) => ({
      barsLong,
      barsShort,
    }));
  }
}

module.exports = TradingBot;
