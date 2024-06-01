const { Schema } = require("mongoose");
const { MainConnection } = require("../connector");

const botSchema = new Schema(
  {
    name: { type: Schema.Types.String },
    capital: { type: Schema.Types.Number },
    tfLong: { type: Schema.Types.String },
    tfShort: { type: Schema.Types.String },
    asset: { type: Schema.Types.String },
    base: { type: Schema.Types.String },
    longClose: { type: [Schema.Types.Number] },
    shortClose: { type: [Schema.Types.Number] },
    shortMA10: { type: [Schema.Types.Number] },
    longMA10: { type: [Schema.Types.Number] },
    rsi14: { type: [Schema.Types.Number] },
    sar: { type: [Schema.Types.Number] },
    isTrading: { type: Schema.Types.Boolean },
    buyTime: { type: Schema.Types.Date },
    buyOrderId: { type: Schema.Types.String },
    buyPrice: { type: Schema.Types.Number },
    buyCost: { type: Schema.Types.Number },
    buySize: { type: Schema.Types.Number },
    isActive: { type: Schema.Types.Boolean },
  },
  { timestamps: true }
);

const BotModel = MainConnection.model("bot", botSchema);

module.exports = { BotModel };
