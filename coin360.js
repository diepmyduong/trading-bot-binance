var axios = require("axios");

function getCoin(coin, convert) {
  return axios
    .get("https://api.coin360.com/coin/latest", {
      params: {
        coin,
        convert,
      },
    })
    .then((res) => res.data);
}

module.exports = {
  getCoin,
};
