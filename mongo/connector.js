require("dotenv").config();
var mongoose = require("mongoose");

const MainConnection = mongoose.createConnection(process.env.MONGO_CONNECTION, {
  useNewUrlParser: true,
  socketTimeoutMS: 30000,
  keepAlive: true,
  useFindAndModify: false,
  useCreateIndex: true,
  useUnifiedTopology: true,
});

module.exports = { MainConnection };

MainConnection.on("open", () => {
  console.log("Database Connected");
});
MainConnection.on("disconnected", () => {
  console.log("Mất kết nối");
});
