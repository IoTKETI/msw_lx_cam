#!/usr/bin/sh

pm2 start captureImage.js -- $2
pm2 start geotagging.js
#pm2 start sendFTP.js -- $1 $2
#pm2 start sendHTTP.js -- $1 $2
