const fs = require("fs");
const express = require("express");
const bodyParser = require("body-parser");
const { binanceClient, fetchKline } = require("./binance");
const { get } = require("lodash");

binanceClient.loadMarkets();
const app = express();

app.use(express.static("public"));
app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("Hello world");
});
app.set("port", 1234);

app.get("/api/kline", async (req, res) => {
  console.log("/api/kline", req.query);
  try {
    const result = await fetchKline(req.query);
    res.json(result);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.post("/api/order/buy", async (req, res) => {
  // return res.status(500).send("Blocked");
  console.log(req.url, req.body);
  try {
    const { asset, base, balance } = req.body;

    const market = binanceClient.market(`${asset}/${base}`);
    const ticker = await binanceClient.fetchTicker(`${asset}/${base}`);
    let quantity = balance / ticker.last;
    console.log("with filter", quantity);
    const precision = getMarketPrecision(market);
    quantity = parseFloat(toFixed(quantity, precision));
    console.log({ precision, quantity });
    const price = ticker.ask;
    // const qty = Math.floor(balance / price);
    const order = await binanceClient.createLimitBuyOrder(`${asset}/${base}`, quantity, price);
    // console.log("balance, price", balance, price, qty);
    // const order = await binanceClient.createMarketOrder(`${asset}/${base}`, "buy", quantity);
    res.json(order);
  } catch (err) {
    console.log("buy error", err.message);
    res.status(500).send(err.message);
  }
});

app.post("/api/order/sell", async (req, res) => {
  // return res.status(500).send("Blocked");
  console.log(req.url, req.body);
  try {
    const { asset, base, price } = req.body;
    const balance = await binanceClient.fetchBalance();
    const assetFree = balance[asset].free;
    const ticker = await binanceClient.fetchTicker(`${asset}/${base}`);
    const market = binanceClient.market(`${asset}/${base}`);
    const precision = getMarketPrecision(market);
    const quantity = parseFloat(toFixed(assetFree, precision));
    const order = await await binanceClient.createLimitSellOrder(
      `${asset}/${base}`,
      quantity,
      ticker.bid
    );
    // const order = await await binanceClient.createOrder(
    //   `${asset}/${base}`,
    //   "STOP_LOSS_LIMIT",
    //   "sell",
    //   assetFree,
    //   price * 0.998,
    //   { stopPrice: price * 0.999 }
    // );

    console.log({ assetFree, quantity });
    // console.log(assetFree, price, { quoteOrderQty: assetFree * price });
    // const order = await await binanceClient.createMarketOrder(`${asset}/${base}`, "sell", quantity);
    res.json(order);
  } catch (err) {
    console.log("sell error", err.message);
    res.status(500).send(err.message);
  }
});

app.post("/api/order/cancelAll", async (req, res) => {
  // return res.status(500).send("Blocked");
  console.log(req.url, req.body);
  try {
    const { base, asset } = req.body;
    const result = await binanceClient.cancelAllOrders(`${asset}/${base}`);
    res.json(result);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get("/api/balance", async (req, res) => {
  console.log("/api/balance");
  const balance = await binanceClient.fetchBalance();
  res.json(balance);
});

app.get("/api/order", async (req, res) => {
  console.log(req.url, req.query);
  try {
    const { asset, base } = req.query;
    const orders = await binanceClient.fetchOrders(`${asset}/${base}`);
    res.json(orders);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.listen(app.get("port"), "0.0.0.0", () => {
  console.log("Server is running on port", app.get("port"));
});

function getMarketPrecision(market) {
  const stepSize = market.info.filters.find((f) => f.filterType == "LOT_SIZE").stepSize;
  const precision = parseInt(Math.round(-Math.log10(stepSize), 0));
  return precision;
}
function toFixed(num, fixed) {
  var re = new RegExp("^-?\\d+(?:.\\d{0," + (fixed || -1) + "})?");
  return num.toString().match(re)[0];
}
// const run = async () => {
//
// };

// run();
// async function writeMarket(binanceClient) {
//   const markets = await binanceClient.loadMarkets();
//   const symbolFile = fs.createWriteStream("markets.txt", "utf8");

//   Object.values(markets).forEach((m) =>
//     symbolFile.write(Buffer.from(m.symbol + "\n"))
//   );
//   symbolFile.end();
// }
