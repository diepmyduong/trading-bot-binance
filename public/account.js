// const { default: axios } = require("axios");

async function getBalance() {
  var balance = await fetch("/api/balance").then((res) => res.json());
  return balance;
}

async function orderBuy({ asset, base, price, balance }) {
  var order = await axios
    .post("/api/order/buy", { asset, base, price, balance })
    .then((res) => res.data);
  return order;
}
async function orderSell({ asset, base, price }) {
  var order = await axios
    .post("/api/order/sell", { asset, base, price })
    .then((res) => res.data);
  return order;
}
async function getOpenOrders({ asset, base }) {
  return await axios
    .get("/api/order", { params: { asset, base } })
    .then((res) => res.data);
}

async function cancelAllOrders({ asset, base }) {
  return await axios
    .post("/api/order/cancelAll", { asset, base })
    .then((res) => res.data);
}
