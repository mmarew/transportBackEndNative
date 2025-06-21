// App.js
const cluster = require("cluster");
const getLocalIpAddress = require("./Utils/MyIpAddress.js");
const os = require("os");

const numCPUs = 1; //os.cpus().length;
console.log("@Total CPU Cores:", numCPUs);

if (cluster.isMaster) {
  console.log(`🧠 Master process started | PID: ${process.pid}`);

  for (let i = 0; i < numCPUs; i++) {
    const worker = cluster.fork();
    console.log(`🔧 Forked worker #${i + 1} | PID: ${worker.process.pid}`);
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(`💀 Worker PID: ${worker.process.pid} died. Restarting...`);
    const newWorker = cluster.fork();
    console.log(`🔁 Restarted new worker | PID: ${newWorker.process.pid}`);
  });
  getLocalIpAddress();
} else {
  console.log(`🚀 Worker process running | PID: ${process.pid}`);
  require("./Config/Worker.config.js"); // Start the server
}
