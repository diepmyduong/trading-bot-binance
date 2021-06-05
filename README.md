## BINAINCE WEBSOCKET

server: wss://stream.binance.com:9443

trade stream: wss://stream.binance.com:9443/ws/bnbusdt@trade

## Kline/Candlestick Streams

wss://stream.binance.com:9443/ws/bnbusdt@kline_5m

{"e":"kline","E":1622731357208,"s":"BNBUSDT","k":{"t":1622731200000,"T":1622731499999,"s":"BNBUSDT","i":"5m","f":320476600,"L":320478639,"o":"414.83000000","c":"414.04000000","h":"414.97000000","l":"413.43000000","v":"3803.01220000","n":2040,"x":false,"q":"1575128.65386900","V":"1669.95390000","Q":"691782.81270400","B":"0"}}

## MAINNET API

https://api.binance.com/api
wss://stream.binance.com:9443/ws
wss://stream.binance.com:9443/stream

## TESTNET API

https://testnet.binance.vision/api
wss://testnet.binance.vision/ws
wss://testnet.binance.vision/stream

## Market Struct

{
limits: {
amount: { min: 0.01, max: 92141578 },
price: { min: 6.79, max: 10.19 },
cost: { min: 10, max: undefined },
market: { min: 0, max: 5619069.55534722 }
},
precision: { base: 8, quote: 8, amount: 2, price: 3 },
tierBased: false,
percentage: true,
taker: 0.001,
maker: 0.001,
feeSide: 'get',
id: 'USDTTRY',
lowercaseId: 'usdttry',
symbol: 'USDT/TRY',
base: 'USDT',
quote: 'TRY',
baseId: 'USDT',
quoteId: 'TRY',
info: {
symbol: 'USDTTRY',
status: 'TRADING',
baseAsset: 'USDT',
baseAssetPrecision: '8',
quoteAsset: 'TRY',
quotePrecision: '8',
quoteAssetPrecision: '8',
baseCommissionPrecision: '8',
quoteCommissionPrecision: '8',
orderTypes: [
'LIMIT',
'LIMIT_MAKER',
'MARKET',
'STOP_LOSS_LIMIT',
'TAKE_PROFIT_LIMIT'
],
icebergAllowed: true,
ocoAllowed: true,
quoteOrderQtyMarketAllowed: true,
isSpotTradingAllowed: true,
isMarginTradingAllowed: false,
filters: [
[Object], [Object],
[Object], [Object],
[Object], [Object],
[Object], [Object]
],
permissions: [ 'SPOT' ]
},
spot: true,
margin: false,
future: false,
delivery: false,
linear: false,
inverse: false,
expiry: undefined,
expiryDatetime: undefined,
active: true,
contractSize: undefined
}
