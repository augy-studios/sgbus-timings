import "./db.js";
import { refreshBusStops } from "./busStops.js";

const count = await refreshBusStops();
console.log(`Refreshed ${count} bus stops from LTA DataMall.`);
process.exit(0);
