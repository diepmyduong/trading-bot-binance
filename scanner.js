const { fetchKline, binanceClient } = require("./binance");
const DraftLog = require("draftlog");
const { times } = require("lodash");
DraftLog(console);
const parseData = (r) => ({
  time: r[0] / 1000,
  open: parseFloat(r[1]),
  high: parseFloat(r[2]),
  low: parseFloat(r[3]),
  close: parseFloat(r[4]),
});
const scan = async function ({ period = 100, intervals = ["1h", "1d"] }, filter, cb) {
  const markets = Object.values(await binanceClient.loadMarkets());
  console.log("markets", markets.length);
  var count = 1;
  var update = console.draft("checking" + times(count, () => ".").join(""));
  for (const m of markets) {
    count++;
    if (count > 10) count = 1;
    if (m.quote != "USDT") continue;
    if (m.info.status != "TRADING") continue;
    // if (!m.future) return;
    // console.log("checking...", m.info.symbol);
    update("checking" + times(count, () => ".").join(""));
    const data = await Promise.all(
      intervals.map((interval) =>
        fetchKline({
          symbol: m.info.symbol,
          interval: interval,
          limit: period,
        }).then((res) => res.map(parseData))
      )
    );
    const valid = await filter(data);
    if (valid) {
      cb({ market: m, data: data });
    }
  }
  console.log("DONE");
};

module.exports = {
  scan,
};
