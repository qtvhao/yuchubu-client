import { schedulerManager } from "./schedulers.js"
import { workersManager } from "./workers.js"
schedulerManager.start([6, 59], [1, 5]);
workersManager.start();
