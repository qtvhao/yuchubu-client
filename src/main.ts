import { schedulerManager } from "./schedulers.js"
import { workersManager } from "./workers.js"
schedulerManager.start();
workersManager.start();
