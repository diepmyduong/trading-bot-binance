"use strict";

const TelegramBot = require("node-telegram-bot-api");
const Transport = require("winston-transport");
const { config } = require("./config");

class TelegramTransport extends Transport {
  constructor(opts, { token, chatId }) {
    super(opts);
    this.bot = new TelegramBot(token, { polling: false });
    this.chatId = chatId;
  }

  log(info, callback) {
    setImmediate(() => {
      this.emit("logged", info);
    });
    if (!config.debug) this.bot.sendMessage(this.chatId, info.message);
    // Perform the writing to the remote service
    callback();
  }
}

module.exports = { TelegramTransport };
