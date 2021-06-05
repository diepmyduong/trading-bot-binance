"use strict";

const binanceConfig = {
  mainnet: "wss://stream.binance.com:9443/ws",
  testnet: "wss://testnet.binance.vision/ws",
  debug: false,
};

class EventEmitter {
  constructor() {
    this.callbacks = {};
  }
  on(event, cb) {
    if (!this.callbacks[event]) this.callbacks[event] = [];
    this.callbacks[event].push(cb);
  }
  emit(event, data) {
    let cbs = this.callbacks[event];
    if (cbs) {
      cbs.forEach((cb) => cb(data));
    }
  }
}

class CandleChart extends EventEmitter {
  tradingMarkers = [];
  constructor({ element, symbol, interval, period = 1000 }) {
    super();
    this.element = element;
    this.symbol = symbol;
    this.interval = interval;
    this.period = period;
    this.chart = LightweightCharts.createChart(element, {
      width: 600,
      height: 300,
      timeScale: {
        timeVisible: true,
        borderColor: "#D1D4DC",
      },
      rightPriceScale: {
        borderColor: "#D1D4DC",
      },
      layout: {
        backgroundColor: "#ffffff",
        textColor: "#000",
      },
      grid: {
        horzLines: {
          color: "#F0F3FA",
        },
        vertLines: {
          color: "#F0F3FA",
        },
      },
    });
    this.indicators = [
      new PriceIndicator({ chart: this }),
      new SMAIndicator({ chart: this, period: 10 }),
    ];
    this.fetchKline();
    this.startWebsocket();
  }
  async fetchKline() {
    const response = await fetch(
      `api/kline?symbol=${this.symbol.toUpperCase()}&interval=${this.interval}&limit=${this.period}`
    );
    const parseData = (r) => ({
      time: r[0] / 1000,
      open: parseFloat(r[1]),
      high: parseFloat(r[2]),
      low: parseFloat(r[3]),
      close: parseFloat(r[4]),
    });
    this.bars = await response.json().then((data) => data.map(parseData));
    for (const i of this.indicators) {
      i.setData(this.bars);
    }
    this.emit("setData", this.bars);
  }
  async startWebsocket() {
    const host = binanceConfig.debug ? binanceConfig.testnet : binanceConfig.mainnet;
    this.binanceSocket = new WebSocket(
      `${host}/${this.symbol.toLowerCase()}@kline_${this.interval}`
    );
    this.binanceSocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const bar = {
        time: data.k.t / 1000,
        open: parseFloat(data.k.o),
        high: parseFloat(data.k.h),
        low: parseFloat(data.k.l),
        close: parseFloat(data.k.c),
      };
      if (this.bars[this.bars.length - 1].time == bar.time) {
        this.bars[this.bars.length - 1] = bar;
      } else {
        this.bars.push(bar);
        this.emit("data", bar);
      }
      for (const i of this.indicators) {
        i.update(bar);
      }
    };
  }
  destroy() {
    this.binanceSocket.close();
    this.indicators.forEach((i) => {
      this.chart.removeSeries(i.series);
    });
    this.chart = null;
    this.element.innerHTML = null;
  }
  get currentBar() {
    return this.bars[this.bars.length - 1];
  }
  get currentBarIndex() {
    return this.bars.length - 1;
  }
  sell(index) {
    this.tradingMarkers.push({
      time: this.bars[index].time,
      position: "aboveBar",
      color: "#e91e63",
      shape: "arrowDown",
      text: "Sell @ " + this.bars[index].open.toFixed(4),
    });
    this.indicators[0].series.setMarkers(this.tradingMarkers);
    this.emit("trade", {
      type: "sell",
      barIndex: index,
      price: this.bars[index].open,
      bar: this.bars[index],
    });
  }
  buy(index) {
    this.tradingMarkers.push({
      time: this.bars[index].time,
      position: "belowBar",
      color: "#2196F3",
      shape: "arrowUp",
      text: "Buy @ " + this.bars[index].open.toFixed(4),
    });
    this.indicators[0].series.setMarkers(this.tradingMarkers);
    this.emit("trade", {
      type: "buy",
      barIndex: index,
      price: this.bars[index].open,
      bar: this.bars[index],
    });
  }
  prev(length) {
    return this.bars[this.currentBarIndex - length];
  }
}

class Indicator {
  constructor(chart) {
    this.candleChart = chart;
  }
  get bars() {
    return this.candleChart.bars;
  }
  updateData(data) {
    if (this.data[this.data.length - 1].time == data.time) {
      this.data[this.data.length - 1] = data;
    } else {
      this.data.push(data);
    }
  }
}

class PriceIndicator extends Indicator {
  constructor({ chart }) {
    super(chart);
    this.series = this.candleChart.chart.addCandlestickSeries({
      upColor: "rgb(38,166,154)",
      downColor: "rgb(255,82,82)",
      wickUpColor: "rgb(38,166,154)",
      wickDownColor: "rgb(255,82,82)",
      borderVisible: false,
    });
  }

  setData(bars) {
    this.data = bars;
    this.series.setData(bars);
  }
  update(bar) {
    this.updateData(bar);
    this.series.update(bar);
  }
}

class SMAIndicator extends Indicator {
  constructor({ chart, period, color = "rgba(4, 111, 232, 1)", price = "close" }) {
    super(chart);
    this.series = this.candleChart.chart.addLineSeries({
      color: color,
      lineWidth: 2,
    });
    this.period = period;
    this.price = price;
  }

  setData(bars) {
    const values = bars.map((b) => b[this.price]);
    const smaValues = sma({ period: this.period, values: values });
    var i = 0;
    var smaData = [];
    const startIndex = bars.length - smaValues.length;
    for (var i = startIndex; i < bars.length; i++) {
      smaData.push({ time: bars[i].time, value: smaValues.shift() });
    }
    this.data = smaData;
    this.series.setData(smaData);
  }

  update(bar) {
    if (this.bars.length >= this.period) {
      const len = this.bars.length;
      const bars = this.bars.slice(len - this.period, len);
      const smaValues = sma({
        period: this.period,
        values: bars.map((b) => b[this.price]),
      });
      const smaData = { time: bar.time, value: smaValues[0] };
      this.updateData(smaData);
      this.series.update(smaData);
    }
  }
}
