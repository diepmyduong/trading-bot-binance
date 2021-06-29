const ccxt = require("ccxt");
const axios = require("axios");
const { config } = require("./config");
const { EventEmitter } = require("events");
const WebSocket = require("ws");
// const Binance = require("node-binance-api");
const Binance = require("binance-api-node").default;

var mainnet = "https://api.binance.com/api";
var testnet = "https://testnet.binance.vision/api";
var testnetFuture = "https://testnet.binancefuture.com";

var mainnetSocket = "wss://stream.binance.com:9443/ws";
var testnetSocket = "wss://testnet.binance.vision/ws";
var testnetFutureSocket = "wss://stream.binancefuture.com/ws";

console.log("debug", config.debug);
const binanceClient = new ccxt.binance({
  apiKey: config.debug ? config.testnetApiKey : config.apiKey,
  secret: config.debug ? config.testnetApiSecret : config.apiSecret,
});
const binance = Binance({
  apiKey: config.debug ? config.testnetApiKey : config.apiKey,
  apiSecret: config.debug ? config.testnetApiSecret : config.apiSecret,
  // httpFutures: "https://testnet.binancefuture.com",
  // wsFutures: "wss://stream.binancefuture.com",
});
const binanceHost = config.debug ? testnet : mainnet;
if (config.debug) binanceClient.setSandboxMode(true);

binanceClient.loadMarkets().then((markets) => {
  console.log("markets loaded", markets.length);
});

const fetchKline = async function ({ symbol, interval, limit, startTime, endTime }) {
  return axios
    .get(binanceHost + "/v3/klines", { params: { symbol, interval, limit, startTime, endTime } })
    .then((res) => res.data)
    .catch((err) => {
      console.log("fetchKline error", err.message);
      throw err;
    });
};

class BinanceSocket extends EventEmitter {
  constructor(symbol, interval) {
    super();
    const host = config.debug ? testnetSocket : mainnetSocket;
    var socket = new WebSocket(`${host}/${symbol.toLowerCase()}@kline_${interval}`);
    socket.on("message", (event) => {
      if (!event) return;
      const data = JSON.parse(event);
      const bar = {
        time: data.k.t / 1000,
        open: parseFloat(data.k.o),
        high: parseFloat(data.k.h),
        low: parseFloat(data.k.l),
        close: parseFloat(data.k.c),
      };
      this.emit("data", bar);
    });
  }
}

class BinanceOrderWatcher extends EventEmitter {
  constructor(order) {
    super();
    let interval = setInterval(async () => {
      order = await binanceClient.fetchOrder(order.id, order.symbol);
      if (order.status != "open") {
        this.emit("data", order);
        clearInterval(interval);
      }
    }, 5000);
  }
}

module.exports = {
  binanceClient,
  fetchKline,
  BinanceSocket,
  BinanceOrderWatcher,
  binance,
};
