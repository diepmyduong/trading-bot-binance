require("dotenv").config();

module.exports = {
  config: {
    apiKey: process.env.API_KEY,
    apiSecret: process.env.API_SECRET,
    testnetApiKey: process.env.TESTNET_API_KEY,
    testnetApiSecret: process.env.TESTNET_API_SECRET,
    debug: process.env.NODE_ENV == "development",
    telegramToken: process.env.TELEGRAM_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    telegramCommandToken: process.env.TELEGRAM_COMMAND_TOKEN,
  },
};
