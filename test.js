const { scan } = require("./scanner");
const { sma } = require("technicalindicators");
const { last, first, takeRight } = require("lodash");
const { binanceClient } = require("./binance");

binanceClient.fetchOrder("2914643", "NU/USDT").then(console.log);

// scan(
//   { period: 10, intervals: ["30m", "4h"] },
//   async ([bars_1h, bars_1d]) => {
//     var sma10_1d = sma({ period: 10, values: bars_1d.map((b) => b.close) })[0];
//     const preBar2 = first(takeRight(bars_1h, 3));
//     const preBar1 = first(takeRight(bars_1h, 2));
//     var sma10_1h = sma({ period: 10, values: bars_1h.map((b) => b.close) })[0];
//     const cond1 = last(bars_1d).close > sma10_1d;
//     const cond2 = preBar2.close < sma10_1h && preBar1.close > sma10_1h;
//     if (cond1 & cond2) {
//       console.log("=====>");
//       console.log("sma10_1d", sma10_1d);
//       console.log("chart1d.currentBar.close", last(bars_1d).close);
//       console.log("preBar2.close", preBar2.close);
//       console.log("preBar1.close", preBar1.close);
//       console.log("sma10_1h", sma10_1h);
//       console.log("<=====");
//     }
//     return cond1 & cond2;
//   },
//   ({ market, data }) => {
//     console.log(`${market.info.symbol}`);
//   }
// );
