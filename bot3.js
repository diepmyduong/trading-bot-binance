"use strict";

const winston = require("winston");
const { binanceClient, fetchKline, BinanceSocket, BinanceOrderWatcher } = require("./binance");
const { SMA, sma, RSI, PSAR } = require("technicalindicators");
const { last, takeRight, get } = require("lodash");
const { TelegramTransport } = require("./telegram-transport");
const { config } = require("./config");
const { EventEmitter } = require("events");

class TradingBot extends EventEmitter {
  isHolding = false;
  buyOrder = null;
  sellOrder = null;
  buyPrice = 0;
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
      this.logger.info(`Start Bot V2 with symbol ${this.symbol}.
Capital: ${this.capital}$
Time Frame: ${this.tfLong} : ${this.tfShort}`);
      await this.validateTicker();
      await this.validateInitState();
      const { barsLong, barsShort } = await this.fetchInitBarData({
        longLimit: 50,
        shortLimit: 100,
      });
      this.barsLong = barsLong;
      this.barsShort = barsShort;
      this.tfLongSocket = new BinanceSocket(this.symbol2, this.tfLong);
      this.tfShortSocket = new BinanceSocket(this.symbol2, this.tfShort);
      this.tfLongSocket.on("data", (bar) => this.updateBar("long", bar));
      this.tfShortSocket.on("data", async (bar) => {
        try {
          const isNew = this.updateBar("short", bar);
          var rsi = barToRSI(takeRight(this.barsShort, 17));
          var profit = bar.close / this.buyPrice - 1;
          // console.log(`[${this.botName}] RSI: ${last(rsi)}`);
          if (!isNew) {
            const cond1 = last(rsi) >= 90 && profit > 0.1;
            const cond2 = this.buyPrice > 0 && bar.close < bar.high && profit >= 0.015;
            const cond3 = this.buyPrice > 0 && profit < -0.01;
            if (this.isHolding && (cond1 || cond2 || cond3)) {
              this.logSellOrderRSI(last(rsi));
              await this.sell(last(this.barsShort));
            }
            return;
          }
          this.logBar(bar, last(rsi));
          const barLong = last(this.barsLong);
          const [preBar, barShort] = takeRight(this.barsShort, 2);
          const [smaLong] = sma({
            period: 10,
            values: takeRight(this.barsLong, 10).map((b) => b.close),
          });
          const [smaShort1, smaShort2] = sma({
            period: 10,
            values: takeRight(this.barsShort, 11).map((b) => b.close),
          });
          const smaShort2_1 = smaShort2 * 1.03;
          const smaShort2_2 = smaShort2 * 0.97;
          const sarValue = barToSAR(takeRight(this.barsShort, 50));
          const [preSar1, preSar2] = takeRight(sarValue, 2);
          const [_, preRsi1, preRsi2] = takeRight(rsi, 3);
          if (!this.isHolding) {
            // Buy
            // const cond1 = barLong.close > smaLong;
            const cond1 = preBar && preBar.low < smaShort2_2;
            const cond2 = preRsi1 && preRsi2 && preRsi1 > preRsi2;
            if (cond1 && cond2) {
              await this.buy(preBar, smaShort2_2);
            }
          } else {
            const cond1 = preBar && preBar.high > smaShort2_1 && preBar.close < smaShort2_1;
            const cond2 = preBar && preBar.close < this.buyPrice * 0.99;
            const cond3 = preBar.close > this.buyPrice * 1.015;
            // Sell
            if (cond1 || cond2 || cond3) {
              let reason = cond1 ? `Take Profit` : "";
              reason = cond2 ? `Stop loss` : reason;
              reason = cond3 ? `Take Profit 2%` : reason;
              this.logSellOrder(reason);
              await this.sell();
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

  async buy(preBar, smaShort) {
    await this.checkBalanceValid();
    this.logBuyOrder(preBar, smaShort);
    if (this.sellOrder) {
      await this.closeOrder(this.sellOrder);
      this.sellOrder = null;
    }
    const ticker = await binanceClient.fetchTicker(this.symbol);
    const price = ticker.ask;
    const qty = this.capital / price;

    this.buyOrder = await binanceClient.createLimitBuyOrder(this.symbol, qty, price);
    this.buyPrice = price;
    this.watchOrder(this.buyOrder);
    this.logBuyOrderSended(this.buyOrder);
    this.isHolding = true;
  }

  async sell() {
    const balances = await binanceClient.fetchBalance();
    const sellQty = balances[this.asset].total;
    const market = await binanceClient.market(this.symbol);
    if (sellQty < market.limits.amount.min) {
      this.isHolding = false;
      throw Error("Nothing to sell: Prev Buy Order Filled Qty is Zero");
    }
    // let buyPrice = 0;
    if (this.buyOrder) {
      const fetchBuyOrder = await this.closeOrder(this.buyOrder);
      // buyPrice = fetchBuyOrder.average;
    }
    console.log("CHECK SELL ORDER BEFOR SELL", this.sellOrder);
    if (this.sellOrder) {
      console.log("CLOSE SELL ORDER");
      await this.closeOrder(this.sellOrder);
      this.sellOrder = null;
      console.log("EMPTY SELL ORDER");
    }
    const ticker = await binanceClient.fetchTicker(this.symbol);
    this.sellOrder = await binanceClient
      .createLimitSellOrder(this.symbol, sellQty, ticker.bid)
      .catch((err) => {
        if (err.message.includes("MIN_NOTIONAL")) {
          this.isHolding = false;
        }
        throw err;
      });
    // this.sellOrder = await binanceClient
    //   .createMarketOrder(this.symbol, "sell", sellQty * 0.99999, sellPrice)
    //   .catch((err) => {
    //     console.log(
    //       `SELL MARKET ERROR : ${err.message}. SellQty: ${
    //         sellQty * 0.99999
    //       }, SellPrice: ${sellPrice}`
    //     );
    //     return binanceClient.createLimitSellOrder(this.symbol, sellQty, sellPrice * 0.9999);
    //   });
    var wacher = new BinanceOrderWatcher(this.sellOrder);
    wacher.on("data", (order) => {
      const orderPrice = order.type == "market" ? order.average : order.price;
      const profit = this.buyPrice == 0 ? 0 : (orderPrice / this.buyPrice - 1) * 100;
      console.log("CALCULATE PROFIT AFTER SELL");
      console.log("Buy Price", this.buyPrice, this.buyOrder);
      console.log("Sell Price", order.price);
      console.log("Profit", profit);
      this.logTrading(order, profit.toFixed(4));
      this.logBalance();
      this.buyOrder = null;
      this.buyPrice = 0;
      this.isHolding = false;
    });
    this.logSellOrderSended(this.sellOrder);
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
  logSellOrder(reason) {
    this.logger.info(`[${this.botName}] Ready to Sell With Info ${reason}`);
  }
  logSellOrderRSI(rsi) {
    this.logger.info(`[${this.botName}] Ready to Sell With Info: RSI: ${rsi} > 90`);
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
  logBuyOrder(preBar, smaShort) {
    this.logger.info(
      `[${this.botName}] Ready to Buy With Info. Pre Bar Low: ${preBar.low} < SMA - 3%: ${smaShort}`
    );
  }

  async closeOrder(order) {
    const fetchedOrder = await binanceClient.fetchOrder(order.id, this.symbol);
    if (fetchedOrder.status == "open") {
      await binanceClient.cancelOrder(fetchedOrder.id, this.symbol).catch((err) => {
        this.logger.info(`Cancel ORDER ERROR: ${err.message}`);
      });
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
    const orders = await binanceClient.fetchOrders(this.symbol);
    let hasLastSell = false;
    for (var j = orders.length - 1; j >= 0; j--) {
      const o = orders[j];
      if (o.side == "buy" && o.status == "closed") {
        this.buyOrder = o;
        this.buyPrice = o.price;
        console.log(`FIND BUY ORDER: ${this.buyOrder.id} Price: ${this.buyPrice}`);
        break;
      }
      if (o.side == "sell" && o.status == "closed") {
        hasLastSell = true;
      }
    }
    const openingOrders = await binanceClient.fetchOpenOrders(this.symbol);
    console.log(`FETCH OPENING ORDER: ${openingOrders.length}`);
    if (openingOrders.length > 0) {
      const order = openingOrders[0];
      this.isHolding = true;
      if (order.side == "buy") {
        this.buyOrder = order;
        this.buyPrice = order.price;
        console.log(`UPDATE OPENING BUY ORDER: ${this.buyOrder.id} Price: ${this.buyPrice}`);
        this.watchOrder(order);
      } else {
        // let buyPrice = this.buyOrder.price;
        this.sellOrder = order;
        console.log(
          `UPDATE OPENING SELL ORDER: ${this.sellOrder.id} Price: ${this.sellOrder.price}`
        );
        var wacher = new BinanceOrderWatcher(this.sellOrder);
        wacher.on("data", (order) => {
          const orderPrice = order.type == "market" ? order.average : order.price;
          const profit = this.buyPrice == 0 ? 0 : (orderPrice / this.buyPrice - 1) * 100;
          console.log(
            `INIT CALCULATE PROFIT: Buy Price: ${this.buyPrice}, Sell Price: ${order.price}, Profit: ${profit}`
          );
          this.logTrading(order, profit);
          this.logBalance();
          this.isHolding = false;
        });
      }
    } else {
      const balances = await this.logBalance();
      const assetBalance = balances[this.asset];
      const market = binanceClient.market(this.symbol);
      if (assetBalance.free >= market.limits.amount.min && !hasLastSell) {
        console.log("INIT STATE SELLING", assetBalance);
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

  logBar(bar, rsi) {
    this.klineLogger.info(
      `[${new Date(bar.time * 1000)}] O: ${bar.open} H: ${bar.high} L: ${bar.low} C: ${
        bar.close
      } RSI: ${rsi}`
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
  async fetchInitBarData({ longLimit = 10, shortLimit = 10 }) {
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
        limit: longLimit,
      }).then((res) => res.map(parseData)),
      fetchKline({
        symbol: this.symbol2,
        interval: this.tfShort,
        limit: shortLimit,
      }).then((res) => res.map(parseData)),
    ]).then(([barsLong, barsShort]) => ({
      barsLong,
      barsShort,
    }));
  }
}

function barToRSI(bars) {
  let rsi = new RSI({ period: 14, values: [] });
  let results = [];
  bars.forEach((b) => {
    let result = rsi.nextValue(b.close);
    results.push(result);
  });
  return results;
}
function barToSAR(bars) {
  let psar = new PSAR({ step: 0.02, max: 0.2 });
  let results = [];
  bars.forEach((b, index) => {
    let result = psar.nextValue({ low: b.low, high: b.high });
    results.push(result);
  });
  return results;
}

module.exports = TradingBot;
