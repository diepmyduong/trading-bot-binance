#!/bin/bash 

echo "Đặt tên bot"
read botName
echo "Mã Asset:"
read asset
echo "Mã Base:"
read base
echo "Số vốn:"
read capital
echo "Khung thời gian lớn (1d)"
read tfLong
echo "Khung thời gian nhỏ (1h)"
read tfShort
# echo "API Key"
# read apiKey
# echo "API Secret"
# read apiSecret

BOT_NAME=${botName} \
ASSET=${asset} \
BASE=${base} \
CAPITAL=${capital} \
TF_LONG=${tfLong} \
TF_SHORT=${tfShort} \
pm2 start trade.js --name ${botName}